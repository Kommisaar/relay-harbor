// UI 状态（Zustand，仅 UI 态——服务端状态只归 TanStack Query，ADR-007）。
// 当前项目 id、视图模式、侧栏开合（modules/frontend.md「状态与数据」）。
import { create } from "zustand";

export type ViewMode = "list" | "grouped";

interface UiState {
  currentProjectId: string | null;
  sidebarOpen: boolean;
  viewMode: ViewMode;
  setCurrentProject: (projectId: string | null) => void;
  toggleSidebar: () => void;
  setViewMode: (mode: ViewMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentProjectId: null,
  sidebarOpen: true,
  viewMode: "grouped",
  setCurrentProject: (projectId) => set({ currentProjectId: projectId }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setViewMode: (viewMode) => set({ viewMode }),
}));
