//! 变更集（DOM-005）：一次可整体校验、原子提交的变更单位——全部写操作的
//! 唯一形态（NFR-009 无旁路）。M1 细粒度 MCP 工具（edit_item 等）内部
//! 同样组装为单操作变更集；单变更集限单项目（03 领域模型假设）。

use serde_json::Value;

use super::error::{validation, DomainError};
use super::item::{AnyStatus, ItemType};
use super::project::{ProjectDocKey, ProjectId};
use super::relation::RelationType;

/// 内容编辑字段组（api-contracts edit_item 的可选参数形态：
/// None = 未提供不改，Some = 提供即改——元数据整对象替换）
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ContentChanges {
    pub title: Option<String>,
    pub body_md: Option<String>,
    pub metadata: Option<Value>,
}

impl ContentChanges {
    pub fn new() -> Self {
        Self::default()
    }

    /// 是否提供了任何字段
    pub fn is_empty(&self) -> bool {
        self.title.is_none() && self.body_md.is_none() && self.metadata.is_none()
    }

    /// BR-009 触发口径：标题或正文「实际变更」（提供且与当前值不同）。
    /// 元数据永不触发；提供相同值不算修改。
    pub fn content_changed(&self, current_title: &str, current_body: &str) -> bool {
        let title_changed = self.title.as_deref().is_some_and(|t| t != current_title);
        let body_changed = self.body_md.as_deref().is_some_and(|b| b != current_body);
        title_changed || body_changed
    }

    /// 空编辑拒绝（无字段变更仍提交会产空修订，违反修订语义）
    pub fn ensure_non_empty(&self, code: &str) -> Result<(), DomainError> {
        if self.is_empty() {
            Err(validation(format!(
                "编辑 {code} 未提供任何变更字段（title/body_md/metadata 至少其一）"
            )))
        } else {
            Ok(())
        }
    }
}

/// 变更类别（data-changed 事件的失效粒度分类，ADR-006/INT-001）。
/// 定义于 domain（services 的 ChangeSummary 携带、interfaces/events 的
/// specta DTO 复用——services 禁引 interfaces，单一事实来源在此）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, specta::Type)]
pub enum ChangeKind {
    #[serde(rename = "item")]
    Item,
    #[serde(rename = "relation")]
    Relation,
    #[serde(rename = "task")]
    Task,
    #[serde(rename = "project")]
    Project,
    /// 项目级文档写入（DOM-009，2026-09-04 修订循环 +project_doc）
    #[serde(rename = "project_doc")]
    ProjectDoc,
}

/// 变更操作（领域形态；由 services 从工具参数组装，经端口原子提交）
#[derive(Debug, Clone, PartialEq)]
pub enum ChangeOp {
    /// 创建条目（编号领域分配 BR-001；生成修订 1）
    CreateItem {
        item_type: ItemType,
        title: String,
        body_md: String,
        metadata: Value,
    },
    /// 编辑条目（BR-005 OCC + BR-009 退回；终态拒绝）
    EditItem {
        code: String,
        expected_revision: u32,
        changes: ContentChanges,
    },
    /// 状态迁移（BR-002 白名单 + BR-008 终态参数要求 + INV-006 替代者校验）
    TransitionItem {
        code: String,
        expected_revision: u32,
        to: AnyStatus,
        /// to=superseded 必填：替代者编号
        superseded_by: Option<String>,
        /// to=cancelled/deprecated 必为 true
        confirm: bool,
    },
    /// 建立关系（BR-006 悬空/INV-003 同项目/BR-007 环检测；幂等）
    AddRelation {
        source: String,
        target: String,
        relation_type: RelationType,
    },
    /// 移除关系（幂等：不存在亦返回成功）
    RemoveRelation {
        source: String,
        target: String,
        relation_type: RelationType,
    },
    /// 项目级文档写入（DOM-009：追加不可变修订，BR-004 同口径；无状态机）
    SetProjectDoc {
        doc_key: ProjectDocKey,
        expected_revision: u32,
        title: Option<String>,
        body_md: String,
    },
}

/// 变更集（DOM-005）：期望修订号按目标条目随各操作携带；
/// 提交由存储端口在单事务内完成（BEGIN IMMEDIATE，ADR-002）。
#[derive(Debug, Clone, PartialEq)]
pub struct ChangeSet {
    pub project_id: ProjectId,
    pub ops: Vec<ChangeOp>,
}

impl ChangeSet {
    /// 组装即校验：非空、无重复目标（M1 单操作为主，多操作同条目并发
    /// 语义不定义——重复出现即结构错误，ERR_VALIDATION）
    pub fn new(project_id: ProjectId, ops: Vec<ChangeOp>) -> Result<Self, DomainError> {
        if ops.is_empty() {
            return Err(validation("变更集为空（DOM-005：至少一个变更操作）"));
        }
        let mut item_targets: Vec<&str> = Vec::new();
        for op in &ops {
            match op {
                ChangeOp::EditItem { code, .. } | ChangeOp::TransitionItem { code, .. } => {
                    item_targets.push(code);
                }
                ChangeOp::SetProjectDoc { doc_key, .. } => {
                    item_targets.push(doc_key.as_key());
                }
                ChangeOp::CreateItem { .. } | ChangeOp::AddRelation { .. }
                | ChangeOp::RemoveRelation { .. } => {}
            }
        }
        item_targets.sort_unstable();
        let duplicates = item_targets.windows(2).any(|w| w[0] == w[1]);
        if duplicates {
            return Err(validation(
                "变更集内同一目标（条目/文档）出现多次：期望修订号无法唯一确定",
            ));
        }
        Ok(ChangeSet { project_id, ops })
    }
}
