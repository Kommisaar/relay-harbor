// 查询：任务看板（FR-011/UC-013，与概览页阻塞提醒同源）。
import { useQuery } from "@tanstack/react-query";
import { getTaskBoard } from "../../api/commands";

export function useTaskBoardQuery(projectId: string) {
  return useQuery({ queryKey: ["projects", projectId, "task-board"], queryFn: () => getTaskBoard(projectId) });
}
