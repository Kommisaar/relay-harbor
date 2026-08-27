# api/generated

tauri-specta 生成的前端类型绑定（CON-008 契约链：Rust DTO → specta → 此目录，提交入库）。

- 生成方式：`cargo test`（src-tauri 内的 `export_ts_bindings` 测试）或 debug 模式运行应用；
- **禁止手改**：改动后端 DTO 后重新生成；
- 业务代码不直接 import 本目录，一律经 `src/api/client.ts` / `src/api/events.ts` 再导出（dependency-cruiser 强制）。
