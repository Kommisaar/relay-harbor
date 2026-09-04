//! 修订（DOM-004）：不可变追加（INV-004/BR-004）、OCC 依据（BR-005
//! expected_revision = 当前修订号方可写入）、title 落档（修订标题；
//! 2026-09-03 用户指令移除 actor，变更者审计由操作日志承载 NFR-007）。
//! 项目级文档修订（DOM-009）同口径不可变追加。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::error::DomainError;
use super::item::ItemId;
use super::project::{ProjectDocKey, ProjectId};

/// 修订内容快照（revisions.content_snapshot 列；历史版本查看即读此结构）。
/// status 存原始文本：快照只承载展示，机器归属判定仅在 items.status
/// 解析路径（AnyStatus 两机 cancelled 同名，JSON 无法自判归属）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RevisionContent {
    pub title: String,
    pub body_md: String,
    pub metadata: Value,
    /// 快照时状态文本（含状态迁移记录的场景——迁移本身也是一次修订）
    pub status: String,
}

/// 条目修订（身份 = (item_id, revision_no)，单调递增；无 UPDATE/DELETE 路径）
#[derive(Debug, Clone, PartialEq)]
pub struct Revision {
    pub item_id: ItemId,
    pub revision_no: u32,
    /// 修订标题（2026-09-03 新增，替代 actor 落档位）
    pub title: String,
    /// 变更摘要（含 `status: draft→in_review` 类迁移记录）
    pub summary: String,
    pub content: RevisionContent,
    /// UTC 存储（INV-004；秒精度格式化归 snapshot 模块）
    pub changed_at: DateTime<Utc>,
}

/// 项目级文档修订（DOM-009；身份 = (project_id, doc_key, revision_no)）
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectDocRevision {
    pub project_id: ProjectId,
    pub doc_key: ProjectDocKey,
    pub revision_no: u32,
    pub title: String,
    pub summary: String,
    pub content: DocContent,
    pub changed_at: DateTime<Utc>,
}

/// 文档修订快照（无元数据、无状态机——文档不是条目）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocContent {
    pub title: String,
    pub body_md: String,
}

/// OCC 校验（BR-005）：期望修订号 = 当前修订号方可写入，否则 ERR_CONFLICT。
/// 由调用方（存储事务首步 / services 预检）发起，不自动合并。
pub fn ensure_revision_match(
    code: &str,
    expected: u32,
    current: u32,
) -> Result<(), DomainError> {
    if expected == current {
        Ok(())
    } else {
        Err(DomainError::Conflict {
            code: code.to_string(),
            expected,
            current,
        })
    }
}
