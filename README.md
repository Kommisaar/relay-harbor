# RelayHarbor

AI 辅助开发工件管理桌面应用：Agent 经 MCP 写入（唯一业务写入口）、UI 纯只读、确定性 Markdown 导出。

**设计基线**：[`docs/design/`](docs/design/README.md)（00 概览 → 06 验证，2026-08-27 全部确认）。实现前先读对应阶段文档；偏差留痕、新需求先修订设计。

## 开发

```bash
npm install          # 安装前端依赖（先过 config/dependency-whitelist.json）
npm run tauri dev    # 开发模式（debug 构建自动导出 api/generated/bindings.ts）
npm run check        # 全部机器校验（CI 同款）
```

Rust 侧（`src-tauri/`）：

```bash
cargo test           # 含 export_ts_bindings：刷新前端类型绑定后提交
cargo clippy --all-targets -- -D warnings
```

## 机器校验防线（CON-008/009，CI 保持绿色）

| 防线 | 命令 | 强制内容 |
| --- | --- | --- |
| TypeScript 最严 | `npm run typecheck` | strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes 等 |
| 目录边界（前端） | `npm run lint:deps` | app → features → components/shared/api 单向；invoke 只在 api/；禁 v8/Tailwind/编辑器/dnd |
| 依赖白名单 | `npm run lint:whitelist` | package.json ⊆ config/dependency-whitelist.json |
| IPC 只读边界 | `npm run lint:ipc` | 已注册命令 ⊆ config/ipc-command-whitelist.json，业务写前缀禁止 |
| 分层边界（Rust） | `npm run lint:rust-boundaries` | domain/services 禁 tauri/sqlx/axum；依赖方向 interfaces → services → domain ← infra；禁 mod.rs |

CI：`.github/workflows/ci.yml`（前端 ubuntu + Rust windows）。

## 结构速览

```
src/                前端（React + Fluent v9 + TanStack Query + Zustand）
  app/              组合层：router、providers（data-changed 唯一监听点）
  api/              invoke 唯一出口 + generated/（tauri-specta 产物，提交入库）
  features/         projects / design / tasks / search / export / settings
src-tauri/          Rust 单 crate（ADR-008），四层：
  src/domain/       实体与规则（纯逻辑，无 IO）
  src/services/     读路径 / 写路径 / 导出编排
  src/interfaces/   ipc（只读命令）/ http（本地 MCP API）/ events（data-changed）
  src/infra/        storage（sqlx+SQLite）/ runtime
  src/state.rs      组合根
  migrations/       sqlx 迁移（时间戳序、只向前）
```

mcp-bridge（CMP-008，独立构建单元、随 Plugin 分发）不在本脚手架内——实现语言待 Plugin 联定（契约已冻结，见 docs/design/05-detailed-design/modules/bridge.md）。
