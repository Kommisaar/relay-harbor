// CON-008 / ADR-007 机器校验：前端目录边界。
// 依赖单向：app → features → components/shared/api；跨层反向与跨 feature 引用一律禁止。
// invoke 唯一出口在 api/（@tauri-apps/api 不许出现在其他层）；generated 类型只经 api/ 再导出。
const { readdirSync } = require("node:fs");

// 跨 feature 规则按 src/features/ 实际目录动态生成（正则捕获组无法跨 from/to 共享）
const features = readdirSync("src/features", { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

module.exports = {
  forbidden: [
    {
      name: "no-reverse-app",
      comment: "app 是组合层，任何模块不得反向引用 src/app",
      severity: "error",
      from: { path: "^src/(features|components|api|stores)" },
      to: { path: "^src/app" },
    },
    ...features.map((name) => ({
      name: `no-cross-feature-${name}`,
      comment: "feature 之间不互相引用，共享一律上提 components/",
      severity: "error",
      from: { path: `^src/features/${name}` },
      to: { path: `^src/features/(?!${name}(/|$))` },
    })),
    {
      name: "shared-not-import-features",
      comment: "共享组件不得依赖 feature（保持可下沉/可复用）",
      severity: "error",
      from: { path: "^src/components" },
      to: { path: "^src/features" },
    },
    {
      name: "invoke-only-in-api",
      comment: "invoke 唯一出口在 api/（ADR-006/ADR-007）",
      severity: "error",
      from: { pathNot: "^src/api" },
      to: { dependencyTypes: ["npm"], path: "^@tauri-apps/api($|/)" },
    },
    {
      name: "generated-only-via-api",
      comment: "tauri-specta 产物只经 api/ 再导出，业务代码不直接 import generated",
      severity: "error",
      from: { pathNot: "^src/api" },
      to: { path: "^src/api/generated" },
    },
    {
      name: "no-fluent-v8",
      comment: "禁 Fluent UI v8 包（ADR-007）",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm"], path: "^@fluentui/react$" },
    },
    {
      name: "no-tailwind",
      comment: "样式统一 Griffel + tokens，禁 Tailwind（ADR-007）",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm"], path: "^tailwind" },
    },
    {
      name: "no-editor-dnd-graph",
      comment: "只读定位：禁编辑器（CodeMirror）与 dnd；@xyflow 待 M2（ADR-007）",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm"], path: "^(@codemirror|@dnd-kit|@xyflow)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ["exports", "main"], extensions: [".ts", ".tsx", ".js", ".jsx"] },
  },
};
