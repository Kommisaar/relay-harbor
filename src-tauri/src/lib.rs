//! RelayHarbor 桌面应用（M1）。
//!
//! 四层 DDD（ADR-001）：`interfaces → services → domain ← infra`，`state` 为组合根。
//! 本文件只声明模块与 Tauri 装配入口；托盘/单实例等应用行为随 FR-015 实现任务落地。
//!
//! 设计基线见 `docs/design/`（00～06 已确认，2026-08-27）。

// 层模块 pub：tests/ 集成测试经公共 API 断言领域规则（迁移矩阵等），
// 同时使层内 pub 项计为已用（私有 mod 的 pub 项会触发 dead_code）。
pub mod domain;
pub mod infra;
pub mod interfaces;
pub mod services;
pub mod state;

/// AppState 经 lib 根再导出供 interfaces 命令以 `State<'_, AppState>` 注入
///（ADR-006 组合根单向装配；check-rust-boundaries 的 crate::state 禁令针对
/// 构造性依赖，注入型类型引用走此根导出）。
pub use state::AppState;

use tauri::Manager;
use tauri_specta::{collect_commands, collect_events, Builder};

/// specta 契约构建（CON-008）：命令与事件类型经此生成前端绑定。
fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            interfaces::ipc::app_version,
            interfaces::ipc::list_projects,
            interfaces::ipc::get_project_state,
            interfaces::ipc::get_project_doc,
            interfaces::ipc::list_project_doc_revisions,
            interfaces::ipc::list_items,
            interfaces::ipc::get_item_detail,
            interfaces::ipc::get_item_revisions,
            interfaces::ipc::get_relations,
            interfaces::ipc::get_task_board,
            interfaces::ipc::search_items,
            interfaces::ipc::get_impact,
            interfaces::ipc::list_recent_revisions,
            interfaces::ipc::export_markdown,
            interfaces::ipc::get_settings,
            interfaces::ipc::set_settings,
        ])
        .events(collect_events![
            interfaces::events::DataChangedEvent,
            interfaces::events::ExportProgressEvent,
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta = specta_builder();
    #[cfg(debug_assertions)]
    specta
        .export(
            specta_typescript::Typescript::default(),
            "../src/api/generated/bindings.ts",
        )
        .expect("导出 TypeScript 绑定失败");

    tauri::Builder::default()
        // FR-015 单实例：二次启动唤起已有窗口（回调在第二实例进程内执行）
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .invoke_handler(specta.invoke_handler())
        .setup(|app| {
            // 组合根装配（ADR-001）：数据库打开 + 迁移 + 日志初始化。
            // 失败即 fail-fast（数据目录不可用属启动期硬错误）。
            let state = tauri::async_runtime::block_on(state::AppState::init())
                .expect("组合根装配失败");
            app.manage(state);
            // 本地 MCP 通道（P5(2/2)）：回环随机端口 + 每会话令牌轮换 +
            // bridge.json 刷新（INT-005）+ 后台 axum 服务。失败 fail-fast。
            let handle = app.handle().clone();
            let state = app.state::<state::AppState>();
            tauri::async_runtime::block_on(interfaces::http::start(&handle, &state))
                .expect("MCP 通道启动失败");
            // 托盘常驻（FR-015）：菜单文案随语言设置（zh/en），左键唤起主窗
            build_tray(app)?;
            Ok(())
        })
        // FR-015 关窗策略（settings.closeBehavior）：tray=隐藏常驻托盘；
        // quit=默认退出。设置在关窗时即时读取（非启动缓存）。
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                use crate::infra::runtime::{CloseBehavior, load_settings};
                use tauri::Manager;
                let paths = window
                    .app_handle()
                    .state::<state::AppState>()
                    .paths
                    .clone();
                if load_settings(&paths).close_behavior == CloseBehavior::Tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("运行 RelayHarbor 失败");
}

/// 唤起主窗口（托盘单击 / 单实例二次启动共用）
fn show_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 托盘构建（FR-015）：显示主窗口 / 退出；文案随 settings.language
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    use crate::infra::runtime::{LanguageSetting, load_settings};
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::Manager;

    let paths = app.state::<state::AppState>().paths.clone();
    let zh = load_settings(&paths).language != LanguageSetting::En;
    let (show_label, quit_label) = if zh {
        ("显示主窗口", "退出")
    } else {
        ("Show window", "Quit")
    };
    let show = MenuItem::with_id(app, "show", show_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().expect("应用图标").clone())
        .tooltip("RelayHarbor")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    /// 契约生成（CON-008）：`cargo test` 时刷新 `src/api/generated/bindings.ts`。
    /// 产物提交入库；后端 DTO 变更后须重新生成并一并提交。
    #[test]
    fn export_ts_bindings() {
        super::specta_builder()
            .export(
                specta_typescript::Typescript::default(),
                "../src/api/generated/bindings.ts",
            )
            .expect("导出 TypeScript 绑定失败");
    }
}
