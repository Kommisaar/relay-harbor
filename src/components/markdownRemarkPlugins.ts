// MarkdownBody 与 Markdown Diff 解析共享的纯 remark 配置。独立于 React /
// Fluent 组件，使 AST 算法可在 Node 测试和构建工具中直接加载。
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";

export const markdownRemarkPlugins: PluggableList = [remarkGfm];
