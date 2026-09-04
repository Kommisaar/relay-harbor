//! IPC 只读命令通道（CMP-002 / INT-001 / CON-009）。
//!
//! 命令完整白名单：`config/ipc-command-whitelist.json`（CI 断言 registered ⊆ whitelist，
//! 业务写前缀一律禁止）。命令实现直接调用 services 读路径；本层不重复业务校验。

use serde::Serialize;

#[derive(Serialize, specta::Type)]
pub struct AppVersionResult {
    pub version: String,
}

/// 非业务信息命令：应用版本（UI 关于页显示）。不属 15 个业务只读命令。
#[tauri::command]
#[specta::specta]
pub fn app_version() -> AppVersionResult {
    AppVersionResult {
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}
