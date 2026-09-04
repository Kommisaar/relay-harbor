//! 领域层（CMP-005）：实体、规则判定、端口定义。
//! 禁 tauri/sqlx/axum、禁 IO（ADR-001，CI 强制）。详见 docs/design/05-detailed-design/modules/domain-core.md。

pub mod baseline;
pub mod changeset;
pub mod error;
pub mod item;
pub mod ports;
pub mod project;
pub mod relation;
pub mod revision;
pub mod snapshot;
pub mod task;
