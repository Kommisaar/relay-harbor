// data-changed 事件封装（INT-001 / ADR-006）。
// 经 client 环境分派：桌面=tauri-specta 生成事件（线名 data-changed-event
// 由结构名生成，见 api-contracts 偏差注记）；浏览器=mock 空源（注册即空、
// 永不触发）。事件只承载失效信号不承载数据。
import { events } from "./client";

export function listenDataChanged(handler: (projectId: string) => void): Promise<() => void> {
  return events.dataChangedEvent.listen((e) => handler(e.payload.projectId));
}
