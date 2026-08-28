// UI 数据契约类型（INT-001 命令的参数与返回）。
// 实现期注记（2026-08-28）：tauri-specta generated 尚未包含这批命令（后端联调暂缓），
// 类型暂由本文件承载；联调时以 generated 产物为准替换，feature 层不感知。

/** 条目类型前缀（13 种，与类型一一绑定，INV-008） */
export const ITEM_TYPES = [
  "FR",
  "NFR",
  "BR",
  "CON",
  "UC",
  "DOM",
  "CMP",
  "INT",
  "SEQ",
  "ADR",
  "RISK",
  "OQ",
  "TASK",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** 非任务条目状态机（03 领域模型：三活态 + 双终态） */
export const ITEM_STATUSES = ["draft", "in_review", "confirmed", "cancelled", "superseded"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** 任务状态机（DOM-006） */
export const TASK_STATUSES = ["todo", "doing", "await_review", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type AnyStatus = ItemStatus | TaskStatus;

/** 关系类型（五种，动者在前：A 对 B 做某事） */
export const RELATION_TYPES = ["derives", "depends", "satisfies", "traces", "relates"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export interface ProjectSummary {
  id: string;
  name: string;
  repoPath: string | null;
  itemCount: number;
  taskCount: number;
  updatedAt: number;
}

export interface ItemSummary {
  projectId: string;
  /** 显示编号（DOM-008，前缀-序号，项目内唯一） */
  code: string;
  itemType: ItemType;
  title: string;
  status: AnyStatus;
  currentRevision: number;
  updatedAt: number;
  /** 已替代时指向替代者编号（可空，已替代时必填） */
  supersededBy: string | null;
}

export interface ItemDetail extends ItemSummary {
  bodyMd: string;
  metadata: Record<string, string>;
  createdAt: number;
}

/** 修订不可变快照（BR-004：历史版本查看即读此内容） */
export interface RevisionSnapshot {
  title: string;
  bodyMd: string;
  metadata: Record<string, string>;
  status: AnyStatus;
}

export interface Revision {
  code: string;
  revisionNo: number;
  /** 本地用户或 Agent 会话标识 */
  actor: string;
  summary: string;
  changedAt: number;
  snapshot: RevisionSnapshot;
}

/** 单条目一层关联（FR-010：按类型分组、上下游、点击跳转） */
export interface RelationEntry {
  relationType: RelationType;
  direction: "out" | "in";
  peer: ItemSummary;
}

export interface TaskCard {
  code: string;
  title: string;
  status: TaskStatus;
  updatedAt: number;
  /** 阻塞来源（未完成 depends 上游，BR-010 派生） */
  blockedBy: { code: string; title: string }[];
}

export interface TaskBoardColumn {
  status: TaskStatus;
  tasks: TaskCard[];
}

export interface TaskBoard {
  columns: TaskBoardColumn[];
}

/** 项目概况（get_project_state：各类型/状态计数） */
export interface ProjectState {
  byType: Partial<Record<ItemType, number>>;
  itemByStatus: Record<ItemStatus, number>;
  taskByStatus: Record<TaskStatus, number>;
}

/** 概览页最近修订（list_recent_revisions，FR-018/UI-011） */
export interface RecentRevision {
  code: string;
  title: string;
  revisionNo: number;
  actor: string;
  summary: string;
  changedAt: number;
}

export interface ImpactEntry {
  item: ItemSummary;
  /** 距触发条目的跳数 */
  depth: number;
  /** 经由的关系类型 */
  via: RelationType;
}

/** 影响定位结果（FR-013：derives/satisfies/depends 入边反向闭包） */
export interface ImpactResult {
  trigger: ItemSummary;
  entries: ImpactEntry[];
}

export type SearchMatchedIn = "code" | "title" | "body";

export interface SearchHit {
  item: ItemSummary;
  matchedIn: SearchMatchedIn;
}

export type ItemStatusFilter = AnyStatus | "all";

export interface ItemListFilter {
  type?: ItemType;
  status?: AnyStatus;
}

/** 应用设置（FR-016/017：非业务数据，UI 仅有的持久化写） */
export interface AppSettings {
  theme: "system" | "light" | "dark";
  language: "system" | "zh" | "en";
  closeBehavior: "tray" | "quit";
  lastLocation: string | null;
}

export type ThemeSetting = AppSettings["theme"];
export type LanguageSetting = AppSettings["language"];

export interface ExportOptions {
  /** 整项目或按类型筛选（UC-016 主流程） */
  scope: "all" | { types: ItemType[] };
  form: "directory" | "zip";
  targetPath: string;
}

export interface ExportResult {
  path: string;
  fileCount: number;
}
