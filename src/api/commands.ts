// 命令门面：feature 层取数的唯一入口（INT-001 白名单 16 命令）。
// 当前为 mock 实现（后端联调暂缓，2026-08-28，用户指令）；
// 联调时将各实现替换为 client.ts 导出的 tauri-specta 命令调用（含 list_recent_revisions 落地），
// 对 feature 层签名不变。
export {
  listProjects,
  getProjectState,
  getProjectOverview,
  listProjectOverviewRevisions,
  listItems,
  getItemDetail,
  getItemRevisions,
  getRelations,
  getTaskBoard,
  searchItems,
  getImpact,
  listRecentRevisions,
  exportMarkdown,
  getSettings,
  setSettings,
  appVersion,
} from "./mock/commands";
