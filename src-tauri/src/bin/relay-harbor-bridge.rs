//! mcp-bridge（CMP-008 / INT-003 / INT-005 / ADR-005）：stdio MCP Server
//! 面向 MCP 客户端，HTTP 客户端面向应用本地 API——**纯透传**（不改内容、
//! 不缓存业务数据），令牌注入（客户端无感知）。
//!
//! 发现与恢复（modules/bridge.md 关键规则）：
//! - 发现：读 `~/.relayharbor/runtime/bridge.json`（INT-005）；
//! - 拉起：文件缺失或连接失败时启动同目录应用进程并轮询就绪——每 500ms
//!   重读 bridge.json 并探测端口，上限 15 秒（NFR-003 冷启动 3s 的 5 倍余量），
//!   超时向客户端返回明确错误；
//! - 令牌失效（401）：自动走一次发现/拉起流程后重试原请求一次，仍失败才报
//!   ERR_UNAUTHORIZED；
//! - stderr 输出发现/拉起/重连事件（stdout 保留给 MCP 协议）。
//!
//! 排队语义留痕：恢复经 tokio Mutex 串行化——恢复期间并发请求在锁上排队
//!（近似「排队上限 1」；有界快速失败留待实测需要收紧，单客户端串行使用下
//! 不触发，modules/bridge.md 并发条款）。
//!
//! 打包留痕：M1 以同 crate 第二二进制交付（ADR-008 单 crate 零投机）；
//! 实现语言与分发方式随 Plugin 侧联定（设计开放问题）。

use std::time::{Duration, Instant};

use relay_harbor_lib::infra::runtime::{
    read_bridge_json, BridgeDiscovery, RuntimePaths, MCP_PROTOCOL_VERSION,
};
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, ClientCapabilities, ErrorCode, ErrorData,
    Implementation, InitializeRequestParams, InitializeResult, PaginatedRequestParams,
    ProtocolVersion, ServerInfo,
};
use rmcp::service::{
    serve_client, serve_server, RequestContext, RoleClient, RoleServer, RunningService,
};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::transport::StreamableHttpClientTransport;
use rmcp::ServerHandler;
use serde_json::json;
use tokio::sync::Mutex;

/// 就绪时限（UC-009 开放问题在 bridge.md 定案：15 秒，500ms 轮询）
const READY_TIMEOUT: Duration = Duration::from_secs(15);
const POLL_INTERVAL: Duration = Duration::from_millis(500);

/// 上游连接（应用本地 API 的 MCP 客户端会话）
struct Upstream {
    service: RunningService<RoleClient, InitializeRequestParams>,
    /// 诊断用（重连日志标识上游端口）
    #[allow(dead_code)]
    port: u16,
}

/// 转发桥（无业务状态；上游连接在互斥锁内惰性建立）
#[derive(Default)]
struct Bridge {
    upstream: Mutex<Option<Upstream>>,
}

impl Bridge {
    fn paths() -> Result<RuntimePaths, String> {
        RuntimePaths::resolve_default().map_err(|e| format!("运行时目录不可用：{e}"))
    }

    /// 建立上游 MCP 客户端会话（版本握手在此校验——不兼容即失败，UC-009）
    async fn connect(discovery: &BridgeDiscovery) -> Result<Upstream, String> {
        let uri = format!("http://127.0.0.1:{}/mcp", discovery.port);
        let transport = StreamableHttpClientTransport::from_config(
            StreamableHttpClientTransportConfig::with_uri(uri.clone())
                .auth_header(discovery.token.clone()),
        );
        // 客户端信息固定契约版本（应用侧硬校验同版本；避免双跳不一致）
        let client_info = InitializeRequestParams::new(
            ClientCapabilities::default(),
            Implementation::new(
                "relay-harbor-bridge",
                env!("CARGO_PKG_VERSION"),
            ),
        )
        .with_protocol_version(ProtocolVersion::V_2025_06_18);
        let service = serve_client(client_info, transport)
            .await
            .map_err(|e| format!("上游握手失败（{uri}）：{e}"))?;
        Ok(Upstream {
            service,
            port: discovery.port,
        })
    }

    /// 拉起应用进程（与 bridge 同目录的 relay-harbor 可执行）
    fn launch_app() -> Result<(), String> {
        let exe = std::env::current_exe()
            .map_err(|e| format!("定位 bridge 可执行失败：{e}"))?
            .parent()
            .ok_or("bridge 可执行无父目录")?
            .join(if cfg!(windows) {
                "relay-harbor.exe"
            } else {
                "relay-harbor"
            });
        std::process::Command::new(&exe)
            .spawn()
            .map_err(|e| format!("拉起应用失败（{}）：{e}", exe.display()))?;
        eprintln!("[bridge] 已拉起应用进程：{}", exe.display());
        Ok(())
    }

    /// 发现 →（失败）拉起 → 就绪轮询（15s）→ 重连
    async fn establish() -> Result<Upstream, String> {
        let paths = Self::paths()?;
        if let Some(discovery) = read_bridge_json(&paths) {
            match Self::connect(&discovery).await {
                Ok(upstream) => {
                    eprintln!("[bridge] 上游已连接：port={}", discovery.port);
                    return Ok(upstream);
                }
                Err(e) => eprintln!("[bridge] 连接失败（{e}），转入拉起流程"),
            }
        } else {
            eprintln!("[bridge] bridge.json 缺失或版本不识别，转入拉起流程");
        }
        Self::launch_app()?;
        let deadline = Instant::now() + READY_TIMEOUT;
        while Instant::now() < deadline {
            tokio::time::sleep(POLL_INTERVAL).await;
            if let Some(discovery) = read_bridge_json(&paths) {
                if tokio::net::TcpStream::connect(("127.0.0.1", discovery.port))
                    .await
                    .is_ok()
                {
                    let upstream = Self::connect(&discovery).await?;
                    eprintln!("[bridge] 应用就绪并已连接：port={}", discovery.port);
                    return Ok(upstream);
                }
            }
        }
        Err(format!(
            "应用就绪超时（{READY_TIMEOUT:?}，UC-009 最小保证：返回明确错误而非静默挂起）"
        ))
    }

    /// 恢复期间丢弃旧上游（令牌轮换/应用退出后重连）；上游由 upstream() 重新建立
    async fn reconnect(&self) -> Result<(), String> {
        let mut guard = self.upstream.lock().await;
        *guard = None;
        let upstream = Self::establish().await?;
        *guard = Some(upstream);
        Ok(())
    }

    /// 取上游（惰性建立；恢复经锁串行化——排队语义见模块头留痕）
    async fn upstream(&self) -> Result<tokio::sync::MutexGuard<'_, Option<Upstream>>, ErrorData> {
        let mut guard = self.upstream.lock().await;
        if guard.is_none() {
            match Self::establish().await {
                Ok(upstream) => *guard = Some(upstream),
                Err(e) => {
                    return Err(ErrorData::new(
                        ErrorCode::INTERNAL_ERROR,
                        format!("上游不可用：{e}"),
                        Some(json!({ "code": "ERR_UNAUTHORIZED" })),
                    ))
                }
            }
        }
        Ok(guard)
    }

    /// 转发请求；401/上游失效 → 重建一次并重试原请求（bridge.md 恢复规则）
    async fn forward(&self, request: ForwardRequest) -> Result<ForwardResponse, ErrorData> {
        match self.attempt(&request).await {
            Ok(response) => Ok(response),
            Err(e) if is_upstream_invalid(&e) => {
                eprintln!("[bridge] 上游失效（{e}），重发现并重试一次");
                self.reconnect().await.map_err(|e| {
                    ErrorData::new(
                        ErrorCode::INTERNAL_ERROR,
                        format!("重发现失败：{e}"),
                        Some(json!({ "code": "ERR_UNAUTHORIZED" })),
                    )
                })?;
                self.attempt(&request)
                    .await
                    .map_err(|e| internal_mcp(&format!("重试仍失败：{e}")))
            }
            Err(e) => Err(internal_mcp(&e)),
        }
    }

    /// 单次转发尝试（锁内取上游；错误上抛供恢复判定）
    async fn attempt(&self, request: &ForwardRequest) -> Result<ForwardResponse, String> {
        let guard = self.upstream().await.map_err(|e| e.to_string())?;
        let Some(upstream) = guard.as_ref() else {
            return Err("上游连接状态异常".to_string());
        };
        let peer = upstream.service.peer();
        match request {
            ForwardRequest::ListTools(params) => peer
                .list_tools(params.clone())
                .await
                .map(ForwardResponse::Tools)
                .map_err(|e| e.to_string()),
            ForwardRequest::CallTool(params) => peer
                .call_tool(params.clone())
                .await
                .map(ForwardResponse::Call)
                .map_err(|e| e.to_string()),
        }
    }
}

/// 透传请求（stdio 客户端 → 应用 HTTP 的原样载荷）
enum ForwardRequest {
    ListTools(Option<PaginatedRequestParams>),
    CallTool(CallToolRequestParams),
}

/// 透传响应（应用 → stdio 客户端）
enum ForwardResponse {
    Tools(rmcp::model::ListToolsResult),
    Call(rmcp::model::CallToolResult),
}

/// 上游失效判定（HTTP 401 / 连接拒绝 / 传输关闭——均走重发现恢复）
fn is_upstream_invalid(message: &str) -> bool {
    message.contains("401")
        || message.contains("Unauthorized")
        || message.contains("ERR_UNAUTHORIZED")
        || message.contains("connection refused")
        || message.contains("transport closed")
        || message.to_lowercase().contains("transportclosed")
}

fn internal_mcp(message: &str) -> ErrorData {
    ErrorData::new(
        ErrorCode::INTERNAL_ERROR,
        message.to_string(),
        Some(json!({ "code": "ERR_INTERNAL" })),
    )
}

impl ServerHandler for Bridge {
    /// 桥接会话（INT-003）：bridge 侧应答版本信息后透传应用握手结果，
    /// 避免双跳不一致。客户端版本与契约不符 → ERR_VERSION_MISMATCH。
    async fn initialize(
        &self,
        request: InitializeRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<InitializeResult, ErrorData> {
        if request.protocol_version.as_str() != MCP_PROTOCOL_VERSION {
            return Err(ErrorData::new(
                ErrorCode::INVALID_PARAMS,
                format!(
                    "协议版本不兼容：收到 {}，bridge 支持 {MCP_PROTOCOL_VERSION}",
                    request.protocol_version.as_str()
                ),
                Some(json!({
                    "code": "ERR_VERSION_MISMATCH",
                    "supported": MCP_PROTOCOL_VERSION,
                    "received": request.protocol_version.as_str(),
                })),
            ));
        }
        let guard = self.upstream().await?;
        let peer = guard
            .as_ref()
            .and_then(|u| u.service.peer_info())
            .map(|arc| (*arc).clone())
            .ok_or_else(|| internal_mcp("上游无握手信息"))?;
        context.peer.set_peer_info(request);
        // 透传应用握手结果（ServerPeerInfo → InitializeResult 同构投影）
        let mut result = InitializeResult::new(peer.capabilities);
        result.protocol_version = peer.protocol_version;
        result.server_info = peer
            .server_info
            .unwrap_or_else(|| Implementation::new("relay-harbor", env!("CARGO_PKG_VERSION")));
        result.instructions = peer.instructions;
        Ok(result)
    }

    /// 透传 tools/list（含分页参数原样转发）
    async fn list_tools(
        &self,
        request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<rmcp::model::ListToolsResult, ErrorData> {
        match self.forward(ForwardRequest::ListTools(request)).await? {
            ForwardResponse::Tools(result) => Ok(result),
            ForwardResponse::Call(_) => unreachable!("tools/list 不会返回工具调用响应"),
        }
    }

    /// 透传 tools/call（参数原样；MRTR 轮次由上游客户端会话驱动）
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        match self.forward(ForwardRequest::CallTool(request)).await? {
            ForwardResponse::Call(result) => Ok(CallToolResponse::Complete(result)),
            ForwardResponse::Tools(_) => unreachable!("tools/call 不会返回列表响应"),
        }
    }

    /// 桥接标识（真实服务信息由 initialize 透传覆盖）
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::new(
            rmcp::model::ServerCapabilities::builder()
                .enable_tools()
                .build(),
        )
        .with_server_info(Implementation::new(
            "relay-harbor-bridge",
            env!("CARGO_PKG_VERSION"),
        ));
        info.protocol_version = ProtocolVersion::V_2025_06_18;
        info
    }
}

#[tokio::main]
async fn main() {
    // stderr 日志（stdout 保留给 MCP 协议，modules/bridge.md 可观测性条款）
    let bridge = Bridge::default();
    eprintln!("[bridge] 启动（stdio ↔ 本地 HTTP 透传）");
    let transport = rmcp::transport::stdio();
    if let Err(e) = serve_server(bridge, transport).await {
        eprintln!("[bridge] 服务退出：{e}");
        std::process::exit(1);
    }
}
