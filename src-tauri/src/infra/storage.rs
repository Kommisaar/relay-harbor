//! 存储设施（CMP-006）：sqlx + SQLite 实现 domain::ports::Storage。
//! 连接形态（data-model.md 事务边界）：单写连接池（写操作串行）+ 只读池
//!（WAL 快照读）；WAL、busy_timeout=5000ms、foreign_keys=ON、synchronous=FULL
//!（NFR-001 把断电列入驱动场景，取 FULL 保已提交数据零丢失——写量万级无压力）。
//! 每个端口写方法一个 BEGIN IMMEDIATE 事务（begin_with），事务内完成
//! OCC 校验 → 变更落库 → 编号分配 → 修订追加（ADR-002）。
//!
//! 偏差留痕 2026-09-05：设计注明「sqlx 编译期校验 SQL」——query! 宏需随
//! 每次查询变更维护 .sqlx 离线缓存（sqlx-cli），对本仓库的 Agent 协作流程
//! 成本过高；改用运行时参数绑定（sqlx::query）+ 集成测试覆盖全部查询路径
//!（tests/storage_sqlite.rs），SQL 拼写由测试网关把守，语义等价。
//!
//! 真崩溃注入（NFR-001 强杀进程）与规模计时（NFR-002）留 P6 NFR 验收。

mod records;

use std::path::Path;
use std::time::Duration;

use async_trait::async_trait;
use chrono::Utc;
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous,
};
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool, Transaction};

use crate::domain::changeset::ContentChanges;
use crate::domain::error::DomainError;
use crate::domain::item::{
    can_transition, edit_effect, status_from_storage, transition_requirements, AnyStatus,
    DisplayCode, Item, ItemId, ItemType, ItemStatus,
};
use crate::domain::ports::{
    DeleteStats, DayRevisionCount, EdgeByCode, ItemChange, ItemFilter, NotFoundKind,
    ProjectDocChange, RecentRevision, RelationChange, RelationFilter, Storage, StorageError,
    StorageResult, TypeStatusCount,
};
use crate::domain::project::{Project, ProjectDoc, ProjectDocKey, ProjectId};
use crate::domain::relation::{
    check_endpoints, find_depends_cycle, Relation, RelationId, RelationType,
};
use crate::domain::revision::{
    ensure_revision_match, DocContent, ProjectDocRevision, Revision, RevisionContent,
};
use crate::domain::task::TaskStatus;

use records::{
    domain, internal, map_doc, map_doc_revision, map_item, map_project, map_relation,
    map_revision, parse_uuid, status_text,
};

/// sqlx 错误 → 存储内部错误（ infra 层唯一转换点；domain 不依赖 sqlx）
impl From<sqlx::Error> for StorageError {
    fn from(e: sqlx::Error) -> Self {
        StorageError::Internal(e.to_string())
    }
}

/// 条目未命中（写路径；kind 供 interfaces 映射 ITEM_NOT_FOUND）
fn not_found_item(code: &str) -> StorageError {
    StorageError::NotFound {
        kind: NotFoundKind::Item,
        id: code.to_string(),
    }
}

/// 已知迁移最高版本（降级检查，NFR-006；新增迁移文件时同步更新）
const LATEST_MIGRATION_VERSION: i64 = 20260905000001;

pub struct SqliteStorage {
    /// 写路径（单连接，写事务串行）
    write: SqlitePool,
    /// 读路径（只读连接，WAL 快照读无锁竞争）
    read: SqlitePool,
}

impl SqliteStorage {
    /// 打开（或创建）数据库并执行迁移。降级（库内版本 > 应用已知版本）明确报错。
    pub async fn open(db_path: &Path) -> StorageResult<Self> {
        let write = Self::connect_pool(db_path, false, 1).await?;
        let storage = Self {
            read: Self::connect_pool(db_path, true, 4).await?,
            write,
        };
        storage.run_migrations().await?;
        Ok(storage)
    }

    async fn connect_pool(db_path: &Path, read_only: bool, max: u32) -> StorageResult<SqlitePool> {
        let options = SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(!read_only)
            .read_only(read_only)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Full)
            .busy_timeout(Duration::from_millis(5000))
            .foreign_keys(true);
        SqlitePoolOptions::new()
            .max_connections(max)
            .connect_with(options)
            .await
            .map_err(internal)
    }

    async fn run_migrations(&self) -> StorageResult<()> {
        sqlx::migrate!()
            .run(&self.write)
            .await
            .map_err(|e| StorageError::Internal(format!("迁移执行失败：{e}")))?;
        // 降级检查：库内最高版本不得新于应用已知版本（NFR-006 明确报错而非静默损坏）
        let applied_max: Option<i64> =
            sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
                .fetch_one(&self.write)
                .await
                .map_err(internal)?;
        if applied_max.unwrap_or(0) > LATEST_MIGRATION_VERSION {
            return Err(StorageError::Internal(format!(
                "数据库迁移版本 {applied_max:?} 新于应用已知版本 {LATEST_MIGRATION_VERSION}：不支持降级打开（NFR-006）"
            )));
        }
        tracing::info!(applied_max = applied_max.unwrap_or(0), "迁移完成");
        Ok(())
    }

    /// 写事务入口（ADR-002）：BEGIN IMMEDIATE 即刻取写锁，失败自动 ROLLBACK
    async fn begin_tx(&self) -> StorageResult<Transaction<'static, Sqlite>> {
        self.write
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(internal)
    }

    /// 事务内按编号取条目（写路径辅助；None → NotFound 语义）
    async fn get_item_tx(
        tx: &mut Transaction<'static, Sqlite>,
        project_id: ProjectId,
        code: &str,
    ) -> StorageResult<Option<Item>> {
        let row = sqlx::query("SELECT * FROM items WHERE project_id = ? AND display_code = ?")
            .bind(project_id.to_string())
            .bind(code)
            .fetch_optional(&mut **tx)
            .await
            .map_err(internal)?;
        row.map(|r| map_item(&r)).transpose()
    }

    /// 事务内取 depends 编号边快照（环检测输入）
    async fn depends_edges_tx(
        tx: &mut Transaction<'static, Sqlite>,
        project_id: ProjectId,
    ) -> StorageResult<Vec<(String, String)>> {
        let rows = sqlx::query(
            "SELECT s.display_code AS source_code, t.display_code AS target_code \
             FROM relations r \
             JOIN items s ON r.source_id = s.id \
             JOIN items t ON r.target_id = t.id \
             WHERE r.project_id = ? AND r.relation_type = 'depends'",
        )
        .bind(project_id.to_string())
        .fetch_all(&mut **tx)
        .await
        .map_err(internal)?;
        rows.iter()
            .map(|r| {
                Ok((
                    r.try_get::<String, _>("source_code")?,
                    r.try_get::<String, _>("target_code")?,
                ))
            })
            .collect()
    }
}

/// 修订标题自动生成（2026-09-03 指令：title 落档替代 actor；操作者审计归 NFR-007 日志）
fn edit_revision_title(changes: &ContentChanges) -> String {
    let mut parts: Vec<&str> = Vec::new();
    if changes.title.is_some() {
        parts.push("标题");
    }
    if changes.body_md.is_some() {
        parts.push("正文");
    }
    if changes.metadata.is_some() {
        parts.push("元数据");
    }
    let fields = match parts.as_slice() {
        [a] => (*a).to_string(),
        [a, b] => format!("{a}与{b}"),
        _ => "标题、正文与元数据".to_string(),
    };
    format!("编辑{fields}")
}

#[async_trait]
impl Storage for SqliteStorage {
    // ---- 项目 ----

    async fn create_project(
        &self,
        name: &str,
        repo_path: Option<&str>,
    ) -> StorageResult<Project> {
        let id = ProjectId::new_v4();
        let now = Utc::now();
        let mut tx = self.begin_tx().await?;
        sqlx::query("INSERT INTO projects (id, name, repo_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
            .bind(id.to_string())
            .bind(name)
            .bind(repo_path)
            .bind(now)
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(internal)?;
        tx.commit().await.map_err(internal)?;
        tracing::info!(project = %id, "创建项目");
        Ok(Project {
            id,
            name: name.to_string(),
            repo_path: repo_path.map(Into::into),
            created_at: now,
            updated_at: now,
        })
    }

    async fn delete_project(&self, project_id: ProjectId) -> StorageResult<DeleteStats> {
        let pid = project_id.to_string();
        let mut tx = self.begin_tx().await?;
        // 统计先行（级联删除将一并移除；INV-010/BR-011 单事务）
        let items = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM items WHERE project_id = ?",
        )
        .bind(&pid)
        .fetch_one(&mut *tx)
        .await
        .map_err(internal)?;
        let relations = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM relations WHERE project_id = ?",
        )
        .bind(&pid)
        .fetch_one(&mut *tx)
        .await
        .map_err(internal)?;
        let revisions = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM revisions r JOIN items i ON r.item_id = i.id \
             WHERE i.project_id = ?",
        )
        .bind(&pid)
        .fetch_one(&mut *tx)
        .await
        .map_err(internal)?;
        let result = sqlx::query("DELETE FROM projects WHERE id = ?")
            .bind(&pid)
            .execute(&mut *tx)
            .await
            .map_err(internal)?;
        if result.rows_affected() == 0 {
            return Err(StorageError::NotFound {
                kind: NotFoundKind::Project,
                id: project_id.to_string(),
            });
        }
        tx.commit().await.map_err(internal)?;
        tracing::info!(project = %project_id, items, relations, revisions, "删除项目（级联）");
        Ok(DeleteStats {
            items: items as u64,
            relations: relations as u64,
            revisions: revisions as u64,
        })
    }

    // ---- 条目写路径 ----

    async fn create_item(
        &self,
        project_id: ProjectId,
        item_type: ItemType,
        title: &str,
        body_md: &str,
        metadata: serde_json::Value,
    ) -> StorageResult<ItemChange> {
        let pid = project_id.to_string();
        let mut tx = self.begin_tx().await?;
        // 编号分配（BR-001 纯函数 + 事务内取号）：当前前缀最大序号 +1，
        // UNIQUE(project_id, display_code) 兜底并发冲突（单进程下不发生）
        let max_seq: Option<i64> = sqlx::query_scalar(
            "SELECT MAX(CAST(SUBSTR(display_code, ?) AS INTEGER)) FROM items \
             WHERE project_id = ? AND item_type = ?",
        )
        .bind(item_type.prefix().len() as i64 + 2)
        .bind(&pid)
        .bind(item_type.prefix())
        .fetch_one(&mut *tx)
        .await
        .map_err(internal)?;
        let code = DisplayCode::next(item_type, max_seq.map(|s| s as u32)).as_code();
        let now = Utc::now();
        let item_id = ItemId::new_v4();
        // 创建即修订 1（INV-004）；状态由类型选机：非 TASK=draft、TASK=todo
        let status = if item_type.is_task() {
            AnyStatus::Task(TaskStatus::Todo)
        } else {
            AnyStatus::Item(ItemStatus::Draft)
        };
        let metadata_text = serde_json::to_string(&metadata).map_err(internal)?;
        sqlx::query(
            "INSERT INTO items (id, project_id, display_code, item_type, title, body_md, \
             metadata, status, current_revision, superseded_by, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)",
        )
        .bind(item_id.to_string())
        .bind(&pid)
        .bind(&code)
        .bind(item_type.prefix())
        .bind(title)
        .bind(body_md)
        .bind(&metadata_text)
        .bind(status_text(&status))
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
        let snapshot = serde_json::to_string(&RevisionContent {
            title: title.to_string(),
            body_md: body_md.to_string(),
            metadata: metadata.clone(),
            status: status_text(&status),
        })
        .map_err(internal)?;
        let revision = Revision {
            item_id,
            revision_no: 1,
            title: "创建条目".to_string(),
            summary: String::new(),
            content: RevisionContent {
                title: title.to_string(),
                body_md: body_md.to_string(),
                metadata: metadata.clone(),
                status: status_text(&status),
            },
            changed_at: now,
        };
        sqlx::query(
            "INSERT INTO revisions (item_id, revision_no, title, summary, content_snapshot, changed_at) \
             VALUES (?, 1, ?, ?, ?, ?)",
        )
        .bind(item_id.to_string())
        .bind(&revision.title)
        .bind(&revision.summary)
        .bind(&snapshot)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
        tx.commit().await.map_err(internal)?;
        tracing::info!(project = %project_id, code = %code, "创建条目");
        Ok(ItemChange {
            item: Item {
                id: item_id,
                project_id,
                display_code: code,
                item_type,
                title: title.to_string(),
                body_md: body_md.to_string(),
                metadata,
                status,
                current_revision: 1,
                superseded_by: None,
                created_at: now,
                updated_at: now,
            },
            revision,
        })
    }

    async fn edit_item(
        &self,
        project_id: ProjectId,
        code: &str,
        expected_revision: u32,
        changes: &ContentChanges,
    ) -> StorageResult<ItemChange> {
        let mut tx = self.begin_tx().await?;
        let item = Self::get_item_tx(&mut tx, project_id, code)
            .await?
            .ok_or_else(|| not_found_item(code))?;
        // 终态禁内容编辑（BR-002 例外/BR-003：终态条目不可变更）
        if item.status.is_terminal() {
            return Err(DomainError::Terminal {
                code: code.to_string(),
                status: item.status.to_string(),
            }
            .into());
        }
        ensure_revision_match(code, expected_revision, item.current_revision).map_err(domain)?;
        changes.ensure_non_empty(code).map_err(domain)?;

        // BR-009 退回判定（仅非 TASK、仅标题/正文实际变更；TASK 编辑只产修订）
        let title_changed = changes.title.as_deref().is_some_and(|t| t != item.title);
        let body_changed = changes.body_md.as_deref().is_some_and(|b| b != item.body_md);
        let new_status = if item.item_type.is_task() {
            item.status
        } else {
            AnyStatus::Item(edit_effect(item.item_status(), title_changed, body_changed))
        };

        let new_title = changes.title.clone().unwrap_or_else(|| item.title.clone());
        let new_body = changes.body_md.clone().unwrap_or_else(|| item.body_md.clone());
        let new_meta = changes.metadata.clone().unwrap_or_else(|| item.metadata.clone());
        let new_revision_no = item.current_revision + 1;
        let now = Utc::now();
        let meta_text = serde_json::to_string(&new_meta).map_err(internal)?;
        let result = sqlx::query(
            "UPDATE items SET title = ?, body_md = ?, metadata = ?, status = ?, \
             current_revision = ?, updated_at = ? \
             WHERE id = ? AND current_revision = ?",
        )
        .bind(&new_title)
        .bind(&new_body)
        .bind(&meta_text)
        .bind(status_text(&new_status))
        .bind(new_revision_no as i64)
        .bind(now)
        .bind(item.id.to_string())
        .bind(item.current_revision as i64)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::Conflict {
                code: code.to_string(),
                expected: expected_revision,
                current: item.current_revision,
            }
            .into());
        }
        let revision = Revision {
            item_id: item.id,
            revision_no: new_revision_no,
            title: edit_revision_title(changes),
            summary: String::new(),
            content: RevisionContent {
                title: new_title.clone(),
                body_md: new_body.clone(),
                metadata: new_meta.clone(),
                status: status_text(&new_status),
            },
            changed_at: now,
        };
        sqlx::query(
            "INSERT INTO revisions (item_id, revision_no, title, summary, content_snapshot, changed_at) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(item.id.to_string())
        .bind(revision.revision_no as i64)
        .bind(&revision.title)
        .bind(&revision.summary)
        .bind(serde_json::to_string(&revision.content).map_err(internal)?)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
        tx.commit().await.map_err(internal)?;
        tracing::info!(code = %code, revision = new_revision_no, "编辑条目");
        Ok(ItemChange {
            item: Item {
                title: new_title,
                body_md: new_body,
                metadata: new_meta,
                status: new_status,
                current_revision: new_revision_no,
                updated_at: now,
                ..item
            },
            revision,
        })
    }

    async fn transition_item(
        &self,
        project_id: ProjectId,
        code: &str,
        expected_revision: u32,
        to: AnyStatus,
        superseded_by: Option<&str>,
        confirm: bool,
    ) -> StorageResult<ItemChange> {
        let mut tx = self.begin_tx().await?;
        let item = Self::get_item_tx(&mut tx, project_id, code)
            .await?
            .ok_or_else(|| not_found_item(code))?;
        ensure_revision_match(code, expected_revision, item.current_revision).map_err(domain)?;
        can_transition(item.item_type, code, &item.status, &to).map_err(domain)?;

        // BR-008 终态参数要求（任务取消同样需要显式确认）
        let (needs_confirm, needs_superseded_by) = match to {
            AnyStatus::Item(st) => {
                let req = transition_requirements(st);
                (req.needs_confirm, req.needs_superseded_by)
            }
            AnyStatus::Task(st) => (st == TaskStatus::Cancelled, false),
        };
        if needs_confirm && !confirm {
            return Err(DomainError::Validation {
                message: format!("迁移 {code} → {to} 需要显式确认参数（BR-008）"),
            }
            .into());
        }
        // INV-006：替代者必填、同项目存在、非自身、非终态
        let (new_superseded_by, sup_code) = match (needs_superseded_by, superseded_by) {
            (true, Some(sup)) => {
                if sup == code {
                    return Err(DomainError::Validation {
                        message: format!("条目 {code} 不能以自身为替代者（INV-006）"),
                    }
                    .into());
                }
                let sup_item = Self::get_item_tx(&mut tx, project_id, sup)
                    .await?
                    .ok_or(DomainError::Dangling {
                        code: sup.to_string(),
                    })
                    .map_err(domain)?;
                if sup_item.status.is_terminal() {
                    return Err(DomainError::Validation {
                        message: format!("替代者 {sup} 处于终态，不得作为替代者（INV-006）"),
                    }
                    .into());
                }
                (Some(sup_item.id), Some(sup.to_string()))
            }
            (true, None) => {
                return Err(DomainError::Validation {
                    message: format!("迁移 {code} → superseded 必须指定替代者（BR-008）"),
                }
                .into())
            }
            (false, _) => (item.superseded_by, None),
        };

        let new_revision_no = item.current_revision + 1;
        let now = Utc::now();
        let result = sqlx::query(
            "UPDATE items SET status = ?, superseded_by = ?, current_revision = ?, updated_at = ? \
             WHERE id = ? AND current_revision = ?",
        )
        .bind(status_text(&to))
        .bind(new_superseded_by.map(|id| id.to_string()))
        .bind(new_revision_no as i64)
        .bind(now)
        .bind(item.id.to_string())
        .bind(item.current_revision as i64)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::Conflict {
                code: code.to_string(),
                expected: expected_revision,
                current: item.current_revision,
            }
            .into());
        }
        let revision = Revision {
            item_id: item.id,
            revision_no: new_revision_no,
            title: "状态迁移".to_string(),
            summary: match sup_code.as_deref() {
                Some(sup_code) => format!("status: {} → {to}（替代者 {sup_code}）", item.status),
                None => format!("status: {} → {to}", item.status),
            },
            content: RevisionContent {
                title: item.title.clone(),
                body_md: item.body_md.clone(),
                metadata: item.metadata.clone(),
                status: status_text(&to),
            },
            changed_at: now,
        };
        sqlx::query(
            "INSERT INTO revisions (item_id, revision_no, title, summary, content_snapshot, changed_at) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(item.id.to_string())
        .bind(revision.revision_no as i64)
        .bind(&revision.title)
        .bind(&revision.summary)
        .bind(serde_json::to_string(&revision.content).map_err(internal)?)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
        tx.commit().await.map_err(internal)?;
        tracing::info!(code = %code, from = %item.status, to = %to, "状态迁移");
        Ok(ItemChange {
            item: Item {
                status: to,
                superseded_by: new_superseded_by,
                current_revision: new_revision_no,
                updated_at: now,
                ..item
            },
            revision,
        })
    }

    // ---- 关系 ----

    async fn add_relation(
        &self,
        project_id: ProjectId,
        source: &str,
        target: &str,
        relation_type: RelationType,
    ) -> StorageResult<RelationChange> {
        let mut tx = self.begin_tx().await?;
        let src = Self::get_item_tx(&mut tx, project_id, source)
            .await?
            .ok_or(DomainError::Dangling {
                code: source.to_string(),
            })
            .map_err(domain)?;
        let tgt = Self::get_item_tx(&mut tx, project_id, target)
            .await?
            .ok_or(DomainError::Dangling {
                code: target.to_string(),
            })
            .map_err(domain)?;
        check_endpoints(&src, &tgt).map_err(domain)?;
        // BR-007：仅 depends 参与环约束；成环拒绝并返回环上序列
        if relation_type == RelationType::Depends {
            let edges = Self::depends_edges_tx(&mut tx, project_id).await?;
            if let Some(path) = find_depends_cycle(source, target, &edges) {
                return Err(DomainError::Cycle { path }.into());
            }
        }
        // 幂等：同三元组已存在返回原关系
        let existing: Option<String> = sqlx::query_scalar(
            "SELECT id FROM relations WHERE source_id = ? AND target_id = ? AND relation_type = ?",
        )
        .bind(src.id.to_string())
        .bind(tgt.id.to_string())
        .bind(relation_type.as_str())
        .fetch_optional(&mut *tx)
        .await
        .map_err(internal)?;
        if let Some(id) = existing {
            return Ok(RelationChange {
                relation: Relation {
                    id: parse_uuid(&id)?,
                    project_id,
                    source_id: src.id,
                    target_id: tgt.id,
                    relation_type,
                },
                created: false,
            });
        }
        let id = RelationId::new_v4();
        sqlx::query(
            "INSERT INTO relations (id, project_id, source_id, target_id, relation_type) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(project_id.to_string())
        .bind(src.id.to_string())
        .bind(tgt.id.to_string())
        .bind(relation_type.as_str())
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
        tx.commit().await.map_err(internal)?;
        tracing::info!(source = %source, target = %target, r#type = relation_type.as_str(), "建立关系");
        Ok(RelationChange {
            relation: Relation {
                id,
                project_id,
                source_id: src.id,
                target_id: tgt.id,
                relation_type,
            },
            created: true,
        })
    }

    async fn remove_relation(
        &self,
        project_id: ProjectId,
        source: &str,
        target: &str,
        relation_type: RelationType,
    ) -> StorageResult<()> {
        let mut tx = self.begin_tx().await?;
        let src = Self::get_item_tx(&mut tx, project_id, source)
            .await?
            .ok_or(DomainError::Dangling {
                code: source.to_string(),
            })
            .map_err(domain)?;
        let tgt = Self::get_item_tx(&mut tx, project_id, target)
            .await?
            .ok_or(DomainError::Dangling {
                code: target.to_string(),
            })
            .map_err(domain)?;
        // 幂等（api-contracts）：不存在的组合返回 ok，不报错
        sqlx::query(
            "DELETE FROM relations WHERE source_id = ? AND target_id = ? AND relation_type = ?",
        )
        .bind(src.id.to_string())
        .bind(tgt.id.to_string())
        .bind(relation_type.as_str())
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
        tx.commit().await.map_err(internal)?;
        tracing::info!(source = %source, target = %target, r#type = relation_type.as_str(), "移除关系");
        Ok(())
    }

    // ---- 项目级文档（DOM-009）----

    async fn set_project_doc(
        &self,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
        expected_revision: u32,
        title: Option<&str>,
        body_md: &str,
    ) -> StorageResult<ProjectDocChange> {
        let pid = project_id.to_string();
        let mut tx = self.begin_tx().await?;
        let row = sqlx::query("SELECT * FROM project_docs WHERE project_id = ? AND doc_key = ?")
            .bind(&pid)
            .bind(doc_key.as_key())
            .fetch_optional(&mut *tx)
            .await
            .map_err(internal)?;
        let now = Utc::now();
        let (doc, revision) = match row {
            Some(row) => {
                let doc = map_doc(&row)?;
                ensure_revision_match(doc_key.as_key(), expected_revision, doc.current_revision)
                    .map_err(domain)?;
                let new_revision_no = doc.current_revision + 1;
                let new_title = title.map(Into::into).unwrap_or(doc.title.clone());
                let result = sqlx::query(
                    "UPDATE project_docs SET title = ?, body_md = ?, current_revision = ?, updated_at = ? \
                     WHERE project_id = ? AND doc_key = ? AND current_revision = ?",
                )
                .bind(&new_title)
                .bind(body_md)
                .bind(new_revision_no as i64)
                .bind(now)
                .bind(&pid)
                .bind(doc_key.as_key())
                .bind(doc.current_revision as i64)
                .execute(&mut *tx)
                .await
                .map_err(internal)?;
                if result.rows_affected() == 0 {
                    return Err(DomainError::Conflict {
                        code: doc_key.as_key().to_string(),
                        expected: expected_revision,
                        current: doc.current_revision,
                    }
                    .into());
                }
                let revision = ProjectDocRevision {
                    project_id,
                    doc_key,
                    revision_no: new_revision_no,
                    title: "更新文档".to_string(),
                    summary: String::new(),
                    content: DocContent {
                        title: new_title.clone(),
                        body_md: body_md.to_string(),
                    },
                    changed_at: now,
                };
                sqlx::query(
                    "INSERT INTO project_doc_revisions (project_id, doc_key, revision_no, title, summary, content_snapshot, changed_at) \
                     VALUES (?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&pid)
                .bind(doc_key.as_key())
                .bind(revision.revision_no as i64)
                .bind(&revision.title)
                .bind(&revision.summary)
                .bind(serde_json::to_string(&revision.content).map_err(internal)?)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(internal)?;
                (
                    ProjectDoc {
                        title: new_title,
                        body_md: body_md.to_string(),
                        current_revision: new_revision_no,
                        updated_at: now,
                        ..doc
                    },
                    revision,
                )
            }
            // 首次写入契约细化（留痕 2026-09-05）：新文档以 expected_revision = 0 创建，
            // 修订号从 1 起；expected ≠ 0 视为 OCC 冲突（current=0）
            None => {
                if expected_revision != 0 {
                    return Err(DomainError::Conflict {
                        code: doc_key.as_key().to_string(),
                        expected: expected_revision,
                        current: 0,
                    }
                    .into());
                }
                let new_title = title.map(Into::into).unwrap_or_else(|| doc_key.as_key().to_string());
                sqlx::query(
                    "INSERT INTO project_docs (project_id, doc_key, title, body_md, current_revision, updated_at) \
                     VALUES (?, ?, ?, ?, 1, ?)",
                )
                .bind(&pid)
                .bind(doc_key.as_key())
                .bind(&new_title)
                .bind(body_md)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(internal)?;
                let revision = ProjectDocRevision {
                    project_id,
                    doc_key,
                    revision_no: 1,
                    title: "创建文档".to_string(),
                    summary: String::new(),
                    content: DocContent {
                        title: new_title.clone(),
                        body_md: body_md.to_string(),
                    },
                    changed_at: now,
                };
                sqlx::query(
                    "INSERT INTO project_doc_revisions (project_id, doc_key, revision_no, title, summary, content_snapshot, changed_at) \
                     VALUES (?, ?, 1, ?, ?, ?, ?)",
                )
                .bind(&pid)
                .bind(doc_key.as_key())
                .bind(&revision.title)
                .bind(&revision.summary)
                .bind(serde_json::to_string(&revision.content).map_err(internal)?)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(internal)?;
                (
                    ProjectDoc {
                        project_id,
                        doc_key,
                        title: new_title,
                        body_md: body_md.to_string(),
                        current_revision: 1,
                        updated_at: now,
                    },
                    revision,
                )
            }
        };
        tx.commit().await.map_err(internal)?;
        tracing::info!(project = %project_id, doc = doc_key.as_key(), revision = revision.revision_no, "写入项目文档");
        Ok(ProjectDocChange { doc, revision })
    }

    // ---- 读路径（WAL 快照读）----

    async fn list_projects(&self) -> StorageResult<Vec<Project>> {
        let rows = sqlx::query("SELECT * FROM projects ORDER BY updated_at DESC, name ASC")
            .fetch_all(&self.read)
            .await
            .map_err(internal)?;
        rows.iter().map(map_project).collect()
    }

    async fn get_project(&self, project_id: ProjectId) -> StorageResult<Option<Project>> {
        let row = sqlx::query("SELECT * FROM projects WHERE id = ?")
            .bind(project_id.to_string())
            .fetch_optional(&self.read)
            .await
            .map_err(internal)?;
        row.map(|r| map_project(&r)).transpose()
    }

    async fn list_items(
        &self,
        project_id: ProjectId,
        filter: &ItemFilter,
    ) -> StorageResult<Vec<Item>> {
        let mut qb = QueryBuilder::new(
            "SELECT * FROM items WHERE project_id = ",
        );
        qb.push_bind(project_id.to_string());
        if let Some(types) = &filter.item_types {
            if !types.is_empty() {
                qb.push(" AND item_type IN (");
                let mut sep = qb.separated(", ");
                for t in types {
                    sep.push_bind(t.prefix().to_string());
                }
                qb.push(")");
            }
        }
        if let Some(statuses) = &filter.statuses {
            if !statuses.is_empty() {
                qb.push(" AND status IN (");
                let mut sep = qb.separated(", ");
                for s in statuses {
                    sep.push_bind(status_text(s));
                }
                qb.push(")");
            }
        }
        qb.push(" ORDER BY display_code");
        let rows = qb.build().fetch_all(&self.read).await.map_err(internal)?;
        rows.iter().map(map_item).collect()
    }

    async fn get_item_by_code(
        &self,
        project_id: ProjectId,
        code: &str,
    ) -> StorageResult<Option<Item>> {
        let row = sqlx::query("SELECT * FROM items WHERE project_id = ? AND display_code = ?")
            .bind(project_id.to_string())
            .bind(code)
            .fetch_optional(&self.read)
            .await
            .map_err(internal)?;
        row.map(|r| map_item(&r)).transpose()
    }

    async fn get_item_by_id(&self, item_id: ItemId) -> StorageResult<Option<Item>> {
        let row = sqlx::query("SELECT * FROM items WHERE id = ?")
            .bind(item_id.to_string())
            .fetch_optional(&self.read)
            .await
            .map_err(internal)?;
        row.map(|r| map_item(&r)).transpose()
    }

    async fn get_items_by_ids(
        &self,
        project_id: ProjectId,
        ids: &[ItemId],
    ) -> StorageResult<Vec<Item>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let mut qb = QueryBuilder::new("SELECT * FROM items WHERE project_id = ");
        qb.push_bind(project_id.to_string()).push(" AND id IN (");
        let mut sep = qb.separated(", ");
        for id in ids {
            sep.push_bind(id.to_string());
        }
        qb.push(") ORDER BY display_code");
        let rows = qb.build().fetch_all(&self.read).await.map_err(internal)?;
        rows.iter().map(map_item).collect()
    }

    async fn get_items_by_codes(
        &self,
        project_id: ProjectId,
        codes: &[String],
    ) -> StorageResult<Vec<Item>> {
        if codes.is_empty() {
            return Ok(Vec::new());
        }
        let mut qb = QueryBuilder::new("SELECT * FROM items WHERE project_id = ");
        qb.push_bind(project_id.to_string()).push(" AND display_code IN (");
        let mut sep = qb.separated(", ");
        for code in codes {
            sep.push_bind(code.clone());
        }
        qb.push(") ORDER BY display_code");
        let rows = qb.build().fetch_all(&self.read).await.map_err(internal)?;
        rows.iter().map(map_item).collect()
    }

    async fn list_revisions(&self, item_id: ItemId) -> StorageResult<Vec<Revision>> {
        let rows = sqlx::query("SELECT * FROM revisions WHERE item_id = ? ORDER BY revision_no")
            .bind(item_id.to_string())
            .fetch_all(&self.read)
            .await
            .map_err(internal)?;
        rows.iter().map(map_revision).collect()
    }

    async fn list_relations(
        &self,
        project_id: ProjectId,
        filter: &RelationFilter,
    ) -> StorageResult<Vec<Relation>> {
        let mut qb = QueryBuilder::new(
            "SELECT r.* FROM relations r \
             JOIN items s ON r.source_id = s.id \
             JOIN items t ON r.target_id = t.id \
             WHERE r.project_id = ",
        );
        qb.push_bind(project_id.to_string());
        if let Some(source) = &filter.source {
            qb.push(" AND r.source_id = ").push_bind(source.to_string());
        }
        if let Some(target) = &filter.target {
            qb.push(" AND r.target_id = ").push_bind(target.to_string());
        }
        if let Some(types) = &filter.relation_types {
            if !types.is_empty() {
                qb.push(" AND r.relation_type IN (");
                let mut sep = qb.separated(", ");
                for t in types {
                    sep.push_bind(t.as_str().to_string());
                }
                qb.push(")");
            }
        }
        qb.push(" ORDER BY r.relation_type, s.display_code, t.display_code");
        let rows = qb.build().fetch_all(&self.read).await.map_err(internal)?;
        rows.iter().map(map_relation).collect()
    }

    async fn get_relations_by_ids(
        &self,
        ids: &[RelationId],
    ) -> StorageResult<Vec<Relation>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let mut qb = QueryBuilder::new("SELECT * FROM relations WHERE id IN (");
        let mut sep = qb.separated(", ");
        for id in ids {
            sep.push_bind(id.to_string());
        }
        qb.push(")");
        let rows = qb.build().fetch_all(&self.read).await.map_err(internal)?;
        rows.iter().map(map_relation).collect()
    }

    async fn edge_snapshot(&self, project_id: ProjectId) -> StorageResult<Vec<EdgeByCode>> {
        let rows = sqlx::query(
            "SELECT s.display_code AS source_code, t.display_code AS target_code, r.relation_type \
             FROM relations r \
             JOIN items s ON r.source_id = s.id \
             JOIN items t ON r.target_id = t.id \
             WHERE r.project_id = ?",
        )
        .bind(project_id.to_string())
        .fetch_all(&self.read)
        .await
        .map_err(internal)?;
        rows.iter()
            .map(|row| {
                let type_text: String = row.try_get("relation_type")?;
                Ok(EdgeByCode {
                    source: row.try_get("source_code")?,
                    target: row.try_get("target_code")?,
                    relation_type: RelationType::parse(&type_text)
                        .ok_or_else(|| internal(format!("损坏的关系类型 {type_text:?}")))?,
                })
            })
            .collect()
    }

    async fn count_items_by_type_status(
        &self,
        project_id: ProjectId,
    ) -> StorageResult<Vec<TypeStatusCount>> {
        let rows = sqlx::query(
            "SELECT item_type, status, COUNT(*) AS c FROM items \
             WHERE project_id = ? GROUP BY item_type, status",
        )
        .bind(project_id.to_string())
        .fetch_all(&self.read)
        .await
        .map_err(internal)?;
        rows.iter()
            .map(|row| {
                let type_text: String = row.try_get("item_type")?;
                let item_type = ItemType::from_prefix(&type_text)
                    .ok_or_else(|| internal(format!("损坏的条目类型 {type_text:?}")))?;
                let status_text_value: String = row.try_get("status")?;
                Ok(TypeStatusCount {
                    item_type,
                    status: status_from_storage(item_type, &status_text_value)
                        .map_err(internal)?,
                    count: row.try_get::<i64, _>("c")? as u64,
                })
            })
            .collect()
    }

    async fn revisions_by_day(
        &self,
        project_id: ProjectId,
        days: u16,
    ) -> StorageResult<Vec<DayRevisionCount>> {
        let cutoff = Utc::now() - chrono::Duration::days(days as i64);
        let rows = sqlx::query(
            "SELECT date(r.changed_at) AS d, COUNT(*) AS c \
             FROM revisions r JOIN items i ON r.item_id = i.id \
             WHERE i.project_id = ? AND r.changed_at >= ? \
             GROUP BY d ORDER BY d",
        )
        .bind(project_id.to_string())
        .bind(cutoff)
        .fetch_all(&self.read)
        .await
        .map_err(internal)?;
        rows.iter()
            .map(|row| {
                Ok(DayRevisionCount {
                    date: row.try_get("d")?,
                    count: row.try_get::<i64, _>("c")? as u64,
                })
            })
            .collect()
    }

    async fn recent_revisions(
        &self,
        project_id: ProjectId,
        limit: u32,
    ) -> StorageResult<Vec<RecentRevision>> {
        let rows = sqlx::query(
            "SELECT i.display_code AS code, i.title AS title, r.revision_no, r.summary, r.changed_at \
             FROM revisions r JOIN items i ON r.item_id = i.id \
             WHERE i.project_id = ? \
             ORDER BY r.changed_at DESC, i.display_code DESC, r.revision_no DESC LIMIT ?",
        )
        .bind(project_id.to_string())
        .bind(limit as i64)
        .fetch_all(&self.read)
        .await
        .map_err(internal)?;
        rows.iter()
            .map(|row| {
                Ok(RecentRevision {
                    code: row.try_get("code")?,
                    title: row.try_get("title")?,
                    revision_no: row.try_get::<i64, _>("revision_no")? as u32,
                    summary: row.try_get("summary")?,
                    changed_at: row.try_get("changed_at")?,
                })
            })
            .collect()
    }

    async fn search_items(&self, project_id: ProjectId, q: &str) -> StorageResult<Vec<Item>> {
        let needle = q.trim();
        if needle.is_empty() {
            return Ok(Vec::new());
        }
        // LIKE 通配转义（\ 为转义符）：用户输入按字面匹配
        let escaped = needle
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let rows = sqlx::query(
            "SELECT * FROM items WHERE project_id = ? \
             AND (display_code = ? OR display_code LIKE ? ESCAPE '\\' \
                  OR title LIKE ? ESCAPE '\\' OR body_md LIKE ? ESCAPE '\\') \
             ORDER BY display_code",
        )
        .bind(project_id.to_string())
        .bind(needle)
        .bind(format!("{escaped}%"))
        .bind(format!("%{escaped}%"))
        .bind(format!("%{escaped}%"))
        .fetch_all(&self.read)
        .await
        .map_err(internal)?;
        rows.iter().map(map_item).collect()
    }

    async fn get_project_doc(
        &self,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
    ) -> StorageResult<Option<ProjectDoc>> {
        let row = sqlx::query("SELECT * FROM project_docs WHERE project_id = ? AND doc_key = ?")
            .bind(project_id.to_string())
            .bind(doc_key.as_key())
            .fetch_optional(&self.read)
            .await
            .map_err(internal)?;
        row.map(|r| map_doc(&r)).transpose()
    }

    async fn list_project_doc_revisions(
        &self,
        project_id: ProjectId,
        doc_key: ProjectDocKey,
    ) -> StorageResult<Vec<ProjectDocRevision>> {
        let rows = sqlx::query(
            "SELECT * FROM project_doc_revisions WHERE project_id = ? AND doc_key = ? \
             ORDER BY revision_no",
        )
        .bind(project_id.to_string())
        .bind(doc_key.as_key())
        .fetch_all(&self.read)
        .await
        .map_err(internal)?;
        rows.iter().map(map_doc_revision).collect()
    }

    async fn export_snapshot(
        &self,
        project_id: ProjectId,
    ) -> StorageResult<Option<crate::domain::ports::ExportSnapshot>> {
        use crate::domain::ports::ExportSnapshot;
        // 项目存在性（None → 上层 EXPORT 流程报 PROJECT_NOT_FOUND）
        let Some(project) = self.get_project(project_id).await? else {
            return Ok(None);
        };
        let items = self
            .list_items(project_id, &ItemFilter::default())
            .await?;
        let mut revisions = Vec::new();
        for item in &items {
            revisions.extend(self.list_revisions(item.id).await?);
        }
        // 修订按 (条目编号, 序号) 排序——确定性聚合
        revisions.sort_by(|a, b| {
            let ca = items.iter().find(|i| i.id == a.item_id).map(|i| i.display_code.clone());
            let cb = items.iter().find(|i| i.id == b.item_id).map(|i| i.display_code.clone());
            (ca, a.revision_no).cmp(&(cb, b.revision_no))
        });
        let relations = self
            .list_relations(project_id, &RelationFilter::default())
            .await?;
        // 文档按受控 key 遍历（DOM-009 词表；无文档 key 不入快照）
        let mut docs = Vec::new();
        for key in crate::domain::project::PROJECT_DOC_KEYS {
            if let Some(doc) = self.get_project_doc(project_id, *key).await? {
                docs.push(doc);
            }
        }
        Ok(Some(ExportSnapshot {
            project,
            items,
            revisions,
            relations,
            docs,
        }))
    }
}

/// WAL 备份原语（NFR-004）：VACUUM INTO 产出一致快照（含未 checkpoint 的 WAL 内容）。
/// 存于 storage 而非端口——备份是设施级操作，不属业务读写面。
pub async fn backup_database(storage: &SqliteStorage, target_path: &Path) -> StorageResult<()> {
    sqlx::query("VACUUM INTO ?")
        .bind(target_path.to_string_lossy().as_ref())
        .execute(&storage.write)
        .await
        .map_err(internal)?;
    Ok(())
}
