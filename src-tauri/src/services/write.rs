//! 写路径（CMP-004）：MCP 工具参数 → ChangeSet → domain 校验 → 端口原子提交
//! → 返回变更摘要（interfaces/http 以此发射 data-changed，ADR-006 唯一发射点）。
//! 细粒度工具同样组装为单操作变更集——无旁路（NFR-009）。
//! CallContext（actor、入口来源）入结构化操作日志（NFR-007；ADR-008 远程
//! 演进的签名保险——修订记录不含 actor，2026-09-03 用户指令）。

use std::sync::Arc;

use serde_json::Value;

use crate::domain::changeset::{ChangeKind, ChangeOp, ChangeSet, ContentChanges};
use crate::domain::error::DomainError;
use crate::domain::item::{AnyStatus, ItemStatus, ItemType};
use crate::domain::ports::{DeleteStats, NotFoundKind, Storage, StorageError, StorageResult};
use crate::domain::project::{Project, ProjectDocKey, ProjectId};
use crate::domain::relation::RelationType;

/// 调用上下文（每写操作必带；actor = MCP 客户端标识，entry = 入口来源）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallContext {
    pub actor: String,
    pub entry: EntrySource,
}

/// 入口来源（M1 仅 MCP；UI 纯只读不产生写上下文）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntrySource {
    Mcp,
}

impl CallContext {
    pub fn mcp(actor: impl Into<String>) -> Self {
        CallContext {
            actor: actor.into(),
            entry: EntrySource::Mcp,
        }
    }
}

/// 变更摘要（写操作返回值的一部分；http 发射 data-changed 的数据源）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangeSummary {
    pub project_id: ProjectId,
    pub kinds: Vec<ChangeKind>,
    /// 触发变更集的最大新修订号（诊断用）
    pub revision: Option<u32>,
    /// 主条目编号（可空）
    pub code: Option<String>,
}

/// 条目写结果（api-contracts 工具返回：code / new_revision / status）
#[derive(Debug, Clone, PartialEq)]
pub struct ItemWriteResult {
    pub code: String,
    pub new_revision: u32,
    pub status: AnyStatus,
    pub summary: ChangeSummary,
}

/// 状态迁移参数（api-contracts transition_item 工具形态；参数结构体避免超长签名）
#[derive(Debug, Clone, Copy)]
pub struct TransitionParams<'a> {
    pub code: &'a str,
    pub expected_revision: u32,
    pub to: AnyStatus,
    pub superseded_by: Option<&'a str>,
    pub confirm: bool,
}

/// 写服务（无状态，组合根单例装配）
pub struct WriteService {
    storage: Arc<dyn Storage>,
}

impl WriteService {
    pub fn new(storage: Arc<dyn Storage>) -> Self {
        Self { storage }
    }

    /// 端口引用（http 发射事件后的读回查等场景）
    pub fn storage(&self) -> &Arc<dyn Storage> {
        &self.storage
    }

    // ---- 项目（BR-011 级联）----

    pub async fn create_project(
        &self,
        ctx: &CallContext,
        name: &str,
        repo_path: Option<&str>,
    ) -> StorageResult<Project> {
        if name.trim().is_empty() {
            return Err(DomainError::Validation {
                message: "项目名称不能为空".into(),
            }
            .into());
        }
        let project = self.storage.create_project(name, repo_path).await?;
        tracing::info!(actor = %ctx.actor, op = "create_project", project = %project.id, "写操作");
        Ok(project)
    }

    pub async fn delete_project(
        &self,
        ctx: &CallContext,
        project_id: ProjectId,
        confirm: bool,
    ) -> StorageResult<DeleteStats> {
        if !confirm {
            return Err(DomainError::Validation {
                message: "删除项目必须显式携带 confirm（BR-011，不可逆级联）".into(),
            }
            .into());
        }
        let stats = self.storage.delete_project(project_id).await?;
        tracing::info!(actor = %ctx.actor, op = "delete_project", project = %project_id, "写操作（级联）");
        Ok(stats)
    }

    // ---- 条目 ----

    pub async fn create_item(
        &self,
        ctx: &CallContext,
        project_id: ProjectId,
        item_type: ItemType,
        title: &str,
        body_md: &str,
        metadata: Value,
    ) -> StorageResult<ItemWriteResult> {
        if title.trim().is_empty() {
            return Err(DomainError::Validation {
                message: "条目标题不能为空".into(),
            }
            .into());
        }
        // 组装即校验（DOM-005 结构面；单操作变更集）
        let _cs = ChangeSet::new(
            project_id,
            vec![ChangeOp::CreateItem {
                item_type,
                title: title.to_string(),
                body_md: body_md.to_string(),
                metadata: metadata.clone(),
            }],
        )?;
        let change = self
            .storage
            .create_item(project_id, item_type, title, body_md, metadata)
            .await?;
        tracing::info!(actor = %ctx.actor, op = "create_item", code = %change.item.display_code, "写操作");
        let code = change.item.display_code.clone();
        let revision_no = change.revision.revision_no;
        Ok(ItemWriteResult {
            code,
            new_revision: revision_no,
            status: change.item.status,
            summary: ChangeSummary {
                project_id,
                kinds: vec![change_kind_of(item_type)],
                revision: Some(revision_no),
                code: Some(change.item.display_code),
            },
        })
    }

    pub async fn edit_item(
        &self,
        ctx: &CallContext,
        project_id: ProjectId,
        code: &str,
        expected_revision: u32,
        changes: ContentChanges,
    ) -> StorageResult<ItemWriteResult> {
        // INV-008：类型不可变——ChangeSet 形态无类型字段，结构上即保证
        let _cs = ChangeSet::new(
            project_id,
            vec![ChangeOp::EditItem {
                code: code.to_string(),
                expected_revision,
                changes: changes.clone(),
            }],
        )?;
        let change = self
            .storage
            .edit_item(project_id, code, expected_revision, &changes)
            .await?;
        tracing::info!(actor = %ctx.actor, op = "edit_item", code = %code, revision = change.item.current_revision, "写操作");
        let new_code = change.item.display_code.clone();
        let new_revision = change.item.current_revision;
        Ok(ItemWriteResult {
            new_revision,
            code: new_code,
            status: change.item.status,
            summary: ChangeSummary {
                project_id,
                kinds: vec![change_kind_of(change.item.item_type)],
                revision: Some(new_revision),
                code: Some(change.item.display_code),
            },
        })
    }

    pub async fn transition_item(
        &self,
        ctx: &CallContext,
        project_id: ProjectId,
        params: TransitionParams<'_>,
    ) -> StorageResult<ItemWriteResult> {
        let TransitionParams {
            code,
            expected_revision,
            to,
            superseded_by,
            confirm,
        } = params;
        let _cs = ChangeSet::new(
            project_id,
            vec![ChangeOp::TransitionItem {
                code: code.to_string(),
                expected_revision,
                to,
                superseded_by: superseded_by.map(Into::into),
                confirm,
            }],
        )?;
        let change = self
            .storage
            .transition_item(project_id, code, expected_revision, to, superseded_by, confirm)
            .await?;
        tracing::info!(actor = %ctx.actor, op = "transition_item", code = %code, to = %to, "写操作");
        let new_code = change.item.display_code.clone();
        let new_revision = change.item.current_revision;
        Ok(ItemWriteResult {
            new_revision,
            code: new_code,
            status: change.item.status,
            summary: ChangeSummary {
                project_id,
                kinds: vec![change_kind_of(change.item.item_type)],
                revision: Some(new_revision),
                code: Some(change.item.display_code),
            },
        })
    }

    // ---- 关系 ----

    pub async fn add_relation(
        &self,
        ctx: &CallContext,
        project_id: ProjectId,
        source: &str,
        target: &str,
        relation_type: RelationType,
    ) -> StorageResult<String> {
        let _cs = ChangeSet::new(
            project_id,
            vec![ChangeOp::AddRelation {
                source: source.to_string(),
                target: target.to_string(),
                relation_type,
            }],
        )?;
        let change = self
            .storage
            .add_relation(project_id, source, target, relation_type)
            .await?;
        tracing::info!(actor = %ctx.actor, op = "add_relation", source = %source, target = %target, r#type = relation_type.as_str(), created = change.created, "写操作");
        Ok(change.relation.id.to_string())
    }

    pub async fn remove_relation(
        &self,
        ctx: &CallContext,
        project_id: ProjectId,
        source: &str,
        target: &str,
        relation_type: RelationType,
    ) -> StorageResult<ChangeSummary> {
        let _cs = ChangeSet::new(
            project_id,
            vec![ChangeOp::RemoveRelation {
                source: source.to_string(),
                target: target.to_string(),
                relation_type,
            }],
        )?;
        self.storage
            .remove_relation(project_id, source, target, relation_type)
            .await?;
        tracing::info!(actor = %ctx.actor, op = "remove_relation", source = %source, target = %target, r#type = relation_type.as_str(), "写操作");
        Ok(ChangeSummary {
            project_id,
            kinds: vec![ChangeKind::Relation],
            revision: None,
            code: Some(source.to_string()),
        })
    }

    // ---- 项目级文档（DOM-009）----

    pub async fn set_project_doc(
        &self,
        ctx: &CallContext,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
        expected_revision: u32,
        title: Option<&str>,
        body_md: &str,
    ) -> StorageResult<(ProjectDocKey, u32)> {
        if body_md.trim().is_empty() {
            return Err(DomainError::Validation {
                message: "文档正文不能为空".into(),
            }
            .into());
        }
        let _cs = ChangeSet::new(
            project_id,
            vec![ChangeOp::SetProjectDoc {
                doc_key,
                expected_revision,
                title: title.map(Into::into),
                body_md: body_md.to_string(),
            }],
        )?;
        let change = self
            .storage
            .set_project_doc(project_id, doc_key, expected_revision, title, body_md)
            .await?;
        tracing::info!(actor = %ctx.actor, op = "set_project_doc", doc = doc_key.as_key(), revision = change.doc.current_revision, "写操作");
        Ok((doc_key, change.doc.current_revision))
    }

    /// 项目文档摘要（data-changed 附带场景；不存在 → NotFound{ProjectDoc}）
    pub async fn project_doc_revision(
        &self,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
    ) -> StorageResult<u32> {
        self.storage
            .get_project_doc(project_id, doc_key)
            .await?
            .map(|d| d.current_revision)
            .ok_or(StorageError::NotFound {
                kind: NotFoundKind::ProjectDoc,
                id: doc_key.as_key().to_string(),
            })
    }

    /// 诊断校验（MCP validate 工具，api-contracts：悬空、终态语义、反向对提示）
    pub async fn validate(
        &self,
        ctx: &CallContext,
        project_id: ProjectId,
    ) -> StorageResult<Vec<ValidationIssue>> {
        let mut issues = Vec::new();
        let items = self
            .storage
            .list_items(project_id, &crate::domain::ports::ItemFilter::default())
            .await?;
        let relations = self
            .storage
            .list_relations(project_id, &crate::domain::ports::RelationFilter::default())
            .await?;
        let by_id: std::collections::HashMap<_, _> =
            items.iter().map(|i| (i.id, i)).collect();

        // 悬空（BR-006/INV-003）：FK 级联下正常不出现，出现即数据损坏
        for relation in &relations {
            if !by_id.contains_key(&relation.source_id) {
                issues.push(ValidationIssue {
                    severity: Severity::Error,
                    code: None,
                    message: format!(
                        "关系 {} 的源端条目缺失（悬空，BR-006）",
                        relation.id
                    ),
                });
            }
            if !by_id.contains_key(&relation.target_id) {
                issues.push(ValidationIssue {
                    severity: Severity::Error,
                    code: None,
                    message: format!(
                        "关系 {} 的目标端条目缺失（悬空，BR-006）",
                        relation.id
                    ),
                });
            }
        }
        // 终态语义（INV-006）：已替代必带有效替代者；替代者不得终态
        for item in &items {
            if item.status == AnyStatus::Item(ItemStatus::Superseded) {
                match item.superseded_by {
                    None => issues.push(ValidationIssue {
                        severity: Severity::Error,
                        code: Some(item.display_code.clone()),
                        message: format!("{} 处于已替代但缺少替代者（INV-006）", item.display_code),
                    }),
                    Some(sup) => match by_id.get(&sup) {
                        None => issues.push(ValidationIssue {
                            severity: Severity::Error,
                            code: Some(item.display_code.clone()),
                            message: format!(
                                "{} 的替代者 {} 不存在（INV-006）",
                                item.display_code, sup
                            ),
                        }),
                        Some(sup_item) => {
                            if sup_item.status.is_terminal() {
                                issues.push(ValidationIssue {
                                    severity: Severity::Error,
                                    code: Some(item.display_code.clone()),
                                    message: format!(
                                        "{} 的替代者 {} 处于终态（INV-006）",
                                        item.display_code, sup_item.display_code
                                    ),
                                });
                            }
                        }
                    },
                }
            }
        }
        // 反向对提示（03 定案：不禁止、靠 Agent 自律，validate 只提示）
        for a in &relations {
            for b in &relations {
                if a.source_id == b.target_id
                    && a.target_id == b.source_id
                    && a.relation_type == b.relation_type
                    && a.id < b.id
                    && matches!(
                        a.relation_type,
                        RelationType::Derives | RelationType::Satisfies
                    )
                {
                    issues.push(ValidationIssue {
                        severity: Severity::Info,
                        code: None,
                        message: format!(
                            "存在 {t} 反向对（{} ↔ {}）：语义互逆，建议保留单边（Agent 自律项）",
                            by_id.get(&a.source_id).map(|i| i.display_code.as_str()).unwrap_or("?"),
                            by_id.get(&a.target_id).map(|i| i.display_code.as_str()).unwrap_or("?"),
                            t = a.relation_type,
                        ),
                    });
                }
            }
        }
        tracing::info!(actor = %ctx.actor, op = "validate", issues = issues.len(), "诊断校验");
        Ok(issues)
    }
}

/// 条目 → 变更类别（TASK 条目写入即任务失效）
fn change_kind_of(item_type: ItemType) -> ChangeKind {
    if item_type.is_task() {
        ChangeKind::Task
    } else {
        ChangeKind::Item
    }
}

/// 诊断问题（severity: error=违规 / info=自律提示）
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ValidationIssue {
    pub severity: Severity,
    /// 相关条目编号（可空——关系级/全局问题）
    pub code: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Info,
}
