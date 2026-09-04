//! 设施层（CMP-006/007）：storage（sqlx + SQLite，实现 domain::ports）与 runtime
//! （数据根目录、bridge.json、随机端口/令牌、日志）；writer（导出写盘，
//! 实现 domain::ports::SnapshotWriter）。只依赖 domain（CI 强制）。

pub mod runtime;
pub mod storage;
pub mod writer;
