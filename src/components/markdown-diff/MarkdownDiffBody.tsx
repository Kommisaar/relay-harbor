// 修订对比单栏渲染（patterns.md「修订对比」，diff方案.md markdown-unified-diff）。
// 单个 react-markdown 实例：自定义 remark 插件把解析树替换为 buildDiffPlan
// 的合并 MDAST（保持文档上下文、列表连续性；不按空行切 Markdown、不为
// 片段起独立渲染器）；代码块由自定义 code renderer 按 DiffPlan 行操作输出
// 块级 span（未标记节点走默认渲染）。算法组件不感知页面交互——props 仅
// before/after 两字符串。渲染语义完全一致时短路走普通渲染（与 MarkdownBody
// 同口径）。排版复用 .md-body，diff 标记样式在 .md-diff-body（styles.css
// 全局作用域类，同 .md-body 先例）。
import { useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import { makeStyles } from "@fluentui/react-components";
import type { Pluggable } from "unified";
import type { Root, RootContent } from "mdast";
import { markdownRemarkPlugins } from "../markdownRemarkPlugins";
import { buildDiffPlan, type CodeLineOp } from "./buildDiffTree";

const useStyles = makeStyles({
  root: { lineHeight: 1.7 },
});

export interface MarkdownDiffBodyProps {
  before: string;
  after: string;
}

export function MarkdownDiffBody({ before, after }: MarkdownDiffBodyProps) {
  const styles = useStyles();
  const plan = useMemo(() => buildDiffPlan(before, after), [before, after]);
  const remarkPlugins = useMemo(
    // 注入合并树时仍要挂 GFM：remark-gfm 同时注册 mdast→hast 的表格等
    // 处理器；只挂 inject 会让合并树里的 table 节点按未知块丢掉。
    () =>
      plan ? [...markdownRemarkPlugins, createTreeInjectPlugin(plan.children)] : markdownRemarkPlugins,
    [plan],
  );
  const components = useMemo<Components>(
    () => ({ code: createCodeRenderer(plan?.codeOps), a: DiffLink, table: DiffTable }),
    [plan],
  );
  return (
    <div className={`md-body md-diff-body ${styles.root}`}>
      <Markdown remarkPlugins={remarkPlugins} components={components}>
        {after}
      </Markdown>
    </div>
  );
}

/** remark 插件：解析完成后整树替换为合并 MDAST（before/after 中挑 after
    作为解析占位，其内容随即被丢弃） */
function createTreeInjectPlugin(children: RootContent[]): Pluggable {
  const plugin = () => (tree: unknown) => {
    (tree as Root).children = children as Root["children"];
  };
  return plugin as Pluggable;
}

function createCodeRenderer(codeOps: Map<string, CodeLineOp[]> | undefined): NonNullable<Components["code"]> {
  return function DiffCode(props) {
    const { node, children, ...rest } = props;
    const rawKey = node?.properties?.["data-diff-code"];
    const ops = typeof rawKey === "string" ? codeOps?.get(rawKey) : undefined;
    if (ops === undefined || ops.length === 0) {
      // 必须透传 data-diff/data-diff-group：整块代码增删或语言变化不走
      // codeOps，旧实现仅传 className 导致核心差异标记静默丢失。
      return <code {...rest}>{children}</code>;
    }
    return (
      <code {...rest}>
        {ops.map((op, index) => {
          return op.type === "equal" ? (
            <span
              key={index}
              className="md-diff-line"
              data-empty-line={op.text.length === 0 ? "true" : undefined}
            >
              {op.text}
            </span>
          ) : (
            <span
              key={index}
              className="md-diff-line"
              data-diff={op.type}
              data-empty-line={op.text.length === 0 ? "true" : undefined}
            >
              {op.text}
            </span>
          );
        })}
      </code>
    );
  };
}

/** 删除内容中的链接降为普通文本：去掉 href，也不再进入 Tab 序列。 */
const DiffLink: NonNullable<Components["a"]> = (props) => {
  const { node, children, href, target, rel, ...rest } = props;
  const disabled = node?.properties?.["data-diff-disabled-link"] === "true";
  return disabled ? (
    <span {...rest}>{children}</span>
  ) : (
    <a {...rest} href={href} target={target} rel={rel}>
      {children}
    </a>
  );
};

/** 整表增删需用普通块容器承载标记；直接给 table 加 ::before 会生成
    匿名表格盒，给 tr 加则会挤出额外列。行级标记仍留在 tr 上由 CSS 处理。 */
const DiffTable: NonNullable<Components["table"]> = (props) => {
  const { node, children, ...rest } = props;
  const kind = node?.properties?.["data-diff"];
  const group = node?.properties?.["data-diff-group"];
  if (kind !== "removed" && kind !== "added") {
    return <table {...rest}>{children}</table>;
  }
  return (
    <div
      className="md-diff-table-block"
      data-diff={kind}
      data-diff-group={typeof group === "string" ? group : undefined}
    >
      <table>{children}</table>
    </div>
  );
};
