# ADR-004 本地 API 直接承载 MCP 协议（Streamable HTTP）

- 状态：已接受（随 04 架构基线确认；2026-08-27 定位修订的必然推论）
- 驱动因素：FR-001、NFR-005、OQ-004、UC-009、CON-007

## 背景

M1 起业务写入唯一入口是 MCP（Agent）。需要一个本地通道连接 mcp-bridge
（stdio↔HTTP 网关）与应用。问题是：应用的本地 HTTP API 讲什么协议。

## 候选方案

- **应用直接实现 MCP Streamable HTTP 端点**（`interfaces/http` 以 axum
  承载，MCP 工具即路由，鉴权与会话在传输层处理）；
- 自有 REST/JSON-RPC API + bridge 做 MCP↔REST 协议转换：业务映射逻辑
  进 bridge，违反"bridge 纯转发、不含业务"的定位（ADR-005），且工具
  契约要在两处维护；
- 应用作为 stdio MCP server 被 bridge 拉起：窗口应用兼 stdio server 的
  进程模型不成立（多客户端、生命周期、日志全部纠缠）。

## 决策

`interfaces/http` 直接讲 MCP 协议（Streamable HTTP 传输）：仅绑定回环
地址，每会话随机令牌（bridge.json 引导），连接时完成 Plugin/应用/Schema
版本握手（UC-009）；MCP 工具（get_item、search_items、apply_change_set、
transition_item 等，00 概览候选清单）映射到 services 调用。UI 不走此
通道（ADR-006）。

## 主要理由

- bridge 保持零业务逻辑，工具契约只在应用一处（与 00 概览"UI 与 MCP
  共用同一套领域规则"一致）；
- MCP 协议自带能力协商与版本握手，直接满足 FR-001 的握手要求；
- 未来远程形态：bridge 仍只对接本地应用，远程项目由应用转发（OQ-004），
  本决策不受影响。

## 代价与后果

- 应用与 MCP 协议版本耦合：以握手与最低版本检查兜底（UC-009 A3）；
- 需要自实现部分传输层语义（会话、心跳）——限定在 `interfaces/http/`，
  不外泄。

## 验证或重新评估条件

- 无效令牌拒绝、回环外不可达的测试（NFR-005 验证方式）；
- 重新评估触发：MCP 协议重大不兼容变更或出现双协议消费者需求。
