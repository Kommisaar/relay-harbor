// 应用 manifest 改由链接器统一嵌入（见 .cargo/config.toml）：
// tauri-build 默认经资源文件内嵌 manifest，与链接器 /MANIFEST:EMBED 在 bin 目标上冲突
// （CVT1100 资源重复），且不会覆盖 cargo test 的测试二进制（Windows 上 STATUS_ENTRYPOINT_NOT_FOUND）。
// 两边内容等价（均为 Common-Controls v6 依赖），此处关闭资源内嵌。
fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
    )
    .expect("tauri-build 执行失败");
}
