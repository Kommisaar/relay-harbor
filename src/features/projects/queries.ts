// 查询：项目列表（FR-008/UC-010）。key 为项目级根 ["projects"]（ADR-006 约定）。
import { useQuery } from "@tanstack/react-query";
import { getProjectState, listProjects } from "../../api/commands";

export function useProjectsQuery() {
  return useQuery({ queryKey: ["projects"], queryFn: listProjects });
}

// 卡片统计（2026-08-28 增补，project-list.md）：get_project_state 与概览页共用同一
// query key（缓存天然共享）。与 features/overview/queries.ts 的同名 hook 重复定义
// 属刻意的目录边界合规——feature 之间禁止互相引用。
export function useProjectStateQuery(projectId: string) {
  return useQuery({ queryKey: ["projects", projectId, "state"], queryFn: () => getProjectState(projectId) });
}
