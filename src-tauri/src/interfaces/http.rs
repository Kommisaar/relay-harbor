//! 本地 MCP API（CMP-003 / INT-002 / ADR-004）。
//!
//! axum 承载 MCP Streamable HTTP 端点（官方 rmcp SDK 的 tower 服务挂
//! axum Router——选型留痕 2026-09-05：rmcp 3.2.0，与 INT-002「JSON Schema
//! 由协议层从 Rust 类型导出」同构）；仅绑定 127.0.0.1 随机端口（runtime
//! 占位监听器复用，NFR-005 无其他监听面）；Bearer 令牌中间件先于一切路由
//!（未过鉴权不暴露工具列表）；版本握手硬校验（不兼容 → ERR_VERSION_MISMATCH，
//! 不静默降级，UC-009 A3）；14 个 MCP 工具路由到 services 读/写路径。
//!
//! **data-changed 发射点（ADR-006 唯一）**：写工具成功返回前，以 ChangeSummary
//! 调用 Tauri emit 广播失效事件——先发射后返回，保证 UI 在调用方拿到结果前
//! 已可刷新。
//!
//! MCP 参数/返回 DTO 独立于 IPC（ADR-006）；错误经 `to_mcp_error` 映射：
//! JSON-RPC code 承载传输语义，api-contracts 业务错误码放 `data.code`
//!（结构化 detail 随变体携带：环序列、允许目标列表、OCC 差值）。

use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use rmcp::model::{
    CallToolResult, ContentBlock, ErrorCode, ErrorData, Implementation, InitializeRequestParams,
    InitializeResult, ProtocolVersion, ServerCapabilities, ServerInfo,
};
use rmcp::handler::server::wrapper::Parameters;
use rmcp::service::{RequestContext, RoleServer};
use rmcp::{ServerHandler, tool, tool_handler, tool_router};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri_specta::Event;
use uuid::Uuid;

use crate::domain::changeset::ContentChanges;
use crate::domain::error::DomainError;
use crate::domain::item::ItemType;
use crate::domain::relation::RelationType;
use crate::domain::ports::StorageError;
use crate::domain::project::ProjectDocKey;
use crate::domain::revision::Revision;
use crate::infra::runtime::{
    bind_loopback, token_new, write_bridge_json, BridgeDiscovery, MCP_PROTOCOL_VERSION,
};
use crate::interfaces::events::DataChangedEvent;
use crate::services::read::ReadService;
use crate::services::write::{CallContext, TransitionParams, WriteService};
use crate::AppState;

// ---------- MCP 参数 DTO（ADR-006：与 IPC DTO 独立）----------

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct CreateProjectParams {
    pub name: String,
    pub repo_path: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct DeleteProjectParams {
    pub project_id: String,
    /// 必须显式 true（BR-011 级联不可逆）
    pub confirm: bool,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct CreateItemParams {
    pub project_id: String,
    /// 15 类型前缀之一（FR/NFR/BR/CON/UC/DOM/CMP/INT/SEQ/UI/MOD/ADR/RISK/OQ/TASK）
    pub r#type: String,
    pub title: String,
    pub body_md: String,
    /// 结构化元数据（对象形态；默认 {}）
    pub metadata: Option<Value>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct EditItemParams {
    pub project_id: String,
    /// 显示编号（如 FR-001）
    pub code: String,
    /// 乐观并发凭据（BR-005）
    pub expected_revision: u32,
    pub title: Option<String>,
    pub body_md: Option<String>,
    /// 提供即整对象替换；元数据修改不触发 BR-009 退回
    pub metadata: Option<Value>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct TransitionItemParams {
    pub project_id: String,
    pub code: String,
    pub expected_revision: u32,
    /// 目标状态（条目机：draft/in_review/confirmed/cancelled/superseded/deprecated；
    /// 任务机：todo/doing/await_review/done/cancelled）
    pub to: String,
    /// to=superseded 必填：替代者编号
    pub superseded_by: Option<String>,
    /// to=cancelled/deprecated 必须显式 true（BR-008）
    pub confirm: Option<bool>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct RelationParams {
    pub project_id: String,
    pub source: String,
    pub target: String,
    /// derives / depends / satisfies / traces / relates（动者在前）
    pub r#type: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GetItemParams {
    pub project_id: String,
    pub code: String,
    /// 可选附带：relations / revisions（修订默认只回当前——本次附带全史）
    pub include: Option<Vec<String>>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SearchItemsParams {
    pub project_id: String,
    pub q: String,
    /// 可选类型过滤（前缀）
    pub r#type: Option<String>,
    /// 可选状态过滤
    pub status: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GetContextParams {
    pub project_id: String,
    pub code: String,
    /// 闭包深度：默认 3、上限 10
    pub depth: Option<u32>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct ProjectIdParams {
    pub project_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GetProjectDocParams {
    pub project_id: String,
    /// 受控词表：overview / data_model / structure / tech_stack（DOM-009）
    pub key: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SetProjectDocParams {
    pub project_id: String,
    pub key: String,
    /// 乐观并发凭据（新文档以 0 创建——契约细化留痕见 services/write.rs）
    pub expected_revision: u32,
    pub title: Option<String>,
    pub body_md: String,
}

// ---------- 工具服务器 ----------

pub struct McpServer {
    write: Arc<WriteService>,
    read: Arc<ReadService>,
    /// data-changed 发射（ADR-006 唯一点）；None 仅测试形态
    app: Option<tauri::AppHandle>,
    /// 会话级 actor（工厂每会话构造一次，入 NFR-007 操作日志）
    actor: String,
}

impl McpServer {
    pub fn new(
        write: Arc<WriteService>,
        read: Arc<ReadService>,
        app: Option<tauri::AppHandle>,
    ) -> Self {
        McpServer {
            write,
            read,
            app,
            actor: format!("mcp-{}", Uuid::new_v4().simple()),
        }
    }

    fn ctx(&self) -> CallContext {
        CallContext {
            actor: self.actor.clone(),
            entry: crate::services::write::EntrySource::Mcp,
        }
    }

    /// ADR-006：写工具成功 → 先发射 data-changed → 再返回
    fn emit_changed(&self, summary: &crate::services::write::ChangeSummary) {
        if let Some(app) = &self.app {
            let _ = DataChangedEvent {
                project_id: summary.project_id.to_string(),
                kinds: summary.kinds.clone(),
                revision: summary.revision,
                code: summary.code.clone(),
            }
            .emit(app);
        }
    }

    async fn require_project(
        &self,
        raw: &str,
    ) -> Result<crate::domain::project::ProjectId, ErrorData> {
        Uuid::parse_str(raw)
            .map_err(|_| invalid_params(format!("非法 project_id {raw:?}（需 UUID）")))
    }

    async fn item_detail(
        &self,
        project_id: crate::domain::project::ProjectId,
        code: &str,
    ) -> Result<crate::domain::item::Item, ErrorData> {
        self.read
            .item_detail(project_id, code)
            .await
            .map_err(to_mcp_error)
    }
}

/// 服务层错误 → MCP 错误（JSON-RPC code 表传输语义；api-contracts 业务码
/// 在 data.code，结构化上下文随变体展开）
fn to_mcp_error(e: StorageError) -> ErrorData {
    let (rpc_code, business_code) = match &e {
        StorageError::NotFound { .. } => (ErrorCode::INVALID_PARAMS, "ERR_NOT_FOUND"),
        StorageError::Domain(d) => (
            ErrorCode::INVALID_PARAMS,
            match d {
                DomainError::Validation { .. } => "ERR_VALIDATION",
                DomainError::Conflict { .. } => "ERR_CONFLICT",
                DomainError::TransitionIllegal { .. } => "ERR_TRANSITION_ILLEGAL",
                DomainError::Cycle { .. } => "ERR_CYCLE",
                DomainError::Dangling { .. } => "ERR_DANGLING",
                DomainError::Terminal { .. } => "ERR_TERMINAL",
            },
        ),
        StorageError::Internal(msg) => {
            tracing::error!(error = %msg, "MCP 工具内部错误");
            (ErrorCode::INTERNAL_ERROR, "ERR_INTERNAL")
        }
    };
    let data = match &e {
        StorageError::Domain(DomainError::TransitionIllegal { allowed, .. }) => {
            json!({ "code": business_code, "allowed": allowed })
        }
        StorageError::Domain(DomainError::Cycle { path }) => {
            json!({ "code": business_code, "path": path })
        }
        StorageError::Domain(DomainError::Conflict { expected, current, .. }) => {
            json!({ "code": business_code, "expected": expected, "current": current })
        }
        other => json!({ "code": business_code, "message": other.to_string() }),
    };
    ErrorData::new(rpc_code, e.to_string(), Some(data))
}

fn invalid_params(message: impl Into<String>) -> ErrorData {
    let message: String = message.into();
    ErrorData::new(
        ErrorCode::INVALID_PARAMS,
        message,
        Some(json!({ "code": "ERR_VALIDATION" })),
    )
}

/// 工具成功结果：结构化 JSON 进 text 内容（MCP 客户端解析）
fn text_result(value: Value) -> Result<CallToolResult, ErrorData> {
    let text = serde_json::to_string(&value)
        .map_err(|e| ErrorData::new(ErrorCode::INTERNAL_ERROR, e.to_string(), None))?;
    Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
}

fn parse_item_type(raw: &str) -> Result<ItemType, ErrorData> {
    ItemType::from_prefix(raw)
        .ok_or_else(|| invalid_params(format!("未知条目类型 {raw:?}（15 词表外）")))
}

fn parse_status(raw: &str) -> Result<crate::domain::item::AnyStatus, ErrorData> {
    crate::domain::item::AnyStatus::from_storage_text(raw)
        .ok_or_else(|| invalid_params(format!("未知状态 {raw:?}")))
}

fn parse_relation_type(raw: &str) -> Result<RelationType, ErrorData> {
    RelationType::parse(raw)
        .ok_or_else(|| invalid_params(format!("未知关系类型 {raw:?}（五种之外）")))
}

fn parse_doc_key(raw: &str) -> Result<ProjectDocKey, ErrorData> {
    ProjectDocKey::from_key(raw)
        .ok_or_else(|| invalid_params(format!("文档 key {raw:?} 不在受控词表内（DOM-009）")))
}

/// 修订摘要 JSON（api-contracts 修订形态）
fn revision_json(code: &str, r: &Revision) -> Value {
    json!({
        "code": code,
        "revision_no": r.revision_no,
        "title": r.title,
        "summary": r.summary,
        "changed_at": crate::domain::snapshot::ts_utc(r.changed_at),
        "snapshot": {
            "title": r.content.title,
            "body_md": r.content.body_md,
            "metadata": r.content.metadata,
            "status": r.content.status,
        }
    })
}

fn item_json(item: &crate::domain::item::Item) -> Value {
    json!({
        "project_id": item.project_id.to_string(),
        "code": item.display_code,
        "type": item.item_type.prefix(),
        "title": item.title,
        "body_md": item.body_md,
        "metadata": item.metadata,
        "status": item.status.to_string(),
        "current_revision": item.current_revision,
        "superseded_by": item.superseded_by.map(|s| s.to_string()),
        "created_at": crate::domain::snapshot::ts_utc(item.created_at),
        "updated_at": crate::domain::snapshot::ts_utc(item.updated_at),
    })
}

#[tool_router]
impl McpServer {
    #[tool(name = "create_project", description = "创建项目（名称仅展示、不要求唯一；返回项目 id）")]
    async fn create_project(
        &self,
        Parameters(p): Parameters<CreateProjectParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let project = self
            .write
            .create_project(&self.ctx(), &p.name, p.repo_path.as_deref())
            .await
            .map_err(to_mcp_error)?;
        // 项目创建的失效通知：无既有项目 id 订阅面，仍按 project 类别广播
        self.emit_changed(&crate::services::write::ChangeSummary {
            project_id: project.id,
            kinds: vec![crate::domain::changeset::ChangeKind::Project],
            revision: None,
            code: None,
        });
        text_result(json!({ "projectId": project.id.to_string(), "name": project.name }))
    }

    #[tool(name = "delete_project", description = "删除项目（confirm 必须为 true；单事务级联删除全部条目/关系/修订，BR-011）")]
    async fn delete_project(
        &self,
        Parameters(p): Parameters<DeleteProjectParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let stats = self
            .write
            .delete_project(&self.ctx(), pid, p.confirm)
            .await
            .map_err(to_mcp_error)?;
        self.emit_changed(&crate::services::write::ChangeSummary {
            project_id: pid,
            kinds: vec![crate::domain::changeset::ChangeKind::Project],
            revision: None,
            code: None,
        });
        text_result(json!({
            "deleted": { "items": stats.items, "relations": stats.relations, "revisions": stats.revisions }
        }))
    }

    #[tool(name = "create_item", description = "创建条目（编号领域分配 BR-001，生成修订 1；TASK 类型即任务）")]
    async fn create_item(
        &self,
        Parameters(p): Parameters<CreateItemParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let item_type = parse_item_type(&p.r#type)?;
        let result = self
            .write
            .create_item(
                &self.ctx(),
                pid,
                item_type,
                &p.title,
                &p.body_md,
                p.metadata.unwrap_or_else(|| json!({})),
            )
            .await
            .map_err(to_mcp_error)?;
        self.emit_changed(&result.summary);
        text_result(json!({ "code": result.code, "revision": result.new_revision }))
    }

    #[tool(name = "edit_item", description = "编辑条目（expected_revision OCC；标题/正文变更使已确认条目退回评审中，BR-009；终态拒绝）")]
    async fn edit_item(
        &self,
        Parameters(p): Parameters<EditItemParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let changes = ContentChanges {
            title: p.title,
            body_md: p.body_md,
            metadata: p.metadata,
        };
        let result = self
            .write
            .edit_item(&self.ctx(), pid, &p.code, p.expected_revision, changes)
            .await
            .map_err(to_mcp_error)?;
        self.emit_changed(&result.summary);
        text_result(json!({
            "code": result.code,
            "new_revision": result.new_revision,
            "status": result.status.to_string(),
        }))
    }

    #[tool(name = "transition_item", description = "条目状态迁移（白名单 BR-002；已替代必带 superseded_by、取消/废弃需 confirm=true，BR-008）")]
    async fn transition_item(
        &self,
        Parameters(p): Parameters<TransitionItemParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let result = self
            .write
            .transition_item(
                &self.ctx(),
                pid,
                TransitionParams {
                    code: &p.code,
                    expected_revision: p.expected_revision,
                    to: parse_status(&p.to)?,
                    superseded_by: p.superseded_by.as_deref(),
                    confirm: p.confirm.unwrap_or(false),
                },
            )
            .await
            .map_err(to_mcp_error)?;
        self.emit_changed(&result.summary);
        text_result(json!({ "code": result.code, "status": result.status.to_string() }))
    }

    #[tool(name = "add_relation", description = "建立关系（悬空/跨项目拒绝 BR-006/INV-003；depends 成环拒绝 BR-007；同向同类幂等）")]
    async fn add_relation(
        &self,
        Parameters(p): Parameters<RelationParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let relation_type = parse_relation_type(&p.r#type)?;
        let relation_id = self
            .write
            .add_relation(&self.ctx(), pid, &p.source, &p.target, relation_type)
            .await
            .map_err(to_mcp_error)?;
        self.emit_changed(&crate::services::write::ChangeSummary {
            project_id: pid,
            kinds: vec![crate::domain::changeset::ChangeKind::Relation],
            revision: None,
            code: Some(p.source.clone()),
        });
        text_result(json!({ "relation_id": relation_id }))
    }

    #[tool(name = "remove_relation", description = "移除关系（不存在的组合幂等返回 ok）")]
    async fn remove_relation(
        &self,
        Parameters(p): Parameters<RelationParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let relation_type = parse_relation_type(&p.r#type)?;
        let summary = self
            .write
            .remove_relation(&self.ctx(), pid, &p.source, &p.target, relation_type)
            .await
            .map_err(to_mcp_error)?;
        self.emit_changed(&summary);
        text_result(json!({ "ok": true }))
    }

    #[tool(name = "get_item", description = "读取条目详情（include 可选附带 relations / revisions 修订全史）")]
    async fn get_item(
        &self,
        Parameters(p): Parameters<GetItemParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let item = self.item_detail(pid, &p.code).await?;
        let mut result = item_json(&item);
        for what in p.include.unwrap_or_default() {
            match what.as_str() {
                "relations" => {
                    let views = self
                        .read
                        .item_relations(pid, &p.code)
                        .await
                        .map_err(to_mcp_error)?;
                    let entries: Vec<Value> = views
                        .iter()
                        .map(|v| {
                            json!({
                                "type": v.relation_type.as_str(),
                                "direction": match v.direction {
                                    crate::services::read::Direction::Out => "out",
                                    crate::services::read::Direction::In => "in",
                                },
                                "peer": v.peer.display_code,
                                "peer_title": v.peer.title,
                            })
                        })
                        .collect();
                    result["relations"] = Value::Array(entries);
                }
                "revisions" => {
                    let revisions = self
                        .read
                        .item_revisions(pid, &p.code)
                        .await
                        .map_err(to_mcp_error)?;
                    let entries: Vec<Value> = revisions
                        .iter()
                        .map(|r| revision_json(&p.code, r))
                        .collect();
                    result["revisions"] = Value::Array(entries);
                }
                other => return Err(invalid_params(format!("未知 include 项 {other:?}（relations/revisions）"))),
            }
        }
        text_result(result)
    }

    #[tool(name = "search_items", description = "搜索条目（编号精确/前缀 + 标题正文匹配；返回摘要列表）")]
    async fn search_items(
        &self,
        Parameters(p): Parameters<SearchItemsParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        // MCP 工具级过滤先行（类型/状态），词法匹配由存储 LIKE 承担
        let hits = self.read.search(pid, &p.q).await.map_err(to_mcp_error)?;
        // 工具级过滤参数先校验再内存过滤（词法匹配由存储 LIKE 承担）
        let type_filter = p.r#type.as_deref().map(parse_item_type).transpose()?;
        let status_filter = p.status.as_deref().map(parse_status).transpose()?;
        let filtered: Vec<_> = hits
            .into_iter()
            .filter(|h| {
                type_filter.is_none_or(|t| h.item.item_type == t)
                    && status_filter.is_none_or(|s| h.item.status == s)
            })
            .collect();
        let items: Vec<Value> = filtered
            .iter()
            .map(|h| {
                json!({
                    "code": h.item.display_code,
                    "title": h.item.title,
                    "type": h.item.item_type.prefix(),
                    "status": h.item.status.to_string(),
                    "current_revision": h.item.current_revision,
                    "matched_in": match h.matched_in {
                        crate::services::read::MatchedIn::Code => "code",
                        crate::services::read::MatchedIn::Title => "title",
                        crate::services::read::MatchedIn::Body => "body",
                    },
                })
            })
            .collect();
        text_result(json!({ "hits": items }))
    }

    #[tool(name = "get_context", description = "影响定位（get_context）：从条目出发沿 derives/satisfies/depends 入边反向闭包（谁派生我/满足我/依赖我）；depth 默认 3、上限 10")]
    async fn get_context(
        &self,
        Parameters(p): Parameters<GetContextParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let impact = self
            .read
            .impact(pid, &p.code, p.depth)
            .await
            .map_err(to_mcp_error)?;
        let entries: Vec<Value> = impact
            .entries
            .iter()
            .map(|e| {
                json!({
                    "code": e.item.display_code,
                    "title": e.item.title,
                    "type": e.item.item_type.prefix(),
                    "status": e.item.status.to_string(),
                    "depth": e.depth,
                    "via": e.via.as_str(),
                })
            })
            .collect();
        text_result(json!({
            "trigger": p.code,
            "max_depth": p.depth.unwrap_or(crate::services::read::IMPACT_DEFAULT_DEPTH).min(crate::services::read::IMPACT_MAX_DEPTH),
            "affected": entries,
        }))
    }

    #[tool(name = "get_project_state", description = "项目概况：各类型/状态计数 + 近 182 天逐日修订计数（看板与总览数据源）")]
    async fn get_project_state(
        &self,
        Parameters(p): Parameters<ProjectIdParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let state = self.read.project_state(pid).await.map_err(to_mcp_error)?;
        let by_type: Value = state
            .by_type
            .iter()
            .map(|(t, c)| (t.prefix().to_string(), Value::from(*c)))
            .collect::<serde_json::Map<String, Value>>()
            .into();
        let item_by_status: Value = state
            .item_by_status
            .iter()
            .map(|(s, c)| (s.to_string(), Value::from(*c)))
            .collect::<serde_json::Map<String, Value>>()
            .into();
        let task_by_status: Value = state
            .task_by_status
            .iter()
            .map(|(s, c)| (s.to_string(), Value::from(*c)))
            .collect::<serde_json::Map<String, Value>>()
            .into();
        let by_day: Vec<Value> = state
            .revisions_by_day
            .iter()
            .map(|(d, c)| json!({ "date": d, "count": c }))
            .collect();
        text_result(json!({
            "by_type": by_type,
            "item_by_status": item_by_status,
            "task_by_status": task_by_status,
            "revisions_by_day": by_day,
        }))
    }

    #[tool(name = "get_project_doc", description = "读取项目级文档当前内容（DOM-009；key 取受控词表 overview/data_model/structure/tech_stack）")]
    async fn get_project_doc(
        &self,
        Parameters(p): Parameters<GetProjectDocParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let key = parse_doc_key(&p.key)?;
        let (doc, _summary) = self
            .read
            .project_doc(pid, key)
            .await
            .map_err(to_mcp_error)?;
        text_result(json!({
            "key": key.as_key(),
            "title": doc.title,
            "body_md": doc.body_md,
            "revision_no": doc.current_revision,
            "changed_at": crate::domain::snapshot::ts_utc(doc.updated_at),
        }))
    }

    #[tool(name = "set_project_doc", description = "写入项目级文档（DOM-009：追加不可变修订；expected_revision OCC 同 edit_item；新文档以 0 创建）")]
    async fn set_project_doc(
        &self,
        Parameters(p): Parameters<SetProjectDocParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let key = parse_doc_key(&p.key)?;
        let (key, new_revision) = self
            .write
            .set_project_doc(&self.ctx(), pid, key, p.expected_revision, p.title.as_deref(), &p.body_md)
            .await
            .map_err(to_mcp_error)?;
        self.emit_changed(&crate::services::write::ChangeSummary {
            project_id: pid,
            kinds: vec![crate::domain::changeset::ChangeKind::ProjectDoc],
            revision: Some(new_revision),
            code: None,
        });
        text_result(json!({ "key": key.as_key(), "new_revision": new_revision }))
    }

    #[tool(name = "validate", description = "项目诊断（M1：悬空关系、终态语义 INV-006、derives/satisfies 反向对提示）")]
    async fn validate(
        &self,
        Parameters(p): Parameters<ProjectIdParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let pid = self.require_project(&p.project_id).await?;
        let issues = self.write.validate(&self.ctx(), pid).await.map_err(to_mcp_error)?;
        let entries: Vec<Value> = issues
            .iter()
            .map(|i| json!({ "severity": i.severity, "code": i.code, "message": i.message }))
            .collect();
        text_result(json!({ "issues": entries }))
    }
}

#[tool_handler]
impl ServerHandler for McpServer {
    /// 版本握手（INT-002 / UC-009 A3）：不兼容 → ERR_VERSION_MISMATCH，
    /// 不静默降级（bridge 侧走重发现流程）
    async fn initialize(
        &self,
        request: InitializeRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<InitializeResult, ErrorData> {
        if request.protocol_version.as_str() != MCP_PROTOCOL_VERSION {
            return Err(ErrorData::new(
                ErrorCode::INVALID_PARAMS,
                format!(
                    "协议版本不兼容：收到 {}，本端支持 {MCP_PROTOCOL_VERSION}",
                    request.protocol_version.as_str()
                ),
                Some(json!({
                    "code": "ERR_VERSION_MISMATCH",
                    "supported": MCP_PROTOCOL_VERSION,
                    "received": request.protocol_version.as_str(),
                })),
            ));
        }
        context.peer.set_peer_info(request);
        Ok(self.get_info())
    }

    fn supported_protocol_versions(&self) -> std::borrow::Cow<'static, [ProtocolVersion]> {
        std::borrow::Cow::Borrowed(&[ProtocolVersion::V_2025_06_18])
    }

    fn get_info(&self) -> ServerInfo {
        // 非穷尽结构体经 builder 构造；协议版本覆盖 SDK 默认 LATEST → 契约版本
        let mut info = ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(
                Implementation::new("relay-harbor", env!("CARGO_PKG_VERSION"))
                    .with_title("RelayHarbor"),
            )
            .with_instructions(
                "RelayHarbor 业务写入唯一入口：条目/项目/项目文档写工具经变更集原子提交；查询工具只读。",
            );
        info.protocol_version = ProtocolVersion::V_2025_06_18;
        info
    }
}

// ---------- 鉴权与启动 ----------

/// Bearer 令牌校验（NFR-005）：未过鉴权不暴露任何工具列表（401 + WWW-Authenticate）
async fn bearer_auth(
    State(token): State<Arc<String>>,
    req: Request,
    next: Next,
) -> Response {
    let provided = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    if provided == Some(token.as_str()) {
        next.run(req).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            [(header::WWW_AUTHENTICATE, "Bearer")],
            "{\"code\":\"ERR_UNAUTHORIZED\"}",
        )
            .into_response()
    }
}

/// 组装路由（测试可 oneshot 复用；仅 /mcp 一个挂载面）
pub fn build_router(
    server_factory: impl Fn() -> Result<McpServer, std::io::Error> + Send + Sync + 'static,
    token: Arc<String>,
) -> axum::Router {
    let service = rmcp::transport::streamable_http_server::tower::StreamableHttpService::new(
        server_factory,
        Arc::new(rmcp::transport::streamable_http_server::session::local::LocalSessionManager::default()),
        rmcp::transport::streamable_http_server::StreamableHttpServerConfig::default(),
    );
    axum::Router::new()
        .nest_service("/mcp", service)
        .layer(axum::middleware::from_fn_with_state(
            token,
            bearer_auth,
        ))
}

/// 启动 MCP 通道：绑定回环随机端口 → 生成令牌 → 原子写 bridge.json →
/// 后台 axum 服务。返回端口（诊断/测试用）。
pub async fn start(app: &tauri::AppHandle, state: &AppState) -> Result<u16, String> {
    let (listener, port) = bind_loopback().map_err(|e| format!("端口绑定失败：{e}"))?;
    let token = Arc::new(token_new());
    write_bridge_json(
        &state.paths,
        &BridgeDiscovery {
            version: 1,
            port,
            token: token.as_str().to_string(),
            pid: std::process::id(),
            protocol_version: MCP_PROTOCOL_VERSION.to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
    )
    .map_err(|e| format!("bridge.json 写出失败：{e}"))?;

    // 服务对象无状态——由共享存储端口直接构造（每会话工厂闭包捕获 Arc 克隆）
    let write = Arc::new(WriteService::new(state.storage.clone()));
    let read = Arc::new(ReadService::new(state.storage.clone()));
    let app_handle = app.clone();
    let router = build_router(
        move || Ok(McpServer::new(write.clone(), read.clone(), Some(app_handle.clone()))),
        token,
    );
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("监听器改造失败：{e}"))?;
    let tokio_listener =
        tokio::net::TcpListener::from_std(listener).map_err(|e| format!("监听器移交失败：{e}"))?;
    tauri::async_runtime::spawn(async move {
        if let Err(e) = axum::serve(tokio_listener, router).await {
            tracing::error!(error = %e, "MCP HTTP 服务退出");
        }
    });
    tracing::info!(port, "本地 MCP API 就绪（bridge.json 已刷新）");
    Ok(port)
}
