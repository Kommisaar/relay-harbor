//! 运行时设施（CMP-007）：数据根目录（~/.relayharbor，NFR-005 仅当前用户
//! 可读写）、数据库路径、settings.json（应用设置，非业务数据）、
//! 结构化日志（NFR-007：~/.relayharbor/logs 按日轮转 JSON）。
//! bridge.json 原子写出与令牌轮换（INT-005）随 P5 落地；
//! 托盘/单实例等应用行为（FR-015）随 P6 落地。

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// 运行时路径集（组合根解析一次，处处传递；测试可注入临时根目录）
#[derive(Debug, Clone)]
pub struct RuntimePaths {
    pub data_root: PathBuf,
    pub db_path: PathBuf,
    pub logs_dir: PathBuf,
    pub settings_path: PathBuf,
    /// bridge.json 目录（INT-005 权威路径 ~/.relayharbor/runtime/，P6.0 修正）
    pub runtime_dir: PathBuf,
    /// bridge.json 完整路径（bridge 侧发现读取）
    pub bridge_json_path: PathBuf,
}

impl RuntimePaths {
    /// 默认根目录 `~/.relayharbor` 并创建目录结构
    pub fn resolve_default() -> io::Result<Self> {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .map_err(|_| io::Error::other("无法确定用户主目录（USERPROFILE/HOME 均未设置）"))?;
        Self::resolve(Path::new(&home).join(".relayharbor"))
    }

    /// 指定根目录（测试注入临时目录）
    pub fn resolve(data_root: PathBuf) -> io::Result<Self> {
        fs::create_dir_all(&data_root)?;
        let logs_dir = data_root.join("logs");
        fs::create_dir_all(&logs_dir)?;
        let runtime_dir = data_root.join("runtime");
        fs::create_dir_all(&runtime_dir)?;
        Ok(RuntimePaths {
            db_path: data_root.join("relayharbor.db"),
            logs_dir,
            settings_path: data_root.join("settings.json"),
            bridge_json_path: runtime_dir.join("bridge.json"),
            runtime_dir,
            data_root,
        })
    }
}

/// 应用设置（UI settings 页四项；非业务数据，不入 SQLite——CON-009 语义：
/// settings 属应用配置，get/set_settings 是白名单内的非业务命令）。
/// `#[serde(default)]` 字段缺省容忍：旧 settings.json 少字段回默认值（NFR-006）。
/// specta::Type：settings 命令 DTO 直用（IPC 形态 = 存储形态，单一事实来源）。
#[derive(
    Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: ThemeSetting,
    pub language: LanguageSetting,
    pub close_behavior: CloseBehavior,
    pub last_location: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            theme: ThemeSetting::System,
            language: LanguageSetting::System,
            close_behavior: CloseBehavior::Tray,
            last_location: None,
        }
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(rename_all = "lowercase")]
pub enum ThemeSetting {
    System,
    Light,
    Dark,
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(rename_all = "lowercase")]
pub enum LanguageSetting {
    System,
    Zh,
    En,
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(rename_all = "lowercase")]
pub enum CloseBehavior {
    /// 关窗最小化到托盘（FR-015，P6 落地）
    Tray,
    Quit,
}

/// 读取 settings.json（缺失/损坏 → 默认值并留痕）
pub fn load_settings(paths: &RuntimePaths) -> AppSettings {
    match fs::read_to_string(&paths.settings_path) {
        Ok(text) => match serde_json::from_str(&text) {
            Ok(settings) => settings,
            Err(e) => {
                tracing::warn!(error = %e, path = %paths.settings_path.display(), "settings.json 解析失败，回退默认设置");
                AppSettings::default()
            }
        },
        Err(_) => AppSettings::default(),
    }
}

/// 原子写出 settings.json（临时文件 + rename，INT-005 同款手法）
pub fn store_settings(paths: &RuntimePaths, settings: &AppSettings) -> io::Result<()> {
    let text = serde_json::to_string_pretty(settings)
        .map_err(|e| io::Error::other(format!("settings 序列化失败：{e}")))?;
    let tmp = paths.settings_path.with_extension("json.tmp");
    fs::write(&tmp, text)?;
    fs::rename(&tmp, &paths.settings_path)?;
    Ok(())
}

/// 初始化结构化日志（NFR-007：JSON 行 + 按日轮转）。
/// 返回的 guard 必须在进程生命周期内持有（drop 即停写 flush）。
pub fn init_logging(paths: &RuntimePaths) -> tracing_appender::non_blocking::WorkerGuard {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let appender = tracing_appender::rolling::daily(&paths.logs_dir, "relayharbor.log");
    let (writer, guard) = tracing_appender::non_blocking(appender);
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .with_ansi(false)
        .with_writer(writer)
        .with_current_span(false)
        .with_span_list(false)
        .init();
    guard
}

// ---- MCP 通道运行时（INT-005 bridge.json，P5 落地）----

/// MCP 协议版本（INT-005 握手契约；随协议演进走设计修订）
pub const MCP_PROTOCOL_VERSION: &str = "2025-06-18";

/// bridge.json 发现文件（读取方仅 mcp-bridge；version 字段保证格式演进可检测）
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeDiscovery {
    pub version: u32,
    pub port: u16,
    pub token: String,
    pub pid: u32,
    pub protocol_version: String,
    pub updated_at: String,
}

/// 回环随机端口分配：先绑 127.0.0.1:0 占位，监听器交 axum 复用
///（消除「分配后绑定」竞态；除该端口外无任何网络监听，NFR-005）
pub fn bind_loopback() -> io::Result<(std::net::TcpListener, u16)> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    Ok((listener, port))
}

/// 会话令牌（每会话轮换：应用启动生成新令牌并原子更新 bridge.json，
/// 旧令牌全部失效）。两个 UUIDv4 拼接 ≈244bit 随机（留痕：避免引入 rand
/// 依赖；INT-005 要求 256bit 量级，244bit 足够会话隔离强度）。
pub fn token_new() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// 原子写出 bridge.json（临时文件 + rename，权限继承数据目录——
/// Windows 下 ~/.relayharbor 位于用户 profile，默认 ACL 仅当前用户可读写，
/// NFR-005 文件权限要求的实现基线）
pub fn write_bridge_json(paths: &RuntimePaths, discovery: &BridgeDiscovery) -> io::Result<()> {
    let text = serde_json::to_string_pretty(discovery)
        .map_err(|e| io::Error::other(format!("bridge.json 序列化失败：{e}")))?;
    let tmp = paths.bridge_json_path.with_extension("json.tmp");
    fs::write(&tmp, text)?;
    fs::rename(&tmp, &paths.bridge_json_path)?;
    Ok(())
}

/// 读取 bridge.json（bridge 侧发现入口；缺失/损坏/版本不识别 → None）
pub fn read_bridge_json(paths: &RuntimePaths) -> Option<BridgeDiscovery> {
    let text = fs::read_to_string(&paths.bridge_json_path).ok()?;
    match serde_json::from_str::<BridgeDiscovery>(&text) {
        Ok(d) if d.version == 1 => Some(d),
        other => {
            tracing::warn!(parsed = ?other.map(|d| d.version), "bridge.json 缺失或版本不识别");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_roundtrip_and_defaults() {
        let tmp = tempfile::tempdir().expect("临时目录");
        let paths = RuntimePaths::resolve(tmp.path().to_path_buf()).expect("路径解析");

        // 缺失 → 默认
        assert_eq!(load_settings(&paths), AppSettings::default());

        // 写读往返
        let settings = AppSettings {
            theme: ThemeSetting::Dark,
            language: LanguageSetting::Zh,
            close_behavior: CloseBehavior::Quit,
            last_location: Some("/projects/p1".into()),
        };
        store_settings(&paths, &settings).expect("写出");
        assert_eq!(load_settings(&paths), settings);
    }
}
