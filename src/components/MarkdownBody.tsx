// Markdown 正文共享渲染（patterns.md「Markdown 正文」，2026-09-02 自条目详情
// 升为共享模式；消费方：条目详情 UI-017、项目概览 UI-035）。
// remark-gfm：维护型文档常含表格/删除线等 GFM 语法，react-markdown v10
// 裸用不解析（白名单 2026-09-02 准入）。
// 样式例外留痕：react-markdown 生成的子元素集合开放，Griffel 无法逐一建样式，
// 排版走 src/styles.css 作用域类 .md-body（全局样式的刻意例外）；
// 组件内 Griffel 只承担行高口径。模板串仅含一个 Griffel 结果 + 静态类，
// 不触 AGENTS.md「多 Griffel 结果禁拼接」坑。
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { makeStyles } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: { lineHeight: 1.7 },
});

/** Markdown 只读正文（CON-009，无编辑形态） */
export function MarkdownBody({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <div className={`md-body ${styles.root}`}>
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}
