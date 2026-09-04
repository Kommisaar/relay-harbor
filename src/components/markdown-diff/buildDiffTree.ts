// 合并 MDAST 构建（patterns.md「修订对比」，diff方案.md markdown-unified-diff）。
// 把对齐结果生成一棵标准 MDAST：equal 采用新节点渲染一次；removed 采用
// 旧节点写 data-diff=removed；added 写 data-diff=added；paired（相似但
// 不可递归的块对，如段落微改）渲染为相邻删除+新增；相邻同向块共享
// data-diff-group。容器递归：同型列表递归 listItem——紧凑项（spread=false）
// 的内层段落会被 remark-rehype 解包、段落上的 data-diff 进不了 DOM，
// 故整项标删除+新增，有序列表以显式 value 保原序号，避免删除项扰乱
// 后续编号；表格列结构/对齐一致时递归 tableRow（单元格变化按整行前后
// 版本呈现，不做单元格级 diff）；同语言代码块 diffLines 行级比较，变更
// 代码节点写 data-diff-code 键供自定义 code renderer 查 CodeLineOp 表；
// blockquote 递归顶层块。HTML/图片/分隔线按原子节点处理。
import { diffArrays } from "diff";
import type { Blockquote, Code, List, ListItem, RootContent, Table } from "mdast";
import { visit } from "unist-util-visit";
import { alignBlocks, type BlockOp } from "./alignSequence";
import { semanticSignature } from "./normalizeNode";
import { parseMarkdown } from "./parseMarkdown";

export interface CodeLineOp {
  type: "equal" | "added" | "removed";
  text: string;
}

export interface DiffPlan {
  /** 合并后的顶层块序列（react-markdown 单实例渲染输入） */
  children: RootContent[];
  /** data-diff-code 键 → 代码行操作（自定义 code renderer 查表） */
  codeOps: Map<string, CodeLineOp[]>;
}

/** 构建 diff 计划；两文渲染语义完全一致时返回 null（走普通渲染短路） */
export function buildDiffPlan(beforeMd: string, afterMd: string): DiffPlan | null {
  const beforeRoot = parseMarkdown(beforeMd);
  const afterRoot = parseMarkdown(afterMd);
  const ops = alignBlocks(beforeRoot.children, afterRoot.children, isRecursableContainer);
  if (ops.every((op) => op.type === "equal")) {
    return null;
  }
  const ctx: MergeContext = { codeOps: new Map<string, CodeLineOp[]>(), codeKey: 0, groupKey: 0 };
  return { children: mergeOps(ops, ctx), codeOps: ctx.codeOps };
}

interface MergeContext {
  codeOps: Map<string, CodeLineOp[]>;
  codeKey: number;
  groupKey: number;
}

/** 可递归比较的兼容容器（其余相似块对仅配对为相邻删除+新增） */
function isRecursableContainer(a: RootContent, b: RootContent): boolean {
  if (a.type !== b.type) {
    return false;
  }
  switch (a.type) {
    case "table":
      return (
        b.type === "table" &&
        tableColumnCount(a) === tableColumnCount(b) &&
        alignsEqual(a.align ?? [], b.align ?? []) &&
        tableHeadersEqual(a, b)
      );
    case "code":
      return b.type === "code" && a.lang === b.lang && (a.meta ?? null) === (b.meta ?? null);
    case "list":
      return (
        b.type === "list" &&
        a.ordered === b.ordered &&
        (!a.ordered || (a.start ?? 1) === (b.start ?? 1)) &&
        (a.spread ?? false) === (b.spread ?? false)
      );
    case "blockquote":
      return true;
    default:
      return false;
  }
}

function tableColumnCount(table: Table): number {
  const firstRow = table.children[0];
  return firstRow?.children.length ?? 0;
}

function alignsEqual(x: NonNullable<Table["align"]>, y: NonNullable<Table["align"]>): boolean {
  return x.length === y.length && x.every((value, index) => (value ?? null) === (y[index] ?? null));
}

function tableHeadersEqual(a: Table, b: Table): boolean {
  const aHeader = a.children[0];
  const bHeader = b.children[0];
  return (
    aHeader !== undefined &&
    bHeader !== undefined &&
    semanticSignature(aHeader) === semanticSignature(bHeader)
  );
}

function nextGroup(ctx: MergeContext): string {
  ctx.groupKey += 1;
  return `dg-${ctx.groupKey}`;
}

function mark<T extends RootContent>(
  node: T,
  kind: "removed" | "added",
  group: string,
  extra?: Record<string, string> | undefined,
): T {
  const marked = {
    ...node,
    data: {
      ...node.data,
      hProperties: {
        ...node.data?.hProperties,
        "data-diff": kind,
        "data-diff-group": group,
        ...extra,
      },
    },
  } as T;
  if (kind === "removed") {
    // CSS pointer-events 只拦鼠标；给删除子树中的链接加程序化标记，由
    // MarkdownDiffBody 的 a renderer 去掉 href，避免键盘仍可激活旧链接。
    visit(marked, (link) => {
      if (link.type !== "link" && link.type !== "linkReference") {
        return;
      }
      link.data = {
        ...link.data,
        hProperties: {
          ...link.data?.hProperties,
          "data-diff-disabled-link": "true",
        },
      };
    });
  }
  return marked;
}

function mergeOps<T extends RootContent>(ops: readonly BlockOp<T>[], ctx: MergeContext): T[] {
  const out: T[] = [];
  let runKind: "removed" | "added" | null = null;
  let runGroup = "";
  for (const op of ops) {
    switch (op.type) {
      case "equal":
        out.push(op.node);
        runKind = null;
        break;
      case "removed":
      case "added": {
        if (runKind !== op.type) {
          runKind = op.type;
          runGroup = nextGroup(ctx);
        }
        out.push(mark(op.node, op.type, runGroup));
        break;
      }
      case "paired": {
        const group = nextGroup(ctx);
        out.push(mark(op.before, "removed", group), mark(op.after, "added", group));
        runKind = null;
        break;
      }
      case "changed":
        out.push(...mergeChanged(op.before, op.after, ctx));
        runKind = null;
        break;
    }
  }
  return out;
}

function mergeChanged<T extends RootContent>(before: T, after: T, ctx: MergeContext): T[] {
  switch (after.type) {
    case "list":
      return [mergeList(before as List, after, ctx) as T];
    case "table":
      return [mergeTable(before as Table, after, ctx) as T];
    case "blockquote": {
      const ops = alignBlocks((before as Blockquote).children, after.children, isRecursableContainer);
      const merged: Blockquote = { ...after, children: mergeOps(ops, ctx) as typeof after.children };
      return [merged as T];
    }
    case "tableRow": {
      // 单元格变化标整行前后版本（patterns.md「修订对比」），渲染为相邻删除+新增
      const group = nextGroup(ctx);
      return [mark(before, "removed", group), mark(after, "added", group)];
    }
    case "code":
      return [mergeCode(before as Code, after, ctx) as T];
    default:
      return mergeOps([{ type: "paired", before, after }], ctx);
  }
}

/** 表头/列结构已在 isRecursableContainer 中确认一致；仅递归正文行。 */
function mergeTable(before: Table, after: Table, ctx: MergeContext): Table {
  const header = after.children[0];
  const bodyOps = alignBlocks(before.children.slice(1), after.children.slice(1), () => true);
  const body = mergeOps(bodyOps, ctx) as Table["children"];
  return {
    ...after,
    children: header === undefined ? body : [header, ...body],
  };
}

/**
 * 列表合并：列表项序列逐项走 mergeOps 语义，同时维护前后版本各自的
 * 项位置——有序列表的删除/新增项写显式 value，浏览器从 value 续排，
 * 后续 equal 项不受增删项扰动（patterns.md「修订对比」）。
 */
function mergeList(before: List, after: List, ctx: MergeContext): List {
  const ops = alignBlocks(before.children, after.children, () => true);
  const items: ListItem[] = [];
  const ordered = after.ordered === true;
  const beforeStart = before.start ?? 1;
  const afterStart = after.start ?? 1;
  let beforePos = 0;
  let afterPos = 0;
  let runKind: "removed" | "added" | null = null;
  let runGroup = "";
  for (const op of ops) {
    switch (op.type) {
      case "equal":
        beforePos += 1;
        afterPos += 1;
        items.push(withListItemValue(op.node, afterStart + afterPos - 1, ordered));
        runKind = null;
        break;
      case "removed":
      case "added": {
        if (runKind !== op.type) {
          runKind = op.type;
          runGroup = nextGroup(ctx);
        }
        if (op.type === "removed") {
          beforePos += 1;
          items.push(markListItem(op.node, "removed", runGroup, beforeStart + beforePos - 1, ordered));
        } else {
          afterPos += 1;
          items.push(markListItem(op.node, "added", runGroup, afterStart + afterPos - 1, ordered));
        }
        break;
      }
      case "paired": {
        const group = nextGroup(ctx);
        beforePos += 1;
        afterPos += 1;
        items.push(
          markListItem(op.before, "removed", group, beforeStart + beforePos - 1, ordered),
          markListItem(op.after, "added", group, afterStart + afterPos - 1, ordered),
        );
        runKind = null;
        break;
      }
      case "changed": {
        beforePos += 1;
        afterPos += 1;
        items.push(
          ...mergeChangedListItem(
            op.before,
            op.after,
            ctx,
            beforeStart + beforePos - 1,
            afterStart + afterPos - 1,
            ordered,
          ),
        );
        runKind = null;
        break;
      }
    }
  }
  return { ...after, children: items };
}

/**
 * 单个列表项的变化呈现。紧凑项（spread=false）内层段落会被 remark-rehype
 * 解包，段落上的 data-diff 属性进不了 DOM（走查实测：新旧文本裸拼在同一
 * li 内、无任何标记），故整项标删除+新增；spread 项内层段落保留，可继续
 * 递归做块级标记。
 */
function mergeChangedListItem(
  before: ListItem,
  after: ListItem,
  ctx: MergeContext,
  beforeValue: number,
  afterValue: number,
  ordered: boolean,
): ListItem[] {
  if (
    !before.spread ||
    !after.spread ||
    (before.checked ?? null) !== (after.checked ?? null)
  ) {
    const group = nextGroup(ctx);
    return [
      markListItem(before, "removed", group, beforeValue, ordered),
      markListItem(after, "added", group, afterValue, ordered),
    ];
  }
  const ops = alignBlocks(before.children, after.children, isRecursableContainer);
  return [
    withListItemValue(
      { ...after, children: mergeOps(ops, ctx) as ListItem["children"] },
      afterValue,
      ordered,
    ),
  ];
}

/** 有序列表的增删项补显式 value（li 的合法属性），保持原序号呈现 */
function markListItem(
  node: ListItem,
  kind: "removed" | "added",
  group: string,
  value: number,
  ordered: boolean,
): ListItem {
  return mark(node, kind, group, ordered ? { value: String(value) } : undefined);
}

/** 合并后的有序列表每一项都钉住其目标版序号，删除项不会扰乱后续项。 */
function withListItemValue(node: ListItem, value: number, ordered: boolean): ListItem {
  if (!ordered) {
    return node;
  }
  return {
    ...node,
    data: {
      ...node.data,
      hProperties: {
        ...node.data?.hProperties,
        value: String(value),
      },
    },
  };
}

function mergeCode(before: Code, after: Code, ctx: MergeContext): Code {
  ctx.codeKey += 1;
  const key = `code-${ctx.codeKey}`;
  ctx.codeOps.set(key, codeLineOps(before.value, after.value));
  return {
    ...after,
    // value 保留新内容：renderer 查表失败时退化为整块新代码渲染
    value: after.value,
    data: { hProperties: { "data-diff-code": key, "data-diff-group": nextGroup(ctx) } },
  };
}

function codeLineOps(beforeValue: string, afterValue: string): CodeLineOp[] {
  const ops: CodeLineOp[] = [];
  // 自行按换行切 token 后交给 diffArrays：与 diffLines 的字符串 chunk
  // 再 split/pop 不同，这会保留末尾空行（空 token 也是合法代码行）。
  for (const change of diffArrays(beforeValue.split("\n"), afterValue.split("\n"))) {
    const kind = change.added ? "added" : change.removed ? "removed" : "equal";
    for (const text of change.value) {
      ops.push({ type: kind, text });
    }
  }
  return ops;
}
