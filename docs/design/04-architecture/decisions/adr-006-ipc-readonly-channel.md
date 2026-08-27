# ADR-006 UI 经 Tauri IPC 只读命令通道访问数据

- 状态：已接受（随 04 架构基线确认；2026-08-27 定位修订的直接产物）
- 驱动因素：CON-009、FR-008～014、NFR-008、UC-010～016

## 背景

UI 定位只读 + 导出。问题是：前端取数走哪条通道——复用本地 MCP HTTP API，
还是 Tauri IPC 命令。

## 候选方案

- **Tauri IPC 只读命令**（`interfaces/ipc` 暴露查询、导出与设置命令，
  tauri-specta 生成 TS 类型）；
- UI 走本地 MCP HTTP API：通道统一，但 UI 需要令牌与 MCP 协议栈（WebView
  内保管令牌反而扩大暴露面），失去 specta 类型链，且工具集为 Agent 语义
  （expected_revision 等）对 UI 无意义；
- UI 直连 SQLite：被 CON-003 与四层规则双重禁止，仅列作对照。

## 决策

UI 一切数据经 `interfaces/ipc` 的 Tauri 命令获取：命令面为**查询、导出、
应用设置**三类，无任何业务写命令（CON-009）；DTO 由 tauri-specta 生成；
命令直接调用 services 读路径。

数据新鲜度采用**事件失效 + 聚焦兜底**：MCP 写工具在 ChangeSet 提交成功
后（interfaces/http 层）以 Tauri event 广播 `data-changed`（payload：
project_id、变更类别、新修订号）；前端全局监听并按项目前缀
`invalidateQueries(["projects", projectId, ...])`，活跃查询自动重新拉取。
事件只承载失效信号不承载数据——UI 仍经只读命令取数，只读边界不变；
`refetchOnWindowFocus` 保留，覆盖事件丢失场景（应用重启、监听晚注册）。

## 主要理由

- 只读边界可机器校验：ipc 命令白名单 lint（写命令名单为空）进 CI，
  契合 CON-008；
- 进程内受信调用无需令牌/鉴权栈，`interfaces/ipc` 与 `interfaces/http`
  各自独立 DTO（分层规则），互不污染；
- 类型链完整：Rust DTO → specta → 前端 generated，手抄类型为零。

## 代价与后果

- 读路径存在 ipc 与 http 两个入站适配（分层规则已预期此代价）；
- 事件为尽力送达（无持久化）：极端情况下 UI 陈旧至下次聚焦/手动刷新；
- 发射点依赖"每个写入口都记得 emit"——M1 仅 http 一个入口，未来 ipc
  恢复写命令时同模式补发射（若入口增多再上移为 services 层统一钩子）。

## 验证或重新评估条件

- CI：ipc 命令白名单 lint；
- 重新评估触发：未来恢复管理 UI 时（CON-009 重评），命令面整体重议。
