// 查询：项目概况、最近修订、看板（阻塞提醒与看板同源，UI-011）。
// key 均以 ["projects", projectId, ...] 开头（ADR-006 失效前提）。
import { useQuery } from "@tanstack/react-query";
import { getProjectState, getTaskBoard, listRecentRevisions } from "../../api/commands";

export function useProjectStateQuery(projectId: string) {
  return useQuery({ queryKey: ["projects", projectId, "state"], queryFn: () => getProjectState(projectId) });
}

export function useRecentRevisionsQuery(projectId: string, limit = 10) {
  return useQuery({
    queryKey: ["projects", projectId, "revisions-recent", limit],
    queryFn: () => listRecentRevisions(projectId, limit),
  });
}

export function useTaskBoardQuery(projectId: string) {
  return useQuery({ queryKey: ["projects", projectId, "task-board"], queryFn: () => getTaskBoard(projectId) });
}
