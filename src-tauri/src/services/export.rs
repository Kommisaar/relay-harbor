//! 导出编排：取当前数据 → domain/snapshot 确定性格式化 → infra（SnapshotWriter）写盘。
//! 目标已存在拒绝、失败清理、异步进度（modules/export.md）。
