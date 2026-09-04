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
        Ok(RuntimePaths {
            db_path: data_root.join("relayharbor.db"),
            logs_dir,
            settings_path: data_root.join("settings.json"),
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
