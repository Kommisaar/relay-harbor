// invoke 唯一出口（ADR-006/007）：前端唯一允许触碰 @tauri-apps/api 的层。
// 命令与类型一律来自 tauri-specta 生成产物；这里按环境分派后再导出——
// 桌面走生成产物；纯浏览器开发（npm run dev，无 Tauri IPC）回落 mock 门面
//（AGENTS.md 前端约定）。mock 与生成产物的形态漂移在适配层消化，feature
// 层不感知：Result 包装、setSettings null 剥离、exportMarkdown 的 scope 折叠
// 与进度回调→事件桥接、appVersion 对象化。代价留痕：浏览器构建同时打包
// mock fixtures（量小，M1 接受）。
import { commands as tauriCommands, events as tauriEvents } from "./generated/bindings";
import type { ExportOptionsDto, ItemListFilterDto, SetSettingsPatchDto } from "./generated/bindings";
import * as mock from "./mock/commands";
import type { AppSettings, ExportOptions, ItemListFilter } from "./types";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const ok = <T>(data: T) => ({ status: "ok" as const, data });
const cast = <T>(v: unknown): T => v as T;

// mock 事件空源：data-changed 永不触发（浏览器无事件源）；export-progress
// 由导出适配器驱动——facade 经事件订阅消费进度，mock 导出以回调承载。
type ExportProgressMessage = { payload: { projectId: string; percent: number; phase: string } };
let exportProgressSink: ((e: ExportProgressMessage) => void) | null = null;

const mockCommands = {
  listProjects: () => mock.listProjects().then(ok),
  getProjectState: (projectId: string) => mock.getProjectState(projectId).then(ok),
  getProjectDoc: (projectId: string, key: Parameters<typeof mock.getProjectDoc>[1]) =>
    mock.getProjectDoc(projectId, key).then(ok),
  listProjectDocRevisions: (projectId: string, key: Parameters<typeof mock.listProjectDocRevisions>[1]) =>
    mock.listProjectDocRevisions(projectId, key).then(ok),
  listItems: (projectId: string, dto: ItemListFilterDto | null) =>
    mock.listItems(projectId, cast<ItemListFilter>(dto ?? {})).then(ok),
  getItemDetail: (projectId: string, code: string) => mock.getItemDetail(projectId, code).then(ok),
  getItemRevisions: (projectId: string, code: string) => mock.getItemRevisions(projectId, code).then(ok),
  getRelations: (projectId: string, code: string) => mock.getRelations(projectId, code).then(ok),
  getTaskBoard: (projectId: string) => mock.getTaskBoard(projectId).then(ok),
  searchItems: (projectId: string, q: string) => mock.searchItems(projectId, q).then(ok),
  getImpact: (projectId: string, code: string) => mock.getImpact(projectId, code).then(ok),
  listRecentRevisions: (projectId: string, limit: number) =>
    mock.listRecentRevisions(projectId, limit).then(ok),
  exportMarkdown: async (projectId: string, dto: ExportOptionsDto) => {
    const options: ExportOptions = {
      scope: dto.types ? { types: dto.types } : "all",
      form: cast<ExportOptions["form"]>(dto.form),
      targetPath: dto.targetPath,
    };
    return ok(
      await mock.exportMarkdown(projectId, options, (percent, phase) => {
        exportProgressSink?.({ payload: { projectId, percent, phase } });
      }),
    );
  },
  getSettings: () => mock.getSettings().then(ok),
  setSettings: async (dto: SetSettingsPatchDto) => {
    // null = 不变更（facade 约定），剥离后交 mock 合并
    const patch: Partial<AppSettings> = {};
    if (dto.theme != null) patch.theme = dto.theme;
    if (dto.language != null) patch.language = dto.language;
    if (dto.closeBehavior != null) patch.closeBehavior = dto.closeBehavior;
    if (dto.lastLocation != null) patch.lastLocation = dto.lastLocation;
    return ok(await mock.setSettings(patch));
  },
  appVersion: async () => ({ version: await mock.appVersion() }),
};

const mockEvents = {
  dataChangedEvent: {
    listen: async (): Promise<() => void> => () => {
      // 浏览器无事件源：注册即空，永不触发
    },
  },
  exportProgressEvent: {
    listen: async (handler: (e: ExportProgressMessage) => void): Promise<() => void> => {
      exportProgressSink = handler;
      return () => {
        exportProgressSink = null;
      };
    },
  },
};

export const commands = isTauri ? tauriCommands : mockCommands;
export const events = isTauri ? tauriEvents : mockEvents;
