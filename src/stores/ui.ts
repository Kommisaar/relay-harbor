// UI 状态（Zustand，仅 UI 态——服务端状态只归 TanStack Query，ADR-007）。
// 当前项目 id、视图模式、侧栏开合（modules/frontend.md「状态与数据」）；
// 2026-08-28 界面设计：项目列表形态（UI-010）与条目分组折叠态（UI-012）。
import { create } from "zustand";

/** 项目列表页形态（UI-010：列表行/卡片可切换） */
export type ProjectViewMode = "rows" | "cards";

interface UiState {
  currentProjectId: string | null;
  sidebarOpen: boolean;
  projectViewMode: ProjectViewMode;
  /** 手风琴折叠组，键 `${projectId}:${itemType}`（UI-012，默认全展开） */
  collapsedGroups: string[];
  setCurrentProject: (projectId: string | null) => void;
  toggleSidebar: () => void;
  setProjectViewMode: (mode: ProjectViewMode) => void;
  toggleGroup: (projectId: string, itemType: string) => void;
  isGroupCollapsed: (projectId: string, itemType: string) => boolean;
}

export const useUiStore = create<UiState>((set, get) => ({
  currentProjectId: null,
  sidebarOpen: true,
  projectViewMode: "rows",
  collapsedGroups: [],
  setCurrentProject: (projectId) => set({ currentProjectId: projectId }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setProjectViewMode: (projectViewMode) => set({ projectViewMode }),
  toggleGroup: (projectId, itemType) =>
    set((s) => {
      const key = `${projectId}:${itemType}`;
      return {
        collapsedGroups: s.collapsedGroups.includes(key)
          ? s.collapsedGroups.filter((k) => k !== key)
          : [...s.collapsedGroups, key],
      };
    }),
  isGroupCollapsed: (projectId, itemType) => get().collapsedGroups.includes(`${projectId}:${itemType}`),
}));
