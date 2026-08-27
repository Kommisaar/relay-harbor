# ADR-007 前端技术栈：React + TS + Fluent UI v9 + TanStack Query + Zustand

- 状态：已接受（随 04 架构基线确认；自技术选型讨论转正，按只读定位修订）
- 驱动因素：CON-004、CON-008、CON-009、NFR-008、FR-008～014

## 背景

用户不写前端代码，全部由编码 Agent 产出；UI 定位只读 + 导出（无编辑、
无拖拽）。选型要最大化 Agent 生成质量与机器可校验性。

## 候选方案

- **React 生态**（React + TypeScript 严格模式 + Vite + Fluent UI v9 +
  TanStack Query + Zustand + tauri-specta 类型链）；
- Vue 3 + Element Plus/其他：技术上也成立（vue-flow 可承载关系图），
  但训练语料与生态示例密度低于 React，Agent 生成偏离最佳实践的概率
  更高；
- Svelte/Solid 等：语料与组件库生态进一步收窄。

## 决策

采用 React 方案。约束：组件库只用 `@fluentui/react-components`（v9，
禁 v8 包 `@fluentui/react`）；样式统一 Griffel + design tokens，禁
Tailwind 与第二组件库；服务端状态只归 TanStack Query（每 feature 的
`queries.ts`），Zustand 只放 UI 状态；类型一律来自 `api/generated`
（tauri-specta 产物，禁手抄）；`invoke` 只出现在 `api/`；依赖单向
`app → features → components/shared/api`；feature 内部结构固定
（components / hooks / queries / types / index），测试 colocate。
**只读定位下的依赖裁剪（2026-08-27）**：不引入 CodeMirror（无编辑）、
不引入 dnd-kit（看板无拖拽）；@xyflow（关系图）推迟到 M2 引入。

## 主要理由

- Agent 语料密度决定生成质量，React + TS 严格模式的可校验性最强
  （CON-008）；
- Fluent UI v9 满足用户偏好（Fluent Design）且 Griffel/tokens 体系
  完整支撑深浅主题（NFR-008）；
- TanStack Query 的缓存失效模型天然匹配"Agent 写、UI 读"的陈旧数据
  场景（refetchOnWindowFocus / 手动刷新）。

## 代价与后果

- Fluent v9 生态小于 Ant/MUI，个别复杂组件需自组合；
- v8/v8-legacy 包名混淆风险靠依赖白名单封死。

## 验证或重新评估条件

- CI：依赖白名单（禁 v8、禁 Tailwind、禁编辑器/dnd 库）、目录边界
  lint（dependency-cruiser 或等价物）、TS 最严模式；
- 重新评估触发：组件库无法满足 M2 关系图需求时局部重议 @xyflow。
