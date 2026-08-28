// 查询：条目浏览（FR-009）、详情、修订、关联（FR-010）、影响定位（FR-013）。
// key 均以 ["projects", projectId, ...] 开头（ADR-006 失效前提）。
import { useQuery } from "@tanstack/react-query";
import { getImpact, getItemDetail, getItemRevisions, getRelations, listItems } from "../../api/commands";
import type { ItemListFilter } from "../../api/types";

export function useItemsQuery(projectId: string, filter: ItemListFilter) {
  return useQuery({
    queryKey: ["projects", projectId, "items", filter],
    queryFn: () => listItems(projectId, filter),
  });
}

export function useItemDetailQuery(projectId: string, code: string) {
  return useQuery({
    queryKey: ["projects", projectId, "item", code],
    queryFn: () => getItemDetail(projectId, code),
  });
}

export function useItemRevisionsQuery(projectId: string, code: string) {
  return useQuery({
    queryKey: ["projects", projectId, "item", code, "revisions"],
    queryFn: () => getItemRevisions(projectId, code),
  });
}

export function useRelationsQuery(projectId: string, code: string) {
  return useQuery({
    queryKey: ["projects", projectId, "item", code, "relations"],
    queryFn: () => getRelations(projectId, code),
  });
}

export function useImpactQuery(projectId: string, code: string) {
  return useQuery({
    queryKey: ["projects", projectId, "impact", code],
    queryFn: () => getImpact(projectId, code),
  });
}
