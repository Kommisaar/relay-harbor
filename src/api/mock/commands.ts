// Mock 命令实现（后端联调暂缓，2026-08-28）：签名与 INT-001 白名单一致，
// 查询类加 ~150ms 模拟延迟以呈现骨架屏；联调时由 api/commands.ts 切换至
// tauri-specta 产物，feature 层不感知。
// 错误以短码抛出（Error.message），UI 层经 i18n 映射文案。
import type {
  AppSettings,
  ExportOptions,
  ExportResult,
  ImpactResult,
  ItemListFilter,
  ItemSummary,
  ItemType,
  OverviewRevision,
  ProjectOverviewDoc,
  ProjectState,
  ProjectSummary,
  RecentRevision,
  RelationEntry,
  Revision,
  SearchHit,
  TaskBoard,
  TaskStatus,
} from "../types";
import { ITEM_STATUSES, TASK_STATUSES } from "../types";
import { findItem, findProject, isTaskActive, projects } from "./fixtures";

const delay = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms));

const SETTINGS_KEY = "relay-harbor:settings";

const defaultSettings: AppSettings = {
  theme: "system",
  language: "system",
  closeBehavior: "tray",
  lastLocation: null,
};

function toSummary(item: ReturnType<typeof findItem> & object): ItemSummary {
  const { bodyMd: _body, metadata: _meta, createdAt: _created, ...summary } = item;
  return summary;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await delay();
  return projects.map((p) => ({ ...p.summary }));
}

// 本地日期 YYYY-MM-DD（revisionsByDay 口径：自然日按本地时区）
const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// FNV-1a 32 位散列：热力图逐日计数用（projectId+日期播种，跨刷新确定性不变）
const hash32 = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// 近 182 天（26 周）逐日修订计数：确定性合成（mock 修订稀疏，撑不起日历
// 网格观感），近期天数加权更热、约 1/4 天数为零；联调后由后端真实聚合
const revisionsByDay = (projectId: string): ProjectState["revisionsByDay"] => {
  const days: ProjectState["revisionsByDay"] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let recency = 181; recency >= 0; recency--) {
    const t = today.getTime() - recency * 86_400_000;
    const key = dayKey(t);
    const raw = hash32(`${projectId}:${key}`);
    let count = raw % 8;
    count = count <= 1 ? 0 : count - 1; // 0..6，25% 零日
    if (recency < 14 && count > 0) count += 1; // 近两周更活跃
    if (recency === 0 && count === 0) count = 2; // 今天保底有活动
    days.push({ date: key, count });
  }
  return days;
};

export async function getProjectState(projectId: string): Promise<ProjectState> {
  await delay();
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const byType: ProjectState["byType"] = {};
  const itemByStatus = Object.fromEntries(ITEM_STATUSES.map((s) => [s, 0])) as ProjectState["itemByStatus"];
  const taskByStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as ProjectState["taskByStatus"];
  for (const item of project.items) {
    byType[item.itemType] = (byType[item.itemType] ?? 0) + 1;
    if (item.itemType === "TASK") taskByStatus[item.status as keyof ProjectState["taskByStatus"]] += 1;
    else itemByStatus[item.status as keyof ProjectState["itemByStatus"]] += 1;
  }
  return { byType, itemByStatus, taskByStatus, revisionsByDay: revisionsByDay(projectId) };
}

export async function getProjectOverview(projectId: string): Promise<ProjectOverviewDoc> {
  await delay();
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return { ...project.overview };
}

export async function listProjectOverviewRevisions(projectId: string): Promise<OverviewRevision[]> {
  await delay();
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return [...project.overviewRevisions].sort((a, b) => b.revisionNo - a.revisionNo);
}

export async function listItems(projectId: string, filter: ItemListFilter = {}): Promise<ItemSummary[]> {
  await delay();
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project.items
    .filter((i) => (filter.type ? i.itemType === filter.type : true))
    .filter((i) => (filter.status ? i.status === filter.status : true))
    .map(toSummary)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function getItemDetail(projectId: string, code: string) {
  await delay();
  const item = findItem(projectId, code);
  if (!item) throw new Error("ITEM_NOT_FOUND");
  return { ...item };
}

export async function getItemRevisions(projectId: string, code: string): Promise<Revision[]> {
  await delay();
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const list = project.revisions.filter((r) => r.code === code);
  if (list.length === 0) throw new Error("ITEM_NOT_FOUND");
  return [...list].sort((a, b) => b.revisionNo - a.revisionNo);
}

export async function getRelations(projectId: string, code: string): Promise<RelationEntry[]> {
  await delay();
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (!project.items.some((i) => i.code === code)) throw new Error("ITEM_NOT_FOUND");
  const entries: RelationEntry[] = [];
  for (const rel of project.relations) {
    if (rel.source === code) {
      const peer = project.items.find((i) => i.code === rel.target);
      if (peer) entries.push({ relationType: rel.type, direction: "out", peer: toSummary(peer) });
    }
    if (rel.target === code) {
      const peer = project.items.find((i) => i.code === rel.source);
      if (peer) entries.push({ relationType: rel.type, direction: "in", peer: toSummary(peer) });
    }
  }
  return entries;
}

export async function getTaskBoard(projectId: string): Promise<TaskBoard> {
  await delay();
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const tasks = project.items.filter((i) => i.itemType === "TASK");
  const columns = TASK_STATUSES.map((status) => ({
    status,
    tasks: tasks
      .filter((t) => t.status === status)
      .map((t) => {
        // 阻塞派生（BR-010）：未完成 depends 上游 → 阻塞标记
        const blockedBy = project.relations
          .filter((r) => r.source === t.code && r.type === "depends")
          .map((r) => project.items.find((i) => i.code === r.target))
          .filter((up): up is NonNullable<typeof up> => {
            if (!up) return false;
            const status = up.status as TaskStatus;
            return TASK_STATUSES.includes(status) && isTaskActive({ status });
          })
          .map((up) => ({ code: up.code, title: up.title }));
        return { code: t.code, title: t.title, status, updatedAt: t.updatedAt, blockedBy };
      })
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));
  return { columns };
}

export async function searchItems(projectId: string, q: string): Promise<SearchHit[]> {
  await delay(250);
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits: SearchHit[] = [];
  for (const item of project.items) {
    if (item.code.toLowerCase() === needle || item.code.toLowerCase().startsWith(needle)) {
      hits.push({ item: toSummary(item), matchedIn: "code" });
      continue;
    }
    if (item.title.toLowerCase().includes(needle)) {
      hits.push({ item: toSummary(item), matchedIn: "title" });
      continue;
    }
    if (item.bodyMd.toLowerCase().includes(needle)) hits.push({ item: toSummary(item), matchedIn: "body" });
  }
  return hits.sort((a, b) => a.item.code.localeCompare(b.item.code));
}

export async function getImpact(projectId: string, code: string): Promise<ImpactResult> {
  await delay(250);
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const trigger = project.items.find((i) => i.code === code);
  if (!trigger) throw new Error("ITEM_NOT_FOUND");

  // 影响定位（FR-013/03 领域模型）：沿 derives/satisfies/depends 入边反向闭包
  // —— A derives/satisfies/depends B 时，B 变更则 A 受影响；depth 上限 3。
  const TRAVERSAL: Record<string, true> = { derives: true, satisfies: true, depends: true };
  const MAX_DEPTH = 3;
  const affected = new Map<string, { depth: number; via: string }>();
  let frontier = [code];
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const rel of project.relations) {
        if (rel.target !== current || !TRAVERSAL[rel.type]) continue;
        if (rel.source === code || affected.has(rel.source)) continue;
        affected.set(rel.source, { depth, via: rel.type });
        next.push(rel.source);
      }
    }
    frontier = next;
  }
  return {
    trigger: toSummary(trigger),
    entries: [...affected.entries()]
      .map(([entryCode, info]) => {
        const item = project.items.find((i) => i.code === entryCode);
        if (!item) return null;
        return { item: toSummary(item), depth: info.depth, via: info.via as ImpactResult["entries"][number]["via"] };
      })
      .filter((e): e is ImpactResult["entries"][number] => Boolean(e))
      .sort((a, b) => a.depth - b.depth || a.item.code.localeCompare(b.item.code)),
  };
}

export async function listRecentRevisions(projectId: string, limit = 10): Promise<RecentRevision[]> {
  await delay();
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project.revisions
    .slice()
    .sort((a, b) => b.changedAt - a.changedAt)
    .slice(0, limit)
    .map((r) => {
      const item = project.items.find((i) => i.code === r.code);
      return {
        code: r.code,
        title: item?.title ?? r.code,
        revisionNo: r.revisionNo,
        actor: r.actor,
        summary: r.summary,
        changedAt: r.changedAt,
      };
    });
}

export async function exportMarkdown(
  projectId: string,
  options: ExportOptions,
  onProgress?: (percent: number, phase: string) => void,
): Promise<ExportResult> {
  const project = findProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (!options.targetPath.trim()) throw new Error("EXPORT_PATH_EMPTY");

  const scoped =
    options.scope === "all"
      ? project.items
      : project.items.filter((i) => (options.scope as { types: ItemType[] }).types.includes(i.itemType));
  if (scoped.length === 0) throw new Error("EXPORT_SCOPE_EMPTY");
  // 演示"目标已存在即拒绝"（INT-006）：路径含 exists 字样即视为已存在
  if (options.targetPath.toLowerCase().includes("exists")) throw new Error("EXPORT_TARGET_EXISTS");

  const phases: [number, string][] = [
    [12, "reading"],
    [45, "rendering"],
    [78, "writing"],
    [100, "done"],
  ];
  for (const [percent, phase] of phases) {
    await delay(420);
    onProgress?.(percent, phase);
  }
  const suffix = options.form === "zip" ? ".zip" : "";
  return { path: `${options.targetPath.replace(/[\\/]+$/, "")}${suffix}`, fileCount: scoped.length };
}

export async function getSettings(): Promise<AppSettings> {
  await delay(60);
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    // 损坏的存储按默认值处理
  }
  return { ...defaultSettings };
}

export async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export async function appVersion(): Promise<string> {
  return "0.1.0 (mock)";
}
