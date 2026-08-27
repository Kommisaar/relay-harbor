// data-changed 事件封装（INT-001 / ADR-006）。
// 类型与事件名均来自 tauri-specta 生成产物（禁手抄，ADR-007）；事件只承载失效信号不承载数据。
// 事件线名 data-changed-event 由 tauri-specta 从 DataChangedEvent 结构名生成（见 api-contracts 偏差注记）。
import { events } from "./generated/bindings";

export function listenDataChanged(handler: (projectId: string) => void): Promise<() => void> {
  return events.dataChangedEvent.listen((e) => handler(e.payload.projectId));
}
