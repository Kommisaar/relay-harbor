// 解析后的明暗主题（UI-003：设置档位 + 系统跟随监听）。
// 放 components/ 而非 app/：feature 层的非 Fluent 渲染（AntV 图表）需要跟随主题，
// 而 dep-cruiser 禁止 features → app 反向引用。
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSettings } from "../api/commands";

export type ResolvedTheme = "light" | "dark";

export function useResolvedTheme(): ResolvedTheme {
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  return settings && (settings.theme === "dark" || (settings.theme === "system" && systemDark))
    ? "dark"
    : "light";
}
