# 约束

> 状态：草稿（2026-08-27 定位修订：CON-004 移除编辑器依赖、CON-007 重写、新增 CON-009）

## CON-001 产品形态

- 状态：已确认
- 约束：Tauri v2 桌面应用，WebView 前端 + Rust 核心；应用承载领域服务、存储与界面
- 来源：00 概览已确认方向
- 影响：决定整个技术栈与进程模型
- 可否重新评估：否（产品根基）

## CON-002 四层 DDD 架构

- 状态：已确认
- 约束：后端按 Interfaces/Services/Domain/Infra 分层，依赖方向 `interfaces → services → domain ← infra`；domain 不依赖 tauri/sqlx/axum；Storage 端口定义在 domain，实现在 infra
- 来源：技术方案评审（《project structure.md》）
- 影响：模块边界、依赖规则、未来抽 crate 与 Remote Server 宿主
- 可否重新评估：局部可（04 架构阶段可细化，方向不可逆）

## CON-003 数据与存储

- 状态：已确认
- 约束：M1 仅 SQLite，单一数据库 `~/.relayharbor/harbor.db`，sqlx 访问，WAL；应用设置存 `~/.relayharbor/settings.json`；数据库只由应用进程写入；PostgreSQL 仅随未来 Remote Server 出现
- 来源：OQ-003 结论 + 技术方案评审
- 影响：存储设计、备份策略、路径解析
- 可否重新评估：数据位置与单库决策可复议（04 前），存储技术不可逆

## CON-004 前端技术栈

- 状态：已确认
- 约束：React + TypeScript（严格模式）+ Vite + Fluent UI v9（禁 v8 包）+ TanStack Query（服务端状态）+ Zustand（UI 状态）；类型由 tauri-specta 从后端 DTO 生成。UI 定位只读，不引入编辑器组件（2026-08-27 修订，移除原 CodeMirror 6 依赖）
- 来源：技术选型讨论（2026-08-27）
- 影响：依赖白名单、组件与状态管理方式
- 可否重新评估：组件库可替换（成本高），架构性依赖不可逆

## CON-005 平台策略

- 状态：已确认
- 约束：Windows 优先首发；前端不使用 Chromium 独占 Web API（必要时特性检测）；平台相关代码仅限 infra
- 来源：OQ-005 结论
- 影响：WebView 兼容面、测试矩阵
- 可否重新评估：是（新增平台时）

## CON-006 应用行为

- 状态：已确认
- 约束：单实例；关闭主窗口默认隐藏到托盘（可配置为退出）；显式退出是唯一销毁路径
- 来源：00 概览 + 技术讨论
- 影响：FR-015、FR-016
- 可否重新评估：是（行为默认值可调）

## CON-007 M1 排期边界

- 状态：已确认（2026-08-27 修订）
- 约束：M1 定位为"Agent 经 MCP 写入 + UI 只读与 Markdown 导出"：本地 API、mcp-bridge、MCP 工具集与版本握手随 M1 交付（原排 M2）；Markdown/JSON 确定性导入与基线快照、基线确认与变更集 UI、关系图可视化、JSON 导出仍排 M2
- 来源：2026-08-27 范围裁剪 + 同日定位修订
- 影响：需求编号与排期、interfaces/http 提前实现、安全边界（回环 + 令牌）
- 可否重新评估：是（裁剪项可提前）

## CON-008 开发协作方式

- 状态：已确认
- 约束：代码主要由编码 Agent 产出，人类不逐行审阅；质量防线必须机器可校验——TypeScript 最严模式、tauri-specta 契约生成、依赖白名单、目录边界 lint（dependency-cruiser 或等价物）进 CI
- 来源：用户工作模式声明
- 影响：CI 设计、目录与命名纪律的强制程度
- 可否重新评估：否（协作模式前提）

## CON-009 UI 只读边界

- 状态：已确认
- 约束：UI 不产生任何业务数据写入：interfaces/ipc 不暴露业务写命令，前端不调用任何写路径；例外仅为应用设置与窗口状态（非业务数据）
- 来源：2026-08-27 定位修订（用户确认"UI 只读和导出，暂无管理预期"）
- 影响：ipc 命令面、前端 API 层形态、依赖面（无编辑器）
- 可否重新评估：是（未来恢复管理 UI 时整体重评）
- 备注：机器可校验——ipc 命令白名单 lint（业务写命令名单为空）。
