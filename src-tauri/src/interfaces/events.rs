//! 入站层共享事件 DTO：data-changed（INT-001 反向通道）。
//!
//! 发射点在 interfaces/http——写工具成功返回前、以 ChangeSummary 广播（ADR-006）；
//! 本模块只定义类型与事件名，发射实现随 http 落地。

use serde::Serialize;

#[derive(Serialize, Clone, Copy, specta::Type)]
#[serde(rename_all = "lowercase")]
// 变体随 http 发射点（ADR-006）实现后开始构造
#[allow(dead_code)]
pub enum ChangeKind {
    Item,
    Relation,
    Task,
    Project,
}

/// 失效信号（不承载数据）：projectId 定位失效粒度，前端按项目前缀失效查询。
#[derive(Serialize, Clone, tauri_specta::Event, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DataChangedEvent {
    pub project_id: String,
    pub kinds: Vec<ChangeKind>,
    /// 触发变更集的最大新修订号（诊断用）。u32：specta 禁 u64（TS BigInt）。
    pub revision: Option<u32>,
    /// 主条目编号（可空）
    pub code: Option<String>,
}
