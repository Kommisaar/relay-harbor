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

use tauri_specta::{collect_commands, collect_events, Builder};

/// specta 契约构建（CON-008）：命令与事件类型经此生成前端绑定。
fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![interfaces::ipc::app_version,])
        .events(collect_events![interfaces::events::DataChangedEvent,])
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
        .invoke_handler(specta.invoke_handler())
        .run(tauri::generate_context!())
        .expect("运行 RelayHarbor 失败");
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
