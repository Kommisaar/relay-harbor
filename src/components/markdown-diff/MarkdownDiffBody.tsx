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
import { markdownRemarkPlugins } from "../MarkdownBody";
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
    () => (plan ? [createTreeInjectPlugin(plan.children)] : markdownRemarkPlugins),
    [plan],
  );
  const components = useMemo<Components>(() => ({ code: createCodeRenderer(plan?.codeOps) }), [plan]);
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
    const rawKey = props.node?.properties?.["data-diff-code"];
    const ops = typeof rawKey === "string" ? codeOps?.get(rawKey) : undefined;
    if (ops === undefined || ops.length === 0) {
      return <code className={props.className}>{props.children}</code>;
    }
    return (
      <code className={props.className}>
        {ops.map((op, index) => {
          const text = op.text.length > 0 ? op.text : "\u200B";
          return op.type === "equal" ? (
            <span key={index} className="md-diff-line">
              {text}
            </span>
          ) : (
            <span key={index} className="md-diff-line" data-diff={op.type}>
              {text}
            </span>
          );
        })}
      </code>
    );
  };
}
