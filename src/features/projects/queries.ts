// 查询：项目列表（FR-008/UC-010）。key 为项目级根 ["projects"]（ADR-006 约定）。
import { useQuery } from "@tanstack/react-query";
import { listProjects } from "../../api/commands";

export function useProjectsQuery() {
  return useQuery({ queryKey: ["projects"], queryFn: listProjects });
}
