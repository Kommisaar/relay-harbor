//! IPC 只读命令通道（CMP-002 / INT-001 / CON-009）。
//!
//! 命令完整白名单：`config/ipc-command-whitelist.json`（CI 断言 registered ⊆ whitelist，
//! 业务写前缀一律禁止）。命令实现直接调用 services 读路径；本层不重复业务校验，
//! 只做 DTO 投影（ADR-006：IPC 与 MCP 各自独立 DTO）与错误短码映射。
//!
//! 错误短码约定（与 mock 门面一致，UI 经 i18n 映射文案）：
//! PROJECT_NOT_FOUND / ITEM_NOT_FOUND / DOC_NOT_FOUND / ERR_VALIDATION /
//! ERR_CONFLICT / ERR_TRANSITION_ILLEGAL / ERR_CYCLE / ERR_DANGLING / ERR_TERMINAL /
//! ERR_INTERNAL / EXPORT_PATH_EMPTY / EXPORT_SCOPE_EMPTY / EXPORT_TARGET_EXISTS / EXPORT_IO。
//!
//! 领域枚举（ItemType/ItemStatus/TaskStatus/RelationType/ProjectDocKey）经
//! specta::Type 直出 TS 字面量联合（单一事实来源）；AnyStatus 两机同名
//! （cancelled）不可 untagged 直出，DTO 状态字段以 String 承载、门面层 cast。

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri_specta::Event;
use uuid::Uuid;

use crate::domain::error::DomainError;
use crate::domain::item::{AnyStatus, Item, ItemType};
use crate::domain::task::TaskStatus;
use crate::domain::ports::{NotFoundKind, Storage, StorageError};
use crate::domain::project::{ProjectDocKey, ProjectId};
use crate::domain::relation::RelationType;
use crate::domain::revision::Revision;
use crate::infra::runtime::{
    load_settings, store_settings, AppSettings, CloseBehavior, LanguageSetting, ThemeSetting,
};
use crate::interfaces::events::ExportProgressEvent;
use crate::services::export::{ExportError, ExportForm};
use crate::services::read::{Direction, ItemListSpec, MatchedIn, SearchSnapshot};
use crate::AppState;

// ---------- DTO（specta → src/api/generated/bindings.ts；camelCase 对齐 types.ts）----------

fn status_str(status: &AnyStatus) -> String {
    status.to_string()
}

fn ms(t: chrono::DateTime<chrono::Utc>) -> f64 {
    // f64：specta 禁 i64（TS BigInt）；毫秒 epoch < 2^53，f64 精度无损，TS number
    t.timestamp_millis() as f64
}

fn metadata_map(metadata: &serde_json::Value) -> BTreeMap<String, String> {
    crate::domain::snapshot::metadata_pairs(metadata)
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummaryDto {
    pub id: String,
    pub name: String,
    pub repo_path: Option<String>,
    pub item_count: u32,
    pub task_count: u32,
    pub updated_at: f64,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ItemSummaryDto {
    pub project_id: String,
    pub code: String,
    pub item_type: ItemType,
    pub title: String,
    pub status: String,
    pub current_revision: u32,
    pub updated_at: f64,
    /// 已替代时指向替代者编号（UI 契约为编号而非内部 id，此处解析）
    pub superseded_by: Option<String>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ItemDetailDto {
    #[serde(flatten)]
    pub summary: ItemSummaryDto,
    pub body_md: String,
    pub metadata: BTreeMap<String, String>,
    pub created_at: f64,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSnapshotDto {
    pub title: String,
    pub body_md: String,
    pub metadata: BTreeMap<String, String>,
    pub status: String,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RevisionDto {
    pub code: String,
    pub revision_no: u32,
    pub title: String,
    pub summary: String,
    pub changed_at: f64,
    pub snapshot: RevisionSnapshotDto,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RelationEntryDto {
    pub relation_type: RelationType,
    /// "in" | "out"
    pub direction: String,
    pub peer: ItemSummaryDto,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BlockedByDto {
    pub code: String,
    pub title: String,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskCardDto {
    pub code: String,
    pub title: String,
    pub status: String,
    pub updated_at: f64,
    pub blocked_by: Vec<BlockedByDto>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskBoardColumnDto {
    pub status: TaskStatus,
    pub tasks: Vec<TaskCardDto>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskBoardDto {
    pub columns: Vec<TaskBoardColumnDto>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DayCountDto {
    /// 本地日期口径见 services/read.rs（UTC 自然日聚合）
    pub date: String,
    pub count: u32,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStateDto {
    /// 键 = 类型前缀；仅出现过的类型（mock byType 口径）
    pub by_type: BTreeMap<String, u32>,
    /// 键 = 条目状态蛇形名；全词表含零
    pub item_by_status: BTreeMap<String, u32>,
    /// 键 = 任务状态蛇形名；全词表含零
    pub task_by_status: BTreeMap<String, u32>,
    pub revisions_by_day: Vec<DayCountDto>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocDto {
    pub title: String,
    pub body_md: String,
    pub revision_no: u32,
    pub summary: String,
    pub changed_at: f64,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DocSnapshotDto {
    pub title: String,
    pub body_md: String,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocRevisionDto {
    pub revision_no: u32,
    pub title: String,
    pub summary: String,
    pub changed_at: f64,
    pub snapshot: DocSnapshotDto,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImpactEntryDto {
    pub item: ItemSummaryDto,
    pub depth: u32,
    pub via: RelationType,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImpactResultDto {
    pub trigger: ItemSummaryDto,
    pub entries: Vec<ImpactEntryDto>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchHitDto {
    pub item: ItemSummaryDto,
    /// "code" | "title" | "body"
    pub matched_in: String,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentRevisionDto {
    pub code: String,
    pub title: String,
    pub revision_no: u32,
    pub summary: String,
    pub changed_at: f64,
}

/// 条目列表过滤（types.ts ItemListFilter：type?/status?；status 允许 "all"）
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ItemListFilterDto {
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub status: Option<String>,
}

/// 导出参数（UI ExportOptions 拆平：scope 由门面折叠为 types；form 词表固定）
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptionsDto {
    /// scope 类型过滤；None = 全量（scope:"all"）
    pub types: Option<Vec<ItemType>>,
    /// "directory" | "zip"
    pub form: String,
    pub target_path: String,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportResultDto {
    pub path: String,
    pub file_count: u32,
}

/// 设置补丁（set_settings 合并语义）。last_location 单层 Option（留痕：
/// 双层 Option 在 JSON 序列化下 null 不可区分「不提供/清除」，且 lastLocation
/// 仅由应用导航写入恒为值，无清除场景）；null = 不变更。
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SetSettingsPatchDto {
    pub theme: Option<ThemeSetting>,
    pub language: Option<LanguageSetting>,
    pub close_behavior: Option<CloseBehavior>,
    pub last_location: Option<String>,
}

// ---------- 错误映射 ----------

/// StorageError → UI 短码（NotFound 按实体种类精确映射）
fn short_code(err: StorageError) -> String {
    match err {
        StorageError::NotFound { kind, .. } => match kind {
            NotFoundKind::Project => "PROJECT_NOT_FOUND".to_string(),
            NotFoundKind::Item => "ITEM_NOT_FOUND".to_string(),
            NotFoundKind::ProjectDoc => "DOC_NOT_FOUND".to_string(),
        },
        StorageError::Domain(e) => domain_short_code(&e),
        StorageError::Internal(msg) => {
            tracing::error!(error = %msg, "存储内部错误");
            "ERR_INTERNAL".to_string()
        }
    }
}

fn domain_short_code(e: &DomainError) -> String {
    match e {
        DomainError::Validation { .. } => "ERR_VALIDATION".to_string(),
        DomainError::Conflict { .. } => "ERR_CONFLICT".to_string(),
        DomainError::TransitionIllegal { .. } => "ERR_TRANSITION_ILLEGAL".to_string(),
        DomainError::Cycle { .. } => "ERR_CYCLE".to_string(),
        DomainError::Dangling { .. } => "ERR_DANGLING".to_string(),
        DomainError::Terminal { .. } => "ERR_TERMINAL".to_string(),
    }
}

fn validation(message: impl Into<String>) -> String {
    let _ = message;
    "ERR_VALIDATION".to_string()
}

fn parse_status_filter(s: &str) -> Result<Option<AnyStatus>, String> {
    match s {
        "all" => Ok(None),
        other => AnyStatus::from_storage_text(other)
            .map(Some)
            .ok_or_else(|| validation(format!("未知状态 {other:?}"))),
    }
}

/// 条目 → 摘要 DTO（superseded_by 内部 id → 编号批量解析）
async fn item_summaries(
    storage: &Arc<dyn Storage>,
    project_id: ProjectId,
    items: Vec<Item>,
) -> Result<Vec<ItemSummaryDto>, String> {
    let mut sup_ids: Vec<Uuid> = items.iter().filter_map(|i| i.superseded_by).collect();
    sup_ids.sort_unstable();
    sup_ids.dedup();
    let sup_code: std::collections::HashMap<Uuid, String> = storage
        .get_items_by_ids(project_id, &sup_ids)
        .await
        .map_err(&short_code)?
        .into_iter()
        .map(|i| (i.id, i.display_code))
        .collect();
    Ok(items
        .into_iter()
        .map(|i| ItemSummaryDto {
            project_id: i.project_id.to_string(),
            superseded_by: i.superseded_by.and_then(|id| sup_code.get(&id).cloned()),
            code: i.display_code,
            item_type: i.item_type,
            title: i.title,
            status: status_str(&i.status),
            current_revision: i.current_revision,
            updated_at: ms(i.updated_at),
        })
        .collect())
}

fn item_detail(dto: ItemSummaryDto, item: &Item) -> ItemDetailDto {
    ItemDetailDto {
        summary: ItemSummaryDto {
            project_id: dto.project_id,
            code: dto.code.clone(),
            item_type: dto.item_type,
            title: dto.title.clone(),
            status: dto.status.clone(),
            current_revision: dto.current_revision,
            updated_at: dto.updated_at,
            superseded_by: dto.superseded_by.clone(),
        },
        body_md: item.body_md.clone(),
        metadata: metadata_map(&item.metadata),
        created_at: ms(item.created_at),
    }
}

fn revision_dtos(code: &str, revisions: Vec<Revision>) -> Vec<RevisionDto> {
    revisions
        .into_iter()
        .map(|r| RevisionDto {
            code: code.to_string(),
            revision_no: r.revision_no,
            title: r.title,
            summary: r.summary,
            changed_at: ms(r.changed_at),
            snapshot: RevisionSnapshotDto {
                title: r.content.title,
                body_md: r.content.body_md,
                metadata: metadata_map(&r.content.metadata),
                status: r.content.status,
            },
        })
        .collect()
}

// ---------- 命令（app_version 之外为 INT-001 业务只读命令 15 个）----------

/// 非业务信息命令：应用版本（UI 关于页显示）。不属 15 个业务只读命令。
#[tauri::command]
#[specta::specta]
pub fn app_version() -> AppVersionResult {
    AppVersionResult {
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[derive(Serialize, specta::Type)]
pub struct AppVersionResult {
    pub version: String,
}

#[tauri::command]
#[specta::specta]
pub async fn list_projects(state: tauri::State<'_, AppState>) -> Result<Vec<ProjectSummaryDto>, String> {
    let entries = state.read.list_projects().await.map_err(&short_code)?;
    Ok(entries
        .into_iter()
        .map(|e| ProjectSummaryDto {
            id: e.project.id.to_string(),
            name: e.project.name,
            repo_path: e.project.repo_path,
            item_count: e.item_count as u32,
            task_count: e.task_count as u32,
            updated_at: ms(e.project.updated_at),
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn get_project_state(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<ProjectStateDto, String> {
    let pid = parse_project(&project_id)?;
    let snapshot = state.read.project_state(pid).await.map_err(&short_code)?;
    Ok(ProjectStateDto {
        by_type: snapshot
            .by_type
            .into_iter()
            .map(|(t, c)| (t.prefix().to_string(), c as u32))
            .collect(),
        item_by_status: snapshot
            .item_by_status
            .into_iter()
            .map(|(s, c)| (s.to_string(), c as u32))
            .collect(),
        task_by_status: snapshot
            .task_by_status
            .into_iter()
            .map(|(s, c)| (s.to_string(), c as u32))
            .collect(),
        revisions_by_day: snapshot
            .revisions_by_day
            .into_iter()
            .map(|(date, count)| DayCountDto {
                date,
                count: count as u32,
            })
            .collect(),
    })
}

fn parse_project(s: &str) -> Result<ProjectId, String> {
    Uuid::parse_str(s).map_err(|_| validation(format!("非法项目 id {s:?}")))
}

#[tauri::command]
#[specta::specta]
pub async fn get_project_doc(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
) -> Result<ProjectDocDto, String> {
    let pid = parse_project(&project_id)?;
    let doc_key = parse_doc_key(&key)?;
    let (doc, summary) = state.read.project_doc(pid, doc_key).await.map_err(&short_code)?;
    Ok(ProjectDocDto {
        title: doc.title,
        body_md: doc.body_md,
        revision_no: doc.current_revision,
        summary,
        changed_at: ms(doc.updated_at),
    })
}

fn parse_doc_key(s: &str) -> Result<ProjectDocKey, String> {
    ProjectDocKey::from_key(s).ok_or_else(|| validation(format!("文档 key {s:?} 不在受控词表内")))
}

#[tauri::command]
#[specta::specta]
pub async fn list_project_doc_revisions(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
) -> Result<Vec<ProjectDocRevisionDto>, String> {
    let pid = parse_project(&project_id)?;
    let doc_key = parse_doc_key(&key)?;
    let revisions = state
        .read
        .list_project_doc_revisions(pid, doc_key)
        .await
        .map_err(&short_code)?;
    Ok(revisions
        .into_iter()
        .map(|r| ProjectDocRevisionDto {
            revision_no: r.revision_no,
            title: r.title,
            summary: r.summary,
            changed_at: ms(r.changed_at),
            snapshot: DocSnapshotDto {
                title: r.content.title,
                body_md: r.content.body_md,
            },
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn list_items(
    state: tauri::State<'_, AppState>,
    project_id: String,
    filter: Option<ItemListFilterDto>,
) -> Result<Vec<ItemSummaryDto>, String> {
    let pid = parse_project(&project_id)?;
    let spec = match &filter {
        None => ItemListSpec::default(),
        Some(f) => ItemListSpec {
            item_type: match &f.item_type {
                None => None,
                Some(t) => Some(
                    ItemType::from_prefix(t)
                        .ok_or_else(|| validation(format!("未知条目类型 {t:?}")))?,
                ),
            },
            status: match &f.status {
                None => None,
                Some(s) => parse_status_filter(s)?,
            },
        },
    };
    let items = state.read.list_items(pid, &spec).await.map_err(&short_code)?;
    item_summaries(&state.storage, pid, items).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_item_detail(
    state: tauri::State<'_, AppState>,
    project_id: String,
    code: String,
) -> Result<ItemDetailDto, String> {
    let pid = parse_project(&project_id)?;
    let item = state.read.item_detail(pid, &code).await.map_err(&short_code)?;
    let summary = item_summaries(&state.storage, pid, vec![item.clone()])
        .await?
        .into_iter()
        .next()
        .expect("单元素");
    Ok(item_detail(summary, &item))
}

#[tauri::command]
#[specta::specta]
pub async fn get_item_revisions(
    state: tauri::State<'_, AppState>,
    project_id: String,
    code: String,
) -> Result<Vec<RevisionDto>, String> {
    let pid = parse_project(&project_id)?;
    let revisions = state.read.item_revisions(pid, &code).await.map_err(&short_code)?;
    Ok(revision_dtos(&code, revisions))
}

#[tauri::command]
#[specta::specta]
pub async fn get_relations(
    state: tauri::State<'_, AppState>,
    project_id: String,
    code: String,
) -> Result<Vec<RelationEntryDto>, String> {
    let pid = parse_project(&project_id)?;
    let views = state.read.item_relations(pid, &code).await.map_err(&short_code)?;
    // 对端条目收集后统一转摘要 DTO（superseded_by 解析共享一次批量查询）
    let peers: Vec<Item> = views.iter().map(|v| v.peer.clone()).collect();
    let peer_dtos = item_summaries(&state.storage, pid, peers).await?;
    Ok(views
        .into_iter()
        .zip(peer_dtos)
        .map(|(v, peer)| RelationEntryDto {
            relation_type: v.relation_type,
            direction: match v.direction {
                Direction::Out => "out".to_string(),
                Direction::In => "in".to_string(),
            },
            peer,
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn get_task_board(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<TaskBoardDto, String> {
    let pid = parse_project(&project_id)?;
    let board = state.read.task_board(pid).await.map_err(&short_code)?;
    Ok(TaskBoardDto {
        columns: board
            .columns
            .into_iter()
            .map(|c| TaskBoardColumnDto {
                status: c.status,
                tasks: c
                    .tasks
                    .into_iter()
                    .map(|t| TaskCardDto {
                        code: t.item.display_code,
                        title: t.item.title,
                        status: status_str(&t.item.status),
                        updated_at: ms(t.item.updated_at),
                        blocked_by: t
                            .blocked_by
                            .into_iter()
                            .map(|b| BlockedByDto {
                                code: b.code,
                                title: b.title,
                            })
                            .collect(),
                    })
                    .collect(),
            })
            .collect(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn search_items(
    state: tauri::State<'_, AppState>,
    project_id: String,
    q: String,
) -> Result<Vec<SearchHitDto>, String> {
    let pid = parse_project(&project_id)?;
    let hits: Vec<SearchSnapshot> = state.read.search(pid, &q).await.map_err(&short_code)?;
    let items: Vec<Item> = hits.iter().map(|h| h.item.clone()).collect();
    let item_dtos = item_summaries(&state.storage, pid, items).await?;
    Ok(hits
        .into_iter()
        .zip(item_dtos)
        .map(|(h, item)| SearchHitDto {
            item,
            matched_in: match h.matched_in {
                MatchedIn::Code => "code".to_string(),
                MatchedIn::Title => "title".to_string(),
                MatchedIn::Body => "body".to_string(),
            },
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn get_impact(
    state: tauri::State<'_, AppState>,
    project_id: String,
    code: String,
) -> Result<ImpactResultDto, String> {
    let pid = parse_project(&project_id)?;
    let impact = state.read.impact(pid, &code, None).await.map_err(&short_code)?;
    let trigger = item_summaries(&state.storage, pid, vec![impact.trigger.clone()])
        .await?
        .into_iter()
        .next()
        .expect("单元素");
    let entries_items: Vec<Item> = impact.entries.iter().map(|e| e.item.clone()).collect();
    let entry_dtos = item_summaries(&state.storage, pid, entries_items).await?;
    Ok(ImpactResultDto {
        trigger,
        entries: impact
            .entries
            .into_iter()
            .zip(entry_dtos)
            .map(|(e, item)| ImpactEntryDto {
                item,
                depth: e.depth,
                via: e.via,
            })
            .collect(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn list_recent_revisions(
    state: tauri::State<'_, AppState>,
    project_id: String,
    limit: Option<u32>,
) -> Result<Vec<RecentRevisionDto>, String> {
    let pid = parse_project(&project_id)?;
    let limit = limit.unwrap_or(10).min(100);
    let recent = state
        .read
        .recent_revisions(pid, limit)
        .await
        .map_err(&short_code)?;
    Ok(recent
        .into_iter()
        .map(|r| RecentRevisionDto {
            code: r.code,
            title: r.title,
            revision_no: r.revision_no,
            summary: r.summary,
            changed_at: ms(r.changed_at),
        })
        .collect())
}

/// 导出（FR-014/UC-016/INT-006）：同步命令 + ExportProgressEvent 进度推送
///（偏差留痕见 services/export.rs 头注）。
#[tauri::command]
#[specta::specta]
pub async fn export_markdown(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    project_id: String,
    options: ExportOptionsDto,
) -> Result<ExportResultDto, String> {
    let pid = parse_project(&project_id)?;
    if options.target_path.trim().is_empty() {
        return Err("EXPORT_PATH_EMPTY".to_string());
    }
    let form = match options.form.as_str() {
        "directory" => ExportForm::Directory,
        "zip" => ExportForm::Zip,
        other => return Err(validation(format!("未知导出形态 {other:?}"))),
    };
    let outcome = {
        let mut progress = |percent: u32, phase: &str| {
            let event = ExportProgressEvent {
                project_id: project_id.clone(),
                percent,
                phase: phase.to_string(),
            };
            // 发射必须经主线程派发（WebView2 COM 线程亲和，同 http::emit_changed）
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = event.emit(&handle);
            });
        };
        state
            .export
            .export(pid, options.types, form, PathBuf::from(&options.target_path), &mut progress)
            .await
            .map_err(|e| match e {
                ExportError::ScopeEmpty => "EXPORT_SCOPE_EMPTY".to_string(),
                ExportError::TargetExists => "EXPORT_TARGET_EXISTS".to_string(),
                ExportError::Io(msg) => {
                    tracing::error!(error = %msg, "导出写盘失败");
                    "EXPORT_IO".to_string()
                }
                ExportError::Storage(se) => short_code(se),
            })?
    };
    Ok(ExportResultDto {
        path: outcome.path.to_string_lossy().into_owned(),
        file_count: outcome.file_count as u32,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn get_settings(state: tauri::State<'_, AppState>) -> Result<AppSettings, String> {
    Ok(load_settings(&state.paths))
}

#[tauri::command]
#[specta::specta]
pub async fn set_settings(
    state: tauri::State<'_, AppState>,
    patch: SetSettingsPatchDto,
) -> Result<AppSettings, String> {
    // 非业务数据（CON-009 语义）：应用设置合并写回 settings.json，不入 SQLite
    let mut settings = load_settings(&state.paths);
    if let Some(theme) = patch.theme {
        settings.theme = theme;
    }
    if let Some(language) = patch.language {
        settings.language = language;
    }
    if let Some(close_behavior) = patch.close_behavior {
        settings.close_behavior = close_behavior;
    }
    if let Some(last_location) = patch.last_location {
        settings.last_location = Some(last_location);
    }
    store_settings(&state.paths, &settings).map_err(|e| {
        tracing::error!(error = %e, "settings.json 写出失败");
        "ERR_INTERNAL".to_string()
    })?;
    Ok(settings)
}
