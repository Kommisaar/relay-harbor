// MDAST 解析（patterns.md「修订对比」，diff方案.md markdown-unified-diff）。
// 与 MarkdownBody 共享同一套 remark 插件（GFM 口径一致，否则表格等
// GFM 块在普通视图与 diff 视图语义不一致）。
// 解析后立即做两件事，均为后续树合并的前置：
// 1. 引用自包含化：linkReference/imageReference 按各自 definition 解析为
//    link/image——两棵树合并时 identifier 同名会互相覆盖；
// 2. 剥 position/data 并丢弃 definition 节点（不参与渲染，也不应参与
//    语义相等判定——定义块不同但渲染等价的文档不算差异）。
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import type { Content, Definition, ImageReference, LinkReference, Root, RootContent } from "mdast";
import { markdownRemarkPlugins } from "../MarkdownBody";

const parser = unified().use(remarkParse).use(markdownRemarkPlugins);

/** 解析 Markdown 为 MDAST（无 position/data，引用已自包含化） */
export function parseMarkdown(md: string): Root {
  const root = parser.parse(md) as Root;
  stripMetadata(root);
  inlineReferences(root);
  return root;
}

function stripMetadata(root: Root): void {
  visit(root, (node) => {
    delete node.position;
    delete node.data;
  });
}

function collectDefinitions(root: Root): Map<string, Definition> {
  const map = new Map<string, Definition>();
  for (const child of root.children) {
    if (child.type === "definition") {
      map.set(child.identifier, child);
    }
  }
  return map;
}

function inlineReferences(root: Root): void {
  const definitions = collectDefinitions(root);
  const resolve = (node: LinkReference | ImageReference): string =>
    definitions.get(node.identifier)?.url ?? "";
  const walk = (content: Content): Content => {
    if (content.type === "linkReference") {
      return {
        type: "link",
        url: resolve(content),
        children: content.children.map(walk) as typeof content.children,
      };
    }
    if (content.type === "imageReference") {
      return { type: "image", url: resolve(content), alt: content.alt ?? null };
    }
    if ("children" in content) {
      content.children = content.children.map(walk) as typeof content.children;
    }
    return content;
  };
  root.children = root.children
    .filter((child) => child.type !== "definition")
    .map((child) => walk(child) as RootContent);
}
