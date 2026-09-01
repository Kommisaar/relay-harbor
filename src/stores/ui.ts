// UI 状态（Zustand，仅 UI 态——服务端状态只归 TanStack Query，ADR-007）。
// 当前项目 id、视图模式、第一层活动栏展开态（modules/frontend.md
// 「状态与数据」）；2026-08-28 界面设计：项目列表形态（UI-010）；
// 2026-08-29 用户指令确认：双层导航恢复——第一层活动栏双态
// （railExpanded，默认收起=纯图标）；第二层项目导航栏常驻
// （2026-08-29 用户指令：不做可收起功能）。条目分组折叠态（原 UI-012
// 手风琴）随 2026-09-01 用户指令聚合页取消而移除。
import { create } from "zustand";

/** 项目列表页形态（UI-010：列表行/卡片可切换） */
export type ProjectViewMode = "rows" | "cards";

interface UiState {
  currentProjectId: string | null;
  /** 第一层活动栏展开态（UI-001，默认收起=纯图标+tooltip） */
  railExpanded: boolean;
  projectViewMode: ProjectViewMode;
  setCurrentProject: (projectId: string | null) => void;
  toggleRailExpanded: () => void;
  setProjectViewMode: (mode: ProjectViewMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentProjectId: null,
  railExpanded: false,
  projectViewMode: "rows",
  setCurrentProject: (projectId) => set({ currentProjectId: projectId }),
  toggleRailExpanded: () => set((s) => ({ railExpanded: !s.railExpanded })),
  setProjectViewMode: (projectViewMode) => set({ projectViewMode }),
}));
