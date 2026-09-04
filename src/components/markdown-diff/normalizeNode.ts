// 语义规范化（patterns.md「修订对比」，diff方案.md markdown-unified-diff）。
// 输入树已在 parseMarkdown 剥除 position/data；本模块产出确定性语义
// 签名：仅按节点类型 + 影响渲染的结构属性（层级/列表属性/链接目标/
// 表格对齐/代码语言）+ 正文递归序列化——渲染语义相同（如 *x* 与 _x_、
// 列表符号差异）签名即相等；纯文本不作相等依据，仅供配对相似度。
import { toString as mdastToString } from "mdast-util-to-string";
import type { ListItem, PhrasingContent, RootContent, RowContent } from "mdast";

/** 对齐与合并涉及的节点全集（顶层块、列表项、表格行、行内内容） */
export type DiffNode = RootContent | ListItem | RowContent | PhrasingContent;

export function semanticSignature(node: DiffNode): string {
  return JSON.stringify(semanticValue(node));
}

export function plainText(node: DiffNode): string {
  return mdastToString(node);
}

function semanticValue(node: DiffNode): unknown {
  switch (node.type) {
    case "heading":
      return { t: node.type, depth: node.depth, c: node.children.map(semanticValue) };
    case "list":
      return {
        t: node.type,
        ordered: node.ordered,
        start: node.ordered ? (node.start ?? 1) : null,
        spread: node.spread ?? null,
        c: node.children.map(semanticValue),
      };
    case "listItem":
      return {
        t: node.type,
        checked: node.checked ?? null,
        spread: node.spread ?? null,
        c: node.children.map(semanticValue),
      };
    case "table":
      return { t: node.type, align: (node.align ?? []).map((value) => value ?? null), c: node.children.map(semanticValue) };
    case "code":
      return { t: node.type, lang: node.lang ?? null, meta: node.meta ?? null, value: node.value };
    case "link":
      return { t: node.type, url: node.url, title: node.title ?? null, c: node.children.map(semanticValue) };
    case "image":
      return { t: node.type, url: node.url, title: node.title ?? null, alt: node.alt ?? null };
    case "text":
      // 普通 HTML 文本会折叠 ASCII 空白；软换行、连续空格等仅源码
      // 排版变化不应触发“渲染语义”差异。NBSP 不在此归一化范围内。
      return { t: node.type, value: node.value.replace(/[ \t\r\n\f]+/gu, " ") };
    case "html":
    case "inlineCode":
    case "yaml":
      return { t: node.type, value: node.value };
    case "thematicBreak":
    case "break":
      return { t: node.type };
    default:
      // paragraph/emphasis/strong/delete/blockquote/tableRow/tableCell 等：
      // 渲染语义 = 类型 + 子树
      return "children" in node
        ? { t: node.type, c: node.children.map(semanticValue) }
        : { t: node.type };
  }
}
