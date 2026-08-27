# 接口清单

> 状态：草稿
> 关联：CMP-001～008、UC-001～018

架构级接口；字段与消息结构留待 05 详细设计。

## INT-001 Tauri IPC 只读命令通道

- 提供方：CMP-002
- 使用方：CMP-001（前端 `api/` 层）
- 目的：UI 获取项目/条目/关系/任务/修订数据、触发导出、读写应用设置
- 交互方式：同步（invoke）
- 协议或格式：Tauri IPC + JSON；DTO 类型由 tauri-specta 生成
  （`api/generated`，禁手抄）
- 身份与授权：进程内受信，无鉴权；命令面 = 查询/导出/设置三类，
  **无业务写命令**（CON-009，白名单 lint 强制）
- 一致性与幂等：全部只读幂等；导出为纯读 + 文件写出
- 数据新鲜度：**反向事件通道**——interfaces/http 写工具成功后经 Tauri
  event 广播 `data-changed`（project_id、变更类别、新修订号），前端全局
  监听并按项目前缀失效查询，重新经本通道拉取；事件只失效不传数据，
  refetchOnWindowFocus 兜底
- 超时、重试和失败语义：查询失败前端提示并允许重试（TanStack Query）
- 兼容策略：DTO 变更经 specta 重新生成，类型不匹配在构建期暴露；事件
  payload 为 specta 类型，新增字段向后兼容
- 关联：UC-010～018、NFR-008、ADR-006

## INT-002 本地 MCP HTTP API

- 提供方：CMP-003
- 使用方：CMP-008（mcp-bridge）
- 目的：Agent 的唯一业务读写通道——MCP 工具（读取、检索、变更集原子
  提交、状态迁移、验证）
- 交互方式：同步请求/响应（MCP Streamable HTTP）
- 协议或格式：MCP 协议（Streamable HTTP 传输），JSON
- 身份与授权：仅回环绑定；每会话随机令牌（Bearer）；连接时版本握手
  （Plugin/应用/Schema，不兼容明确报错）
- 一致性与幂等：写入经 ChangeSet 原子提交 + 期望修订号（BR-005）；
  重复同号请求返回冲突而非重复生效
- 超时、重试和失败语义：失败返回明确原因（规则拒绝/冲突/内部错误）；
  调用方重试需先取最新修订号
- 兼容策略：MCP 协议版本握手 + 工具级最低版本；工具新增不破坏既有
- 关联：UC-001～009、FR-001、NFR-005、NFR-009、ADR-004

## INT-003 MCP stdio 通道

- 提供方：CMP-008（bridge 作为 MCP Server 面）
- 使用方：ACT-002 的 MCP 客户端（dev-toolkit Plugin 配置）
- 目的：以标准 stdio transport 暴露 MCP 能力，屏蔽应用进程细节
- 交互方式：MCP stdio（JSON-RPC over stdin/stdout）
- 协议或格式：MCP 协议 stdio 传输
- 身份与授权：无（本地进程边界；上行鉴权在 INT-002 由 bridge 注入令牌）
- 一致性与幂等：透传，语义同 INT-002
- 超时、重试和失败语义：应用不可达时 bridge 自动拉起重连（UC-009 A1）；
  令牌失效自动重发现（A2）；无法恢复时向客户端返回明确错误
- 兼容策略：随 MCP 协议版本；Plugin 与 bridge 同源分发
- 关联：UC-009、ADR-005

## INT-004 存储端口（domain 定义，infra 实现）

- 提供方：CMP-005（trait 定义）；CMP-006（SQLite 实现）
- 使用方：CMP-004（services）
- 目的：意图级原子操作（apply_change_set、transition_item 等），
  事务为 infra 内部细节
- 交互方式：进程内同步调用
- 协议或格式：Rust trait；领域类型（不出现 sqlx 类型）
- 身份与授权：无（进程内）；actor 经 ChangeSet 字段传递用于审计
- 一致性与幂等：每方法单 SQL 事务；OCC 与修订审计在事务内
- 超时、重试和失败语义：busy_timeout 处理写冲突；失败即整体回滚并
  返回领域错误
- 兼容策略：端口演进 = 新增具名方法（ADR-002）；远程实现（rh-storage-pg）
  未来实现同一 trait
- 关联：ADR-002、ADR-003、NFR-009

## INT-005 bridge.json 发现文件

- 提供方：CMP-007（应用启动/令牌轮换时写出）
- 使用方：CMP-008（bridge 启动时读取）
- 目的：引导 bridge 找到本地 API（端口 + 令牌 + pid + 协议版本）
- 交互方式：文件
- 协议或格式：JSON；位置 `~/.relayharbor/runtime/bridge.json`
- 身份与授权：文件权限仅当前用户可读写；令牌每会话轮换
- 一致性与幂等：原子替换写（临时文件 + rename）；bridge 读旧文件失效
  即重发现
- 超时、重试和失败语义：文件缺失/过期 → bridge 走拉起流程（UC-009 A1/A2）
- 兼容策略：含格式版本字段；新增字段向后兼容
- 关联：UC-009、NFR-005、ADR-005

## INT-006 导出文件产物

- 提供方：CMP-007（写出）、CMP-004（编排与确定性格式）
- 使用方：ACT-001（开发者归档/审查）；未来 M2 导入例程
- 目的：Markdown 文档集（目录或 zip），dev-toolkit 体系兼容的只读快照
- 交互方式：文件（一次性生成）
- 协议或格式：Markdown（固定结构与排序，domain/snapshot.rs 定义规则）
- 身份与授权：用户选择的任意可写路径
- 一致性与幂等：导出时点的数据快照；同数据重复导出结果一致（FR-014）
- 超时、重试和失败语义：失败不污染库；已写部分在错误提示中说明
- 兼容策略：M2 导入按同一确定性格式逆向解析
- 关联：UC-016、FR-014、OQ-001
