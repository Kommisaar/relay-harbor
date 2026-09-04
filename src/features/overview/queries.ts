// 查询：项目级文档 + 修订历史（get_project_doc(key) /
// list_project_doc_revisions(key)，DOM-009；UI-035 概览为 key=overview
// 实例，docs/:key 直达其余三 key——2026-09-04 同日用户指令补入口）。
// key 以 ["projects", projectId, ...] 开头（ADR-006 失效前提）。
import { useQuery } from "@tanstack/react-query";
import type { ProjectDocKey } from "../../api/types";
import { getProjectDoc, listProjectDocRevisions } from "../../api/commands";

export function useProjectDocQuery(projectId: string, docKey: ProjectDocKey) {
  return useQuery({
    queryKey: ["projects", projectId, "doc", docKey],
    queryFn: () => getProjectDoc(projectId, docKey),
  });
}

export function useProjectDocRevisionsQuery(projectId: string, docKey: ProjectDocKey) {
  return useQuery({
    queryKey: ["projects", projectId, "doc-revisions", docKey],
    queryFn: () => listProjectDocRevisions(projectId, docKey),
  });
}
