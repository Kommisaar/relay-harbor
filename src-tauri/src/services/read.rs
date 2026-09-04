//! 读路径（CMP-004）：项目/条目/关系/看板/搜索/影响闭包查询组装，
//! ipc（INT-001 只读命令）与 http（INT-002 get_* 工具）共用。
//! 查询语义与 mock 门面（src/api/mock/commands.ts，INT-001 契约的演示实现）
//! 逐一对齐；NotFound.kind 供 interfaces 按命令主题映射 UI 短码
//!（PROJECT_NOT_FOUND / ITEM_NOT_FOUND / DOC_NOT_FOUND）。

use std::collections::HashMap;
use std::sync::Arc;

use crate::domain::item::{AnyStatus, Item, ItemStatus, ItemType, ITEM_STATUSES};
use crate::domain::ports::{
    ItemFilter, NotFoundKind, RecentRevision, RelationFilter, Storage, StorageError,
    StorageResult,
};
use crate::domain::project::{Project, ProjectDoc, ProjectDocKey, ProjectId};
use crate::domain::relation::{impact_closure, RelationType};
use crate::domain::revision::{ProjectDocRevision, Revision};
use crate::domain::task::{TaskStatus, TASK_STATUSES};

/// 活动图窗口（INT-001 get_project_state：近 182 天逐日修订计数）
const ACTIVITY_WINDOW_DAYS: u16 = 182;

/// 影响遍历默认深度（get_impact 固定 3；get_context 参数默认 3、上限 10）
pub const IMPACT_DEFAULT_DEPTH: u32 = 3;
pub const IMPACT_MAX_DEPTH: u32 = 10;

pub struct ReadService {
    storage: Arc<dyn Storage>,
}

/// 项目列表行（UI ProjectSummary：计数与更新时间）
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectListEntry {
    pub project: Project,
    pub item_count: u64,
    pub task_count: u64,
}

/// 项目统计快照（get_project_state；by_type 仅出现过的类型——GROUP BY 语义，
/// 两状态映射覆盖全词表含零，与 mock 口径一致）
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectStateSnapshot {
    pub by_type: Vec<(ItemType, u64)>,
    pub item_by_status: Vec<(ItemStatus, u64)>,
    pub task_by_status: Vec<(TaskStatus, u64)>,
    /// 完整 182 天窗口升序（端口只回非零日，此处补零）
    pub revisions_by_day: Vec<(String, u64)>,
}

/// 条目列表过滤（INT-001 list_items：单一类型/状态可选）
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ItemListSpec {
    pub item_type: Option<ItemType>,
    pub status: Option<AnyStatus>,
}

/// 看板列 / 卡片（DOM-006：阻塞为派生只读属性，BR-010）
#[derive(Debug, Clone, PartialEq)]
pub struct BoardColumn {
    pub status: TaskStatus,
    pub tasks: Vec<BoardTask>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BoardTask {
    pub item: Item,
    /// 未完成 depends 上游（活跃任务态才阻塞；cancelled 不阻塞——mock 定案口径）
    pub blocked_by: Vec<BlockedBy>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockedBy {
    pub code: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TaskBoardSnapshot {
    pub columns: Vec<BoardColumn>,
}

/// 条目关联一层视图（FR-010：动者在前——out 为「我对 B 做某事」）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Out,
    In,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RelationView {
    pub relation_type: RelationType,
    pub direction: Direction,
    pub peer: Item,
}

/// 影响定位（FR-013；get_impact 与 MCP get_context 共用）
#[derive(Debug, Clone, PartialEq)]
pub struct ImpactSnapshot {
    pub trigger: Item,
    pub entries: Vec<ImpactEntry>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImpactEntry {
    pub item: Item,
    pub depth: u32,
    /// 首次发现该受影响条目的关系类型
    pub via: RelationType,
}

/// 搜索命中（FR-012：matched_in 优先级 code → title → body）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchedIn {
    Code,
    Title,
    Body,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SearchSnapshot {
    pub item: Item,
    pub matched_in: MatchedIn,
}

impl ReadService {
    pub fn new(storage: Arc<dyn Storage>) -> Self {
        Self { storage }
    }

    /// 项目存在性统一前置（None → NotFound{Project} → PROJECT_NOT_FOUND）
    async fn require_project(&self, project_id: ProjectId) -> StorageResult<Project> {
        self.storage
            .get_project(project_id)
            .await?
            .ok_or(StorageError::NotFound {
                kind: NotFoundKind::Project,
                id: project_id.to_string(),
            })
    }

    pub async fn list_projects(&self) -> StorageResult<Vec<ProjectListEntry>> {
        let projects = self.storage.list_projects().await?;
        let mut out = Vec::with_capacity(projects.len());
        for project in projects {
            let counts = self.storage.count_items_by_type_status(project.id).await?;
            let item_count = counts.iter().map(|c| c.count).sum();
            let task_count = counts
                .iter()
                .filter(|c| c.item_type == ItemType::Task)
                .map(|c| c.count)
                .sum();
            out.push(ProjectListEntry {
                project,
                item_count,
                task_count,
            });
        }
        Ok(out)
    }

    pub async fn project_state(
        &self,
        project_id: ProjectId,
    ) -> StorageResult<ProjectStateSnapshot> {
        self.require_project(project_id).await?;
        let counts = self
            .storage
            .count_items_by_type_status(project_id)
            .await?;

        let mut by_type: Vec<(ItemType, u64)> = Vec::new();
        let mut item_by_status: HashMap<ItemStatus, u64> =
            ITEM_STATUSES.iter().map(|s| (*s, 0)).collect();
        let mut task_by_status: HashMap<TaskStatus, u64> =
            TASK_STATUSES.iter().map(|s| (*s, 0)).collect();
        for c in &counts {
            // 同类型跨多状态行累加（GROUP BY (type,status) 一行一状态）
            if let Some(entry) = by_type.iter_mut().find(|(t, _)| *t == c.item_type) {
                entry.1 += c.count;
            } else {
                by_type.push((c.item_type, c.count));
            }
            match c.status {
                AnyStatus::Item(st) => *item_by_status.get_mut(&st).expect("全词表初始化") += c.count,
                AnyStatus::Task(st) => *task_by_status.get_mut(&st).expect("全词表初始化") += c.count,
            }
        }
        // by_type 按类型固定序输出（确定性）
        by_type.sort_by_key(|(t, _)| {
            crate::domain::item::ITEM_TYPES.iter().position(|x| *x == *t)
        });

        // 活动图窗口：端口回非零日（UTC 自然日），此处补零成完整升序窗口。
        // 口径留痕：DB 以 UTC 存储并按 UTC 日期聚合；窗口与日期同样取 UTC
        // 自然日保证边界一致（mock 的本地时区合成仅属演示数据）。
        let by_day = self
            .storage
            .revisions_by_day(project_id, ACTIVITY_WINDOW_DAYS)
            .await?;
        let day_counts: HashMap<String, u64> =
            by_day.into_iter().map(|d| (d.date, d.count)).collect();
        let today = chrono::Utc::now().date_naive();
        let mut revisions_by_day = Vec::with_capacity(ACTIVITY_WINDOW_DAYS as usize);
        for recency in (0..ACTIVITY_WINDOW_DAYS).rev() {
            let date = (today - chrono::Duration::days(recency as i64)).to_string();
            let count = day_counts.get(&date).copied().unwrap_or(0);
            revisions_by_day.push((date, count));
        }

        Ok(ProjectStateSnapshot {
            by_type,
            item_by_status: ITEM_STATUSES
                .iter()
                .map(|s| (*s, item_by_status[s]))
                .collect(),
            task_by_status: TASK_STATUSES
                .iter()
                .map(|s| (*s, task_by_status[s]))
                .collect(),
            revisions_by_day,
        })
    }

    /// 项目级文档当前态（DOM-009）。summary 取最新修订（project_docs 表无
    /// summary 列——ER 契约；文档缺失 → NotFound{ProjectDoc} → DOC_NOT_FOUND）
    pub async fn project_doc(
        &self,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
    ) -> StorageResult<(ProjectDoc, String)> {
        self.require_project(project_id).await?;
        let doc = self
            .storage
            .get_project_doc(project_id, doc_key)
            .await?
            .ok_or(StorageError::NotFound {
                kind: NotFoundKind::ProjectDoc,
                id: doc_key.as_key().to_string(),
            })?;
        let summary = self
            .storage
            .list_project_doc_revisions(project_id, doc_key)
            .await?
            .last()
            .map(|r| r.summary.clone())
            .unwrap_or_default();
        Ok((doc, summary))
    }

    /// 文档修订历史（倒序，一次取齐含快照——同 get_item_revisions 策略）
    pub async fn list_project_doc_revisions(
        &self,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
    ) -> StorageResult<Vec<ProjectDocRevision>> {
        self.project_doc(project_id, doc_key).await?;
        let mut list = self
            .storage
            .list_project_doc_revisions(project_id, doc_key)
            .await?;
        list.reverse();
        Ok(list)
    }

    pub async fn list_items(
        &self,
        project_id: ProjectId,
        spec: &ItemListSpec,
    ) -> StorageResult<Vec<Item>> {
        self.require_project(project_id).await?;
        let filter = ItemFilter {
            item_types: spec.item_type.map(|t| vec![t]),
            statuses: spec.status.map(|s| vec![s]),
        };
        self.storage.list_items(project_id, &filter).await
    }

    /// 条目详情（ITEM_NOT_FOUND 语义统一在此判）
    pub async fn item_detail(&self, project_id: ProjectId, code: &str) -> StorageResult<Item> {
        self.require_project(project_id).await?;
        self.storage
            .get_item_by_code(project_id, code)
            .await?
            .ok_or(StorageError::NotFound {
                kind: NotFoundKind::Item,
                id: code.to_string(),
            })
    }

    /// 修订历史（倒序；创建时即有修订 1，空列表 = 条目不存在已被上游排除）
    pub async fn item_revisions(
        &self,
        project_id: ProjectId,
        code: &str,
    ) -> StorageResult<Vec<Revision>> {
        let item = self.item_detail(project_id, code).await?;
        let mut list = self.storage.list_revisions(item.id).await?;
        list.reverse();
        Ok(list)
    }

    /// 条目关联一层（出边+入边合并；peer 恒存在——关系随项目级联）
    pub async fn item_relations(
        &self,
        project_id: ProjectId,
        code: &str,
    ) -> StorageResult<Vec<RelationView>> {
        let item = self.item_detail(project_id, code).await?;
        let outgoing = self
            .storage
            .list_relations(
                project_id,
                &RelationFilter {
                    source: Some(item.id),
                    ..RelationFilter::default()
                },
            )
            .await?;
        let incoming = self
            .storage
            .list_relations(
                project_id,
                &RelationFilter {
                    target: Some(item.id),
                    ..RelationFilter::default()
                },
            )
            .await?;

        let mut peer_ids: Vec<_> = outgoing
            .iter()
            .map(|r| r.target_id)
            .chain(incoming.iter().map(|r| r.source_id))
            .collect();
        peer_ids.sort_unstable();
        peer_ids.dedup();
        let peers: HashMap<_, _> = self
            .storage
            .get_items_by_ids(project_id, &peer_ids)
            .await?
            .into_iter()
            .map(|p| (p.id, p))
            .collect();

        let mut views: Vec<RelationView> = Vec::with_capacity(outgoing.len() + incoming.len());
        for relation in &outgoing {
            if let Some(peer) = peers.get(&relation.target_id) {
                views.push(RelationView {
                    relation_type: relation.relation_type,
                    direction: Direction::Out,
                    peer: peer.clone(),
                });
            }
        }
        for relation in &incoming {
            if let Some(peer) = peers.get(&relation.source_id) {
                views.push(RelationView {
                    relation_type: relation.relation_type,
                    direction: Direction::In,
                    peer: peer.clone(),
                });
            }
        }
        // 确定性：类型固定序 → 方向 → 对端编号
        views.sort_by(|a, b| {
            (a.relation_type, a.peer.display_code.as_str()).cmp(&(
                b.relation_type,
                b.peer.display_code.as_str(),
            ))
        });
        Ok(views)
    }

    /// 看板（五列恒在；阻塞派生 BR-010——活跃上游才阻塞）
    pub async fn task_board(&self, project_id: ProjectId) -> StorageResult<TaskBoardSnapshot> {
        self.require_project(project_id).await?;
        let tasks = self
            .storage
            .list_items(
                project_id,
                &ItemFilter {
                    item_types: Some(vec![ItemType::Task]),
                    statuses: None,
                },
            )
            .await?;
        let edges = self.storage.edge_snapshot(project_id).await?;
        // 上游解析：task → 其 depends 上游（同项目存在条目）
        let mut upstream_codes: Vec<String> = edges
            .iter()
            .filter(|e| e.relation_type == RelationType::Depends)
            .map(|e| e.target.clone())
            .collect();
        upstream_codes.sort_unstable();
        upstream_codes.dedup();
        let upstreams: HashMap<_, _> = self
            .storage
            .get_items_by_codes(project_id, &upstream_codes)
            .await?
            .into_iter()
            .map(|p| (p.display_code.clone(), p))
            .collect();

        let mut columns = Vec::with_capacity(TASK_STATUSES.len());
        for &status in TASK_STATUSES {
            let mut column_tasks: Vec<BoardTask> = tasks
                .iter()
                .filter(|t| t.task_status() == status)
                .map(|t| {
                    let blocked_by = edges
                        .iter()
                        .filter(|e| {
                            e.relation_type == RelationType::Depends
                                && e.source == t.display_code
                        })
                        .filter_map(|e| upstreams.get(&e.target))
                        .filter(|up| {
                            // 仅活跃任务态上游阻塞（mock 定案：done/cancelled 不阻塞）
                            up.item_type == ItemType::Task && up.task_status().is_active()
                        })
                        .map(|up| BlockedBy {
                            code: up.display_code.clone(),
                            title: up.title.clone(),
                        })
                        .collect();
                    BoardTask {
                        item: t.clone(),
                        blocked_by,
                    }
                })
                .collect();
            column_tasks.sort_by(|a, b| a.item.display_code.cmp(&b.item.display_code));
            columns.push(BoardColumn {
                status,
                tasks: column_tasks,
            });
        }
        Ok(TaskBoardSnapshot { columns })
    }

    /// 搜索（FR-012 LIKE；matched_in 优先级 code → title → body，命中即归）
    pub async fn search(&self, project_id: ProjectId, q: &str) -> StorageResult<Vec<SearchSnapshot>> {
        self.require_project(project_id).await?;
        let items = self.storage.search_items(project_id, q).await?;
        let needle = q.trim().to_lowercase();
        Ok(items
            .into_iter()
            .map(|item| {
                let matched_in = if item.display_code.to_lowercase() == needle
                    || item.display_code.to_lowercase().starts_with(&needle)
                {
                    MatchedIn::Code
                } else if item.title.to_lowercase().contains(&needle) {
                    MatchedIn::Title
                } else {
                    MatchedIn::Body
                };
                SearchSnapshot { item, matched_in }
            })
            .collect())
    }

    /// 影响定位（FR-013 / MCP get_context 共用：入边反向闭包，默认 3 上限 10）
    pub async fn impact(
        &self,
        project_id: ProjectId,
        code: &str,
        depth: Option<u32>,
    ) -> StorageResult<ImpactSnapshot> {
        let trigger = self.item_detail(project_id, code).await?;
        let edges = self.storage.edge_snapshot(project_id).await?;
        let typed: Vec<(String, String, RelationType)> = edges
            .into_iter()
            .filter(|e| e.relation_type.participates_in_impact())
            .map(|e| (e.source, e.target, e.relation_type))
            .collect();
        let max_depth = depth.unwrap_or(IMPACT_DEFAULT_DEPTH).min(IMPACT_MAX_DEPTH);
        let hits = impact_closure(code, &typed, max_depth);
        let codes: Vec<String> = hits.iter().map(|h| h.code.clone()).collect();
        let mut items: HashMap<_, _> = self
            .storage
            .get_items_by_codes(project_id, &codes)
            .await?
            .into_iter()
            .map(|p| (p.display_code.clone(), p))
            .collect();
        let entries = hits
            .into_iter()
            .filter_map(|hit| {
                let item = items.remove(&hit.code)?;
                Some(ImpactEntry {
                    item,
                    depth: hit.depth,
                    via: hit.via,
                })
            })
            .collect();
        Ok(ImpactSnapshot { trigger, entries })
    }

    /// 跨条目最近修订（概览页最近修订卡，倒序）
    pub async fn recent_revisions(
        &self,
        project_id: ProjectId,
        limit: u32,
    ) -> StorageResult<Vec<RecentRevision>> {
        self.require_project(project_id).await?;
        self.storage.recent_revisions(project_id, limit).await
    }
}
