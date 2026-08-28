// 搜索页查询（FR-012/UC-014）：回车提交后查询，空关键词不触发。
import { useQuery } from "@tanstack/react-query";
import { searchItems } from "../../api/commands";

export function useSearchQuery(projectId: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["projects", projectId, "search", q],
    queryFn: () => searchItems(projectId, q),
    enabled,
  });
}
