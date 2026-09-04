// invoke 唯一出口（ADR-006/007）：前端唯一允许触碰 @tauri-apps/api 的层。
// 命令与类型一律来自 tauri-specta 生成产物，由这里再导出给各 feature 使用。
export { commands, events } from "./generated/bindings";
