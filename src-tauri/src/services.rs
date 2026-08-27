//! 应用服务层（CMP-004）：写路径（ChangeSet 编排）、读路径、导出编排。
//! 每操作携带 CallContext（actor、入口来源，ADR-008）。禁 tauri/sqlx/axum（CI 强制）。
//! 详见 docs/design/05-detailed-design/modules/services.md。

pub mod export;
pub mod read;
pub mod write;
