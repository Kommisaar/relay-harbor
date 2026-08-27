# 本地 MCP API（interfaces/http）

> 状态：草稿
> 组件：CMP-003
> 承载：UC-001～009、NFR-005/009、ADR-004

## 责任

- axum 承载 MCP Streamable HTTP 端点，仅绑定 127.0.0.1（随机端口，
  由 infra/runtime 分配并写入 bridge.json）；
- 会话与鉴权：Bearer 令牌校验（bridge.json 中的当前令牌），未过鉴权
  不暴露任何工具列表；
- 版本握手：initialize 应答 appVersion/schemaVersion/minBridgeVersion；
- 工具路由：MCP 工具 → services 方法；参数/返回经 specta/Rust 类型
  双向绑定（JSON Schema 自动导出）；
- 错误映射：domain/services 错误 → api-contracts 错误码（结构化 detail）；
- **data-changed 发射**：写工具成功返回前，以 ChangeSummary 调用
  Tauri emit 广播失效事件（ADR-006 唯一发射点）。

## 不负责

- 业务规则；工具参数的业务校验（domain）；bridge 的发现与拉起；
  UI 请求（ipc 通道）。

## 公开接口

INT-002（工具契约与错误码见 api-contracts.md）。

## 内部协作者

services、infra/runtime（bridge.json 写出与令牌轮换）、tauri Emitter。

## 关键规则

- 令牌每会话轮换：应用启动生成新令牌并原子更新 bridge.json，旧令牌
  全部失效（重发现流程由 bridge 侧承担）；
- 会话绑定：MCP session id 与令牌校验独立（会话管理属传输层语义）；
- 写工具成功 → 发射事件 → 返回结果，顺序固定（先发射后返回，保证
  UI 在调用方拿到结果前已可刷新）。

## 状态与数据

内存中的会话表（session id → 协议版本）；无业务数据缓存。

## 错误处理

未捕获 panic 不拖垮端点（per-request task）；协议层错误与业务错误
分别编码，均含可读 message。

## 并发与一致性

工具并发到达由存储写事务串行化；本层无共享可变状态（会话表除外，
锁保护）。

## 可观测性

每工具调用记录（会话、工具、结果概要、耗时）→ NFR-007 审计要求。

## 测试要点

- 无效/过期令牌拒绝（NFR-005 验证方式）；握手版本不匹配报错；
- 每个错误码的触发路径；事件发射与返回顺序；并发写事务串行化。

## 开放问题

MCP Streamable HTTP 的会话保活细节（心跳间隔）随协议版本实现时定，
不影响契约。
