// 冷启动落点（UI-005/FR-017）：恢复 last_location；无记录或其项目已删除时回 /projects。
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSettings, listProjects } from "../api/commands";

export function Boot() {
  const navigate = useNavigate();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  useEffect(() => {
    // 项目清单未就绪不判定「项目已删除」：settings 先于 projects 返回时，
    // 过早校验会把合法项目地址误降级为 /projects，且跳转后本组件卸载无法纠正。
    if (!settings || !projects) return;
    let target = settings.lastLocation ?? "/projects";
    const m = target.match(/^\/projects\/([^/]+)/);
    if (m && !projects.some((p) => p.id === m[1])) target = "/projects";
    navigate(target, { replace: true });
  }, [settings, projects, navigate]);

  return null;
}
