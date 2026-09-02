// 查询：项目统计页（原概览页，2026-09-02 更名）取数：项目概况、最近修订。
// key 均以 ["projects", projectId, ...] 开头（ADR-006 失效前提）。
import { useQuery } from "@tanstack/react-query";
import { getProjectState, listRecentRevisions } from "../../api/commands";

export function useProjectStateQuery(projectId: string) {
  return useQuery({ queryKey: ["projects", projectId, "state"], queryFn: () => getProjectState(projectId) });
}

export function useRecentRevisionsQuery(projectId: string, limit = 10) {
  return useQuery({
    queryKey: ["projects", projectId, "revisions-recent", limit],
    queryFn: () => listRecentRevisions(projectId, limit),
  });
}
