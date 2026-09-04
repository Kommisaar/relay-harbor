//! 本地 MCP API（CMP-003 / INT-002 / ADR-004）。
//!
//! axum 承载 MCP Streamable HTTP 端点：仅绑定 127.0.0.1 随机端口、Bearer 令牌、
//! 版本握手（appVersion/schemaVersion/minBridgeVersion）；14 个 MCP 工具路由到 services；
//! 写工具成功后发射 data-changed 再返回（先发射后返回，ADR-006）。
//! 随 MCP 接入实现任务落地（FR-001，CON-007：M1 交付）。
