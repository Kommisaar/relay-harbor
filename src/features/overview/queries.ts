// 查询：项目概览文档 + 修订历史（get_project_overview /
// list_project_overview_revisions，UI-035）。
// key 以 ["projects", projectId, ...] 开头（ADR-006 失效前提）。
import { useQuery } from "@tanstack/react-query";
import { getProjectOverview, listProjectOverviewRevisions } from "../../api/commands";

export function useProjectOverviewQuery(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "overview"],
    queryFn: () => getProjectOverview(projectId),
  });
}

export function useProjectOverviewRevisionsQuery(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "overview-revisions"],
    queryFn: () => listProjectOverviewRevisions(projectId),
  });
}
