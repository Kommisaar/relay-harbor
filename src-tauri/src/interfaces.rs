//! 入站层：ipc（Tauri 只读命令，CMP-002 / INT-001）与 http（本地 MCP API，CMP-003 / INT-002）。
//! 双入口共用 services 读路径与 domain 规则；各自独立 DTO（ADR-006）。

pub mod events;
pub mod http;
pub mod ipc;
