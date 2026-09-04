// UI 数据契约类型（INT-001 命令的参数与返回）。
// 实现期注记（2026-08-28）：tauri-specta generated 尚未包含这批命令（后端联调暂缓），
// 类型暂由本文件承载；联调时以 generated 产物为准替换，feature 层不感知。

/** 条目类型前缀（15 种，与类型一一绑定，INV-008）。UI 为 2026-09-01
    用户指令升格（沿用 UI-xxx 索引体系，见 05-detailed-design/ui/README.md）；
    MOD 为 2026-09-04 修订循环新增（模块设计，固定序 UI 之后，DOM-002 留痕） */
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
  "UI",
  "MOD",
  "ADR",
  "RISK",
  "OQ",
  "TASK",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** 项目级文档 key（DOM-009，2026-09-04：受控词表，扩展走设计修订，
    不允许项目自定义） */
export const PROJECT_DOC_KEYS = ["overview", "data_model", "structure", "tech_stack"] as const;
export type ProjectDocKey = (typeof PROJECT_DOC_KEYS)[number];

/** 非任务条目状态机（03 领域模型：三活态 + 三终态） */
export const ITEM_STATUSES = ["draft", "in_review", "confirmed", "cancelled", "superseded", "deprecated"] as const;
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
  /** 修订标题（变更主题；2026-09-03 用户指令替代 actor，操作者审计在操作日志） */
  title: string;
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

/** 逐日计数（get_project_state.revisionsByDay，UI-011 活动图，2026-09-02；原名修订热力图） */
export interface DayCount {
  /** 本地日期 YYYY-MM-DD */
  date: string;
  count: number;
}

/** 项目概况（get_project_state：各类型/状态计数 + 近 182 天逐日修订计数） */
export interface ProjectState {
  byType: Partial<Record<ItemType, number>>;
  itemByStatus: Record<ItemStatus, number>;
  taskByStatus: Record<TaskStatus, number>;
  revisionsByDay: DayCount[];
}

/** 概览页最近修订（list_recent_revisions，FR-018/UI-011）。title 为
    条目标题（区别于修订自身的 summary） */
export interface RecentRevision {
  code: string;
  title: string;
  revisionNo: number;
  summary: string;
  changedAt: number;
}

/** 项目级文档（get_project_doc(key)，DOM-009；由 get_project_overview
    泛化改名 2026-09-04，UI-035 概览为 key=overview 实例）：每项目每 key
    一篇可维护 Markdown 文档，Agent 经 MCP 修订、UI 只读渲染，内容为
    项目数据不参与 i18n。返回当前版正文与头部元信息（一次取齐） */
export interface ProjectDoc {
  title: string;
  bodyMd: string;
  revisionNo: number;
  summary: string;
  changedAt: number;
}

/** 项目级文档修订（list_project_doc_revisions，BR-004 不可变追加）。
    快照含标题/正文，版本切换不另发命令（同 get_item_revisions
    一次取齐策略）；文档非条目——无类型/状态/元数据字段 */
export interface ProjectDocRevision {
  revisionNo: number;
  /** 修订标题（2026-09-03 用户指令替代 actor） */
  title: string;
  summary: string;
  changedAt: number;
  snapshot: {
    title: string;
    bodyMd: string;
  };
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
