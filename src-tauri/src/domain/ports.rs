//! 存储端口（INT-004 / ADR-002）：意图级原子操作 trait。
//! 定义于 domain、实现在 infra/storage；每写方法一个 BEGIN IMMEDIATE 事务，
//! 事务内完成 OCC 校验 → 变更落库 → 编号分配 → 修订追加。
//! 方法面与事务边界契约见 docs/design/05-detailed-design/data-model.md。
//!
//! 读方法返回领域实体/记录，查询组装（看板、统计、影响）归 services；
//! 图算法（环检测/影响闭包）基于 [`edge_snapshot`] 提供的编号边快照在
//! domain 纯函数内完成（modules/domain-core.md）。
//!
//! SnapshotWriter（导出写盘端口）与 domain/snapshot 格式化随 P4 导出
//! 实现任务一并定义（modules/export.md），此处不预置。

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::Value;

use super::changeset::ContentChanges;
use super::error::DomainError;
use super::item::{AnyStatus, Item, ItemId, ItemType};
use super::project::{Project, ProjectDoc, ProjectDocKey, ProjectId};
use super::relation::{Relation, RelationId, RelationType};
use super::revision::{ProjectDocRevision, Revision};

/// 查找未命中种类（interfaces 按命令主题映射 UI 短码：
/// Project→PROJECT_NOT_FOUND、Item→ITEM_NOT_FOUND、ProjectDoc→DOC_NOT_FOUND）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotFoundKind {
    Project,
    Item,
    ProjectDoc,
}

/// 端口错误：领域拒绝（映射业务错误码）、查找未命中（services 映射
/// ERR_NOT_FOUND——「检查标识，不重试」）或存储内部故障
///（services 包装为 ERR_INTERNAL，保留 cause 链供日志）
#[derive(Debug, Clone)]
pub enum StorageError {
    Domain(DomainError),
    NotFound {
        kind: NotFoundKind,
        id: String,
    },
    Internal(String),
}

impl From<DomainError> for StorageError {
    fn from(e: DomainError) -> Self {
        StorageError::Domain(e)
    }
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::Domain(e) => write!(f, "{e}"),
            StorageError::NotFound { kind, id } => {
                write!(f, "未找到 {kind:?}：{id}")
            }
            StorageError::Internal(msg) => write!(f, "存储内部错误：{msg}"),
        }
    }
}

impl std::error::Error for StorageError {}

pub type StorageResult<T> = Result<T, StorageError>;

/// 条目列表过滤（INT-001 list_items：按类型/状态过滤）
#[derive(Debug, Clone, Default)]
pub struct ItemFilter {
    pub item_types: Option<Vec<ItemType>>,
    pub statuses: Option<Vec<AnyStatus>>,
}

/// 关系查询过滤（按端点/类型）
#[derive(Debug, Clone, Default)]
pub struct RelationFilter {
    pub source: Option<ItemId>,
    pub target: Option<ItemId>,
    pub relation_types: Option<Vec<RelationType>>,
}

/// 编号边快照行（图算法输入：环检测、影响闭包、阻塞派生）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EdgeByCode {
    pub source: String,
    pub target: String,
    pub relation_type: RelationType,
}

/// 项目删除统计（api-contracts delete_project 返回）
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DeleteStats {
    pub items: u64,
    pub relations: u64,
    pub revisions: u64,
}

/// 条目写结果（当前态 + 本次追加的修订）
#[derive(Debug, Clone, PartialEq)]
pub struct ItemChange {
    pub item: Item,
    pub revision: Revision,
}

/// 关系建立结果（幂等：已存在返回原关系与 created=false）
#[derive(Debug, Clone, PartialEq)]
pub struct RelationChange {
    pub relation: Relation,
    pub created: bool,
}

/// 项目级文档写结果
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectDocChange {
    pub doc: ProjectDoc,
    pub revision: ProjectDocRevision,
}

/// 类型×状态计数行（get_project_state 统计与类型分布）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypeStatusCount {
    pub item_type: ItemType,
    pub status: AnyStatus,
    pub count: u64,
}

/// 逐日修订计数行（活动图，近 N 天；date = YYYY-MM-DD）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DayRevisionCount {
    pub date: String,
    pub count: u64,
}

/// 跨条目修订摘要行（list_recent_revisions，倒序由实现保证）
#[derive(Debug, Clone, PartialEq)]
pub struct RecentRevision {
    pub code: String,
    pub title: String,
    pub revision_no: u32,
    pub summary: String,
    pub changed_at: DateTime<Utc>,
}

/// 导出快照（单次取数时点固定，modules/export.md「一致性 = 导出开始时的库快照」）
#[derive(Debug, Clone)]
pub struct ExportSnapshot {
    pub project: Project,
    pub items: Vec<Item>,
    /// 全部修订（快照导出取 title/summary/revision_no/changed_at）
    pub revisions: Vec<Revision>,
    pub relations: Vec<Relation>,
    /// 项目级文档（facilitator 装配视图来源）
    pub docs: Vec<ProjectDoc>,
}

/// 存储端口（对象安全：组合根 `Arc<dyn Storage>` 注入 Tauri 与 axum 双入口）
#[async_trait]
pub trait Storage: Send + Sync {
    // ---- 项目（BR-011 级联删除为单事务）----

    async fn create_project(
        &self,
        name: &str,
        repo_path: Option<&str>,
    ) -> StorageResult<Project>;

    async fn delete_project(&self, project_id: ProjectId) -> StorageResult<DeleteStats>;

    // ---- 条目写路径（每方法一个事务：OCC → 落库 → 取号 → 修订追加）----

    async fn create_item(
        &self,
        project_id: ProjectId,
        item_type: ItemType,
        title: &str,
        body_md: &str,
        metadata: Value,
    ) -> StorageResult<ItemChange>;

    async fn edit_item(
        &self,
        project_id: ProjectId,
        code: &str,
        expected_revision: u32,
        changes: &ContentChanges,
    ) -> StorageResult<ItemChange>;

    async fn transition_item(
        &self,
        project_id: ProjectId,
        code: &str,
        expected_revision: u32,
        to: AnyStatus,
        superseded_by: Option<&str>,
        confirm: bool,
    ) -> StorageResult<ItemChange>;

    // ---- 关系（悬空/同项目/环检测在事务内经 domain 校验；幂等）----

    async fn add_relation(
        &self,
        project_id: ProjectId,
        source: &str,
        target: &str,
        relation_type: RelationType,
    ) -> StorageResult<RelationChange>;

    async fn remove_relation(
        &self,
        project_id: ProjectId,
        source: &str,
        target: &str,
        relation_type: RelationType,
    ) -> StorageResult<()>;

    // ---- 项目级文档（DOM-009：追加不可变修订）----

    async fn set_project_doc(
        &self,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
        expected_revision: u32,
        title: Option<&str>,
        body_md: &str,
    ) -> StorageResult<ProjectDocChange>;

    // ---- 读路径（WAL 快照读，无锁竞争）----

    async fn list_projects(&self) -> StorageResult<Vec<Project>>;

    async fn get_project(&self, project_id: ProjectId) -> StorageResult<Option<Project>>;

    async fn list_items(
        &self,
        project_id: ProjectId,
        filter: &ItemFilter,
    ) -> StorageResult<Vec<Item>>;

    async fn get_item_by_code(
        &self,
        project_id: ProjectId,
        code: &str,
    ) -> StorageResult<Option<Item>>;

    async fn get_item_by_id(&self, item_id: ItemId) -> StorageResult<Option<Item>>;

    /// 按 id 批量取（关系端点、影响闭包结果组装；实现保证返回行数 ≤ 入参）
    async fn get_items_by_ids(
        &self,
        project_id: ProjectId,
        ids: &[ItemId],
    ) -> StorageResult<Vec<Item>>;

    /// 按编号批量取（影响闭包/看板阻塞上游的编号→条目解析；行数 ≤ 入参）
    async fn get_items_by_codes(
        &self,
        project_id: ProjectId,
        codes: &[String],
    ) -> StorageResult<Vec<Item>>;

    /// 修订历史（revision_no 升序；不可变表只读）
    async fn list_revisions(&self, item_id: ItemId) -> StorageResult<Vec<Revision>>;

    async fn list_relations(
        &self,
        project_id: ProjectId,
        filter: &RelationFilter,
    ) -> StorageResult<Vec<Relation>>;

    /// 按 id 批量取关系（条目详情关联展示）
    async fn get_relations_by_ids(
        &self,
        ids: &[RelationId],
    ) -> StorageResult<Vec<Relation>>;

    /// 编号边快照（环检测/影响闭包/阻塞派生的图算法输入）
    async fn edge_snapshot(&self, project_id: ProjectId) -> StorageResult<Vec<EdgeByCode>>;

    async fn count_items_by_type_status(
        &self,
        project_id: ProjectId,
    ) -> StorageResult<Vec<TypeStatusCount>>;

    /// 近 N 天逐日修订计数（活动图，INT-001 get_project_state）
    async fn revisions_by_day(
        &self,
        project_id: ProjectId,
        days: u16,
    ) -> StorageResult<Vec<DayRevisionCount>>;

    /// 跨条目最近修订（changed_at 倒序，limit 上限由实现钳制）
    async fn recent_revisions(
        &self,
        project_id: ProjectId,
        limit: u32,
    ) -> StorageResult<Vec<RecentRevision>>;

    /// 搜索（FR-012：M1 用 LIKE——编号精确/前缀 + 标题正文匹配；词法归实现）
    async fn search_items(&self, project_id: ProjectId, q: &str) -> StorageResult<Vec<Item>>;

    /// 导出快照（单次取数；项目不存在 → None）
    async fn export_snapshot(
        &self,
        project_id: ProjectId,
    ) -> StorageResult<Option<ExportSnapshot>>;

    async fn get_project_doc(
        &self,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
    ) -> StorageResult<Option<ProjectDoc>>;

    async fn list_project_doc_revisions(
        &self,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
    ) -> StorageResult<Vec<ProjectDocRevision>>;
}

/// 导出文件（相对路径以 `/` 分隔；内容 UTF-8，由 domain/snapshot 产出）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotFile {
    pub path: String,
    pub content: String,
}

/// 导出写盘错误（modules/export.md：目标已存在拒绝；失败清理临时产物）
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotWriteError {
    TargetExists,
    Io(String),
}

/// 导出写盘端口（CMP-007，modules/services.md「导出写盘经端口化的
/// SnapshotWriter」）：原子性策略（临时目录全部成功后 rename / zip 临时
/// 文件 + rename）归实现；确定性内容（排序/格式）归 domain/snapshot。
pub trait SnapshotWriter: Send + Sync {
    fn write_directory(
        &self,
        target: &std::path::Path,
        files: &[SnapshotFile],
    ) -> Result<(), SnapshotWriteError>;

    fn write_zip(
        &self,
        target: &std::path::Path,
        files: &[SnapshotFile],
    ) -> Result<(), SnapshotWriteError>;
}
