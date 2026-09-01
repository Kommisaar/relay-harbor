# AGENTS.md — RelayHarbor 工作区准则

## 项目是什么

AI 辅助开发工件管理桌面应用（Tauri 2 + React 19 + Fluent UI v9 + Vite 6 + TypeScript strict）。
**Agent 经 MCP 写入（唯一业务写入口）、UI 纯只读、确定性 Markdown 导出。**

## 设计文档是基线（先查设计再改码）

- [`docs/design/`](docs/design/README.md)（00 概览 → 06 验证）已全部确认，是实现依据。
- 实现前先读对应阶段文档；代码注释里的 `FR-*` / `UC-*` / `UI-*` / `CON-*` / `ADR-*` 编号都指向设计文档，改动行为前先溯源。
- 新需求先修订设计再动码；偏差在代码注释/文档中留痕。

## 常用命令

```bash
npm run dev          # 仅前端（浏览器 + mock IPC），端口 1420（Tauri 约定，strictPort，勿改）
npm run tauri dev    # 桌面开发模式（debug 构建自动导出 src/api/generated/bindings.ts）
npm run check        # CI 同款全量校验：typecheck + lint:deps + lint:whitelist + lint:ipc + lint:rust-boundaries
```

Rust 侧（`src-tauri/`）：`cargo test`（含 export_ts_bindings，刷新前端类型绑定后需提交）、`cargo clippy --all-targets -- -D warnings`。

## 机器强制边界（改结构/加依赖前必读）

- **目录边界**（`.dependency-cruiser.cjs`）：依赖单向 `app → features → components/shared/api`；feature 之间禁止互相引用，共享一律上提 `src/components/`；**invoke/`@tauri-apps/api` 只允许出现在 `src/api/`**；`api/generated` 类型只经 `src/api/` 再导出。
- **依赖白名单**：package.json 新增任何依赖必须同步加入 `config/dependency-whitelist.json`。
- **IPC 白名单**：新注册命令必须加入 `config/ipc-command-whitelist.json`；业务写前缀命令禁止（UI 只读）。
- **Rust 分层**：`interfaces → services → domain ← infra`；domain/services 禁 tauri/sqlx/axum；禁 mod.rs。
- TS 开启 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`，索引访问需兜底、可选属性赋值需显式 undefined 处理。

## Griffel（Fluent UI v9 样式）已知坑

1. **合并多个 Griffel 样式结果必须用 `mergeClasses(a, b)`，严禁模板字符串拼接**（`` `${a} ${b}` ``）。Griffel 每个返回值带内部序列标识，拼接后 `mergeClasses` 只识别第一个序列，**后续整套类被静默丢弃**（typecheck 不报错、页面不崩、控制台才有警告）。
2. 不要用 `@media (prefers-reduced-motion)` 内嵌 `:hover` 覆盖 transform：Griffel 的 @media 桶插在 :hover 桶之后，同特异性下会完全压掉 hover 效果。

## 前端约定

- 全局盒模型 `box-sizing: border-box`（`src/styles.css`）：显式尺寸即最终占位，裸元素勿再逐个声明（约定详见 `docs/design/05-detailed-design/ui/patterns.md`「盒模型」）。
- 所有 UI 文案走 react-i18next（`src/i18n/`），主中文，禁止硬编码文案。
- 纯浏览器开发（`npm run dev`）时 Tauri invoke 不可用，依赖 `src/api/mock/` 提供数据；api 层接口保持可 mock。
- 卡片 hover 浮起用共享 hook `src/components/useCardLiftStyles.ts`；表单容器卡片刻意不加（避免填写时跳动）。
- 图表用 @ant-design/charts，主题 `classic`/`classicDark` 随 `useResolvedTheme` 切换。

## 调试注意

- Vite 不打印请求日志；Tauri WebView 与浏览器行为差异要分别验证。
- 共享 hook 的 React hooks 数量一旦变化，Fast Refresh 会以 hooks 错位崩溃（`updateReducerImpl ... reading 'next'`），整页刷新才能恢复；崩溃后该页面的 HMR 通道可能静默失效，后续热更新收不到——改完代码务必整页刷新验证。
