//! 本地 MCP API 集成测试（INT-002 / NFR-005 / UC-009）：经 axum oneshot 打
//! 完整 Streamable HTTP 流——Bearer 鉴权（无令牌 401 不暴露工具列表）、
//! 版本握手（不兼容 → ERR_VERSION_MISMATCH）、14 工具清单、写工具语义端到端
//! （创建→编辑 OCC→状态机拒绝→文档→诊断）、data-changed 发射点在测试形态
//! 跳过（AppHandle None）。

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use serde_json::{json, Value};
use std::sync::Arc;
use tower::ServiceExt;

use relay_harbor_lib::infra::storage::SqliteStorage;
use relay_harbor_lib::infra::runtime::MCP_PROTOCOL_VERSION;
use relay_harbor_lib::interfaces::http::{build_router, McpServer};
use rmcp::ServerHandler as _;
use relay_harbor_lib::services::read::ReadService;
use relay_harbor_lib::services::write::WriteService;

type TestResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;

async fn setup() -> (axum::Router, Arc<SqliteStorage>, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("临时目录");
    let storage = Arc::new(
        SqliteStorage::open(&dir.path().join("test.db"))
            .await
            .expect("打开存储"),
    );
    let write = Arc::new(WriteService::new(storage.clone()));
    let read = Arc::new(ReadService::new(storage.clone()));
    let router = build_router(
        move || Ok(McpServer::new(write.clone(), read.clone(), None)),
        Arc::new("test-token".to_string()),
    );
    (router, storage, dir)
}

/// 发 JSON-RPC 请求（带 Bearer；返回状态码、响应头、解析后的 JSON-RPC 响应体）
async fn rpc(
    router: &axum::Router,
    body: Value,
    token: Option<&str>,
    session: Option<&str>,
) -> (StatusCode, Option<String>, Value) {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/mcp")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ACCEPT, "application/json, text/event-stream")
        .header(header::HOST, "127.0.0.1");
    if let Some(t) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {t}"));
    }
    if let Some(s) = session {
        builder = builder.header("Mcp-Session-Id", s);
    }
    let response = router
        .clone()
        .oneshot(builder.body(Body::from(body.to_string())).expect("请求"))
        .await
        .expect("oneshot");
    let status = response.status();
    let session_id = response
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(Into::into);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("响应体");
    // rmcp 3.2：成功响应为纯 JSON；错误响应可能以 SSE 流承载（data: 行）
    let json = parse_rpc_body(&body);
    (status, session_id, json)
}

/// 响应体解析：纯 JSON 直解；SSE（data: 行）取最后一条 JSON-RPC 消息
fn parse_rpc_body(body: &[u8]) -> Value {
    if body.is_empty() {
        return Value::Null;
    }
    let text = String::from_utf8_lossy(body);
    if let Ok(v) = serde_json::from_str::<Value>(&text) {
        return v;
    }
    text.lines()
        .filter_map(|line| line.strip_prefix("data: "))
        .filter_map(|data| serde_json::from_str::<Value>(data).ok())
        .find(|v| v.get("jsonrpc").is_some())
        .unwrap_or(Value::Null)
}

fn rpc_request(id: u64, method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
}

/// 握手 + initialized 通知，返回会话 id
async fn init_session(router: &axum::Router) -> (Option<String>, u64) {
    let (status, session, body) = rpc(
        router,
        rpc_request(
            1,
            "initialize",
            json!({
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": { "name": "test-client", "version": "0.0.0" }
            }),
        ),
        Some("test-token"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "initialize: {body}");
    assert_eq!(body["result"]["protocolVersion"], MCP_PROTOCOL_VERSION);
    let session = session.expect("initialize 回 Mcp-Session-Id");
    // initialized 通知（MCP 规约；202 即可）
    let (status, _, _) = rpc(
        router,
        json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
        Some("test-token"),
        Some(&session),
    )
    .await;
    assert!(status == StatusCode::ACCEPTED || status == StatusCode::OK, "通知 {status}");
    (Some(session), 1)
}

/// 工具调用（复用会话）
async fn call_tool(router: &axum::Router, session: &str, name: &str, args: Value) -> Value {
    let (status, _, body) = rpc(
        router,
        rpc_request(
            100,
            "tools/call",
            json!({ "name": name, "arguments": args }),
        ),
        Some("test-token"),
        Some(session),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "tools/call {name}: {body}");
    body
}

fn tool_text(body: &Value) -> Value {
    let text = body["result"]["content"][0]["text"].as_str().expect("text 内容");
    serde_json::from_str(text).expect("工具结果 JSON")
}

fn tool_error_code(body: &Value) -> String {
    body["error"]["data"]["code"]
        .as_str()
        .expect("data.code")
        .to_string()
}

#[tokio::test]
async fn full_mcp_flow_end_to_end() -> TestResult {
    let (router, _storage, _dir) = setup().await;

    // 无令牌 → 401（未过鉴权不暴露任何工具列表，NFR-005）
    let (status, _, _) = rpc(
        &router,
        rpc_request(1, "tools/list", json!({})),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // 版本不兼容 → ERR_VERSION_MISMATCH（不静默降级，UC-009 A3）。
    // SDK 行为（rmcp 3.2）：错误经 SSE 流承载 JSON-RPC error（HTTP 200），
    // 业务码与结构化上下文完整保留于 error.data。
    let (status, _, body) = rpc(
        &router,
        rpc_request(
            1,
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "old", "version": "0" }
            }),
        ),
        Some("test-token"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(tool_error_code(&body), "ERR_VERSION_MISMATCH");
    assert_eq!(body["error"]["data"]["supported"], MCP_PROTOCOL_VERSION);

    // 正常握手 → 14 工具
    let (session, _) = init_session(&router).await;
    let session = session.expect("会话");
    let (status, _, body) = rpc(
        &router,
        rpc_request(2, "tools/list", json!({})),
        Some("test-token"),
        Some(&session),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let tools = body["result"]["tools"].as_array().expect("工具列表");
    assert_eq!(tools.len(), 14, "M1 工具面 14 个（api-contracts）");
    let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
    for expected in [
        "create_project", "delete_project", "create_item", "edit_item",
        "transition_item", "add_relation", "remove_relation", "get_item",
        "search_items", "get_context", "get_project_state", "get_project_doc",
        "set_project_doc", "validate",
    ] {
        assert!(names.contains(&expected), "缺工具 {expected}：{names:?}");
    }

    // 写链路：项目 → 条目 → 编辑 OCC → 状态机
    let project = tool_text(
        &call_tool(
            &router,
            &session,
            "create_project",
            json!({ "name": "测试项目", "repo_path": "/repo" }),
        )
        .await,
    );
    let pid = project["projectId"].as_str().expect("projectId").to_string();
    let item = tool_text(
        &call_tool(
            &router,
            &session,
            "create_item",
            json!({ "project_id": pid, "type": "FR", "title": "登录需求", "body_md": "正文" }),
        )
        .await,
    );
    assert_eq!(item["code"], "FR-001");
    assert_eq!(item["revision"], 1);

    // OCC：期望修订号 1（当前已 1，编辑后 2）；再拿 1 编辑 → ERR_CONFLICT
    let edited = call_tool(
        &router,
        &session,
        "edit_item",
        json!({ "project_id": pid, "code": "FR-001", "expected_revision": 1, "title": "改" }),
    )
    .await;
    let edited = tool_text(&edited);
    assert_eq!(edited["new_revision"], 2);
    assert_eq!(edited["status"], "draft", "编辑草稿不退回（BR-009 仅 confirmed 触发）");
    let conflict = call_tool(
        &router,
        &session,
        "edit_item",
        json!({ "project_id": pid, "code": "FR-001", "expected_revision": 1, "title": "再改" }),
    )
    .await;
    assert_eq!(tool_error_code(&conflict), "ERR_CONFLICT");

    // 状态机：draft → confirmed 非法（含 allowed 目标）
    let illegal = call_tool(
        &router,
        &session,
        "transition_item",
        json!({ "project_id": pid, "code": "FR-001", "expected_revision": 2, "to": "confirmed" }),
    )
    .await;
    assert_eq!(tool_error_code(&illegal), "ERR_TRANSITION_ILLEGAL");
    assert!(illegal["error"]["data"]["allowed"].is_array());

    // 文档：新文档以 0 创建（契约细化）→ 1；get_project_doc 读回
    let doc = tool_text(
        &call_tool(
            &router,
            &session,
            "set_project_doc",
            json!({ "project_id": pid, "key": "overview", "expected_revision": 0, "title": "概览", "body_md": "第一版" }),
        )
        .await,
    );
    assert_eq!(doc["new_revision"], 1);
    let doc = tool_text(
        &call_tool(
            &router,
            &session,
            "get_project_doc",
            json!({ "project_id": pid, "key": "overview" }),
        )
        .await,
    );
    assert_eq!(doc["body_md"], "第一版");
    // 词表外 key → ERR_VALIDATION
    let bad_key = call_tool(
        &router,
        &session,
        "get_project_doc",
        json!({ "project_id": pid, "key": "secret" }),
    )
    .await;
    assert_eq!(tool_error_code(&bad_key), "ERR_VALIDATION");

    // 概况 + 搜索 + 诊断
    let state = tool_text(
        &call_tool(
            &router,
            &session,
            "get_project_state",
            json!({ "project_id": pid }),
        )
        .await,
    );
    assert_eq!(state["by_type"]["FR"], 1);
    let search = tool_text(
        &call_tool(
            &router,
            &session,
            "search_items",
            json!({ "project_id": pid, "q": "FR-" }),
        )
        .await,
    );
    assert_eq!(search["hits"].as_array().expect("hits").len(), 1);
    let validation = tool_text(
        &call_tool(&router, &session, "validate", json!({ "project_id": pid }))
            .await,
    );
    assert!(validation["issues"].as_array().expect("issues").is_empty());
    Ok(())
}

/// 直接读 get_info 校验握手元信息契约（不经 HTTP）
#[tokio::test]
async fn server_info_contract() -> TestResult {
    let (_router, storage, _dir) = setup().await;
    let server = McpServer::new(
        Arc::new(WriteService::new(storage.clone())),
        Arc::new(ReadService::new(storage)),
        None,
    );
    let info = server.get_info();
    assert_eq!(info.protocol_version.as_str(), MCP_PROTOCOL_VERSION);
    assert!(info.capabilities.tools.is_some());
    assert_eq!(info.server_info.name, "relay-harbor");
    Ok(())
}
