//! 行 ↔ 领域实体映射（infra/storage 内部共享）。
//! 损坏数据（词表外类型/状态、坏 JSON、坏 UUID）→ StorageError::Internal
//!（存储内部错误语义，接口层映射 ERR_INTERNAL）。

use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::domain::error::DomainError;
use crate::domain::item::{status_from_storage, AnyStatus, Item, ItemType};
use crate::domain::ports::StorageError;
use crate::domain::project::{Project, ProjectDoc, ProjectDocKey};
use crate::domain::relation::{Relation, RelationType};
use crate::domain::revision::{DocContent, ProjectDocRevision, Revision, RevisionContent};

pub(super) fn internal(msg: impl std::fmt::Display) -> StorageError {
    StorageError::Internal(msg.to_string())
}

pub(super) fn parse_uuid(s: &str) -> Result<Uuid, StorageError> {
    Uuid::parse_str(s).map_err(|e| internal(format!("损坏的 UUID {s:?}：{e}")))
}

pub(super) fn map_project(row: &SqliteRow) -> Result<Project, StorageError> {
    Ok(Project {
        id: parse_uuid(&row.try_get::<String, _>("id")?)?,
        name: row.try_get("name")?,
        repo_path: row.try_get("repo_path")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub(super) fn map_item(row: &SqliteRow) -> Result<Item, StorageError> {
    let type_text: String = row.try_get("item_type")?;
    let item_type = ItemType::from_prefix(&type_text)
        .ok_or_else(|| internal(format!("损坏的条目类型 {type_text:?}（15 词表外）")))?;
    let status_text: String = row.try_get("status")?;
    let status = status_from_storage(item_type, &status_text).map_err(internal)?;
    let metadata_text: String = row.try_get("metadata")?;
    Ok(Item {
        id: parse_uuid(&row.try_get::<String, _>("id")?)?,
        project_id: parse_uuid(&row.try_get::<String, _>("project_id")?)?,
        display_code: row.try_get("display_code")?,
        item_type,
        title: row.try_get("title")?,
        body_md: row.try_get("body_md")?,
        metadata: serde_json::from_str(&metadata_text).map_err(internal)?,
        status,
        current_revision: row.try_get::<i64, _>("current_revision")? as u32,
        superseded_by: match row.try_get::<Option<String>, _>("superseded_by")? {
            Some(s) => Some(parse_uuid(&s)?),
            None => None,
        },
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub(super) fn map_revision(row: &SqliteRow) -> Result<Revision, StorageError> {
    let snapshot_text: String = row.try_get("content_snapshot")?;
    Ok(Revision {
        item_id: parse_uuid(&row.try_get::<String, _>("item_id")?)?,
        revision_no: row.try_get::<i64, _>("revision_no")? as u32,
        title: row.try_get("title")?,
        summary: row.try_get("summary")?,
        content: serde_json::from_str::<RevisionContent>(&snapshot_text).map_err(internal)?,
        changed_at: row.try_get("changed_at")?,
    })
}

pub(super) fn map_relation(row: &SqliteRow) -> Result<Relation, StorageError> {
    let type_text: String = row.try_get("relation_type")?;
    Ok(Relation {
        id: parse_uuid(&row.try_get::<String, _>("id")?)?,
        project_id: parse_uuid(&row.try_get::<String, _>("project_id")?)?,
        source_id: parse_uuid(&row.try_get::<String, _>("source_id")?)?,
        target_id: parse_uuid(&row.try_get::<String, _>("target_id")?)?,
        relation_type: RelationType::parse(&type_text)
            .ok_or_else(|| internal(format!("损坏的关系类型 {type_text:?}")))?,
    })
}

pub(super) fn map_doc(row: &SqliteRow) -> Result<ProjectDoc, StorageError> {
    let key_text: String = row.try_get("doc_key")?;
    Ok(ProjectDoc {
        project_id: parse_uuid(&row.try_get::<String, _>("project_id")?)?,
        doc_key: ProjectDocKey::from_key(&key_text)
            .ok_or_else(|| internal(format!("损坏的文档 key {key_text:?}（受控词表外）")))?,
        title: row.try_get("title")?,
        body_md: row.try_get("body_md")?,
        current_revision: row.try_get::<i64, _>("current_revision")? as u32,
        updated_at: row.try_get("updated_at")?,
    })
}

pub(super) fn map_doc_revision(row: &SqliteRow) -> Result<ProjectDocRevision, StorageError> {
    let key_text: String = row.try_get("doc_key")?;
    let snapshot_text: String = row.try_get("content_snapshot")?;
    Ok(ProjectDocRevision {
        project_id: parse_uuid(&row.try_get::<String, _>("project_id")?)?,
        doc_key: ProjectDocKey::from_key(&key_text)
            .ok_or_else(|| internal(format!("损坏的文档 key {key_text:?}")))?,
        revision_no: row.try_get::<i64, _>("revision_no")? as u32,
        title: row.try_get("title")?,
        summary: row.try_get("summary")?,
        content: serde_json::from_str::<DocContent>(&snapshot_text).map_err(internal)?,
        changed_at: row.try_get("changed_at")?,
    })
}

/// AnyStatus → 存储文本（items.status / 快照 status 列）
pub(super) fn status_text(status: &AnyStatus) -> String {
    status.to_string()
}

/// 领域拒绝快捷转换（? 于 StorageResult 上下文）
pub(super) fn domain(e: DomainError) -> StorageError {
    StorageError::Domain(e)
}
