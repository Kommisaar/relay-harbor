// 命令门面：feature 层取数的唯一入口（INT-001 白名单 16 命令）。
// 2026-09-05 联调切换：mock → tauri-specta 产物（src/api/client.ts 再导出），
// feature 层签名不变（错误仍以 Error.message 短码抛出，UI i18n 映射不变）。
// generated DTO 与 src/api/types.ts 的字面量差异在此 cast 桥接（status 等
// String 承载位、ExportOptions scope 折叠为 types、setSettings 补丁合并）。
import { commands, events } from "./client";
import type {
  AppSettings,
  ExportOptions,
  ExportResult,
  ImpactResult,
  ItemDetail,
  ItemListFilter,
  ItemSummary,
  ItemType,
  ProjectDoc,
  ProjectDocKey,
  ProjectDocRevision,
  ProjectState,
  ProjectSummary,
  RecentRevision,
  RelationEntry,
  Revision,
  SearchHit,
  TaskBoard,
} from "./types";
import type {
  ExportOptionsDto,
  ItemListFilterDto,
  SetSettingsPatchDto,
} from "./generated/bindings";

/** generated Result 判别联合 → mock 同款 throw Error(短码) */
async function unwrap<T>(
  call: Promise<{ status: "ok"; data: T } | { status: "error"; error: string }>,
): Promise<T> {
  const res = await call;
  if (res.status === "error") throw new Error(res.error);
  return res.data;
}

const cast = <T>(v: unknown): T => v as T;

export async function listProjects(): Promise<ProjectSummary[]> {
  return unwrap(commands.listProjects()).then(cast<ProjectSummary[]>);
}

export async function getProjectState(projectId: string): Promise<ProjectState> {
  return unwrap(commands.getProjectState(projectId)).then(cast<ProjectState>);
}

export async function getProjectDoc(projectId: string, key: ProjectDocKey): Promise<ProjectDoc> {
  return unwrap(commands.getProjectDoc(projectId, key)).then(cast<ProjectDoc>);
}

export async function listProjectDocRevisions(
  projectId: string,
  key: ProjectDocKey,
): Promise<ProjectDocRevision[]> {
  return unwrap(commands.listProjectDocRevisions(projectId, key)).then(
    cast<ProjectDocRevision[]>,
  );
}

export async function listItems(
  projectId: string,
  filter: ItemListFilter = {},
): Promise<ItemSummary[]> {
  const dto = cast<ItemListFilterDto | null>(
    filter && Object.keys(filter).length > 0 ? filter : null,
  );
  return unwrap(commands.listItems(projectId, dto)).then(cast<ItemSummary[]>);
}

export async function getItemDetail(projectId: string, code: string): Promise<ItemDetail> {
  return unwrap(commands.getItemDetail(projectId, code)).then(cast<ItemDetail>);
}

export async function getItemRevisions(projectId: string, code: string): Promise<Revision[]> {
  return unwrap(commands.getItemRevisions(projectId, code)).then(cast<Revision[]>);
}

export async function getRelations(projectId: string, code: string): Promise<RelationEntry[]> {
  return unwrap(commands.getRelations(projectId, code)).then(cast<RelationEntry[]>);
}

export async function getTaskBoard(projectId: string): Promise<TaskBoard> {
  return unwrap(commands.getTaskBoard(projectId)).then(cast<TaskBoard>);
}

export async function searchItems(projectId: string, q: string): Promise<SearchHit[]> {
  return unwrap(commands.searchItems(projectId, q)).then(cast<SearchHit[]>);
}

export async function getImpact(projectId: string, code: string): Promise<ImpactResult> {
  return unwrap(commands.getImpact(projectId, code)).then(cast<ImpactResult>);
}

export async function listRecentRevisions(
  projectId: string,
  limit = 10,
): Promise<RecentRevision[]> {
  return unwrap(commands.listRecentRevisions(projectId, limit)).then(cast<RecentRevision[]>);
}

/** 导出：同步命令 + export-progress-event 订阅转 onProgress 回调（mock 签名保持） */
export async function exportMarkdown(
  projectId: string,
  options: ExportOptions,
  onProgress?: (percent: number, phase: string) => void,
): Promise<ExportResult> {
  const unlisten = onProgress
    ? await events.exportProgressEvent.listen((e) => {
        if (e.payload.projectId === projectId) onProgress(e.payload.percent, e.payload.phase);
      })
    : null;
  try {
    const dto: ExportOptionsDto = {
      types: options.scope === "all" ? null : (options.scope as { types: ItemType[] }).types,
      form: options.form,
      targetPath: options.targetPath,
    };
    return await unwrap(commands.exportMarkdown(projectId, dto)).then(cast<ExportResult>);
  } finally {
    unlisten?.();
  }
}

export async function getSettings(): Promise<AppSettings> {
  return unwrap(commands.getSettings()).then(cast<AppSettings>);
}

export async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const dto: SetSettingsPatchDto = {
    theme: patch.theme ?? null,
    language: patch.language ?? null,
    closeBehavior: patch.closeBehavior ?? null,
    // null = 不变更（lastLocation 仅由应用导航写入，无清除场景）
    lastLocation: patch.lastLocation ?? null,
  };
  return unwrap(commands.setSettings(dto)).then(cast<AppSettings>);
}

export async function appVersion(): Promise<string> {
  const res = await commands.appVersion();
  return res.version;
}
