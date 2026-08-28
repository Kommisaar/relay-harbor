// 应用外壳（UI-001）：活动栏 + 第二层侧栏 + 内容区。
// 承担 last_location 持久化（UI-005/FR-017）与当前项目 id 的 Zustand 同步。
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { makeStyles, tokens } from "@fluentui/react-components";
import { setSettings } from "../../api/commands";
import { useUiStore } from "../../stores/ui";
import { ActivityBar } from "./ActivityBar";
import { Sidebar } from "./Sidebar";

const useStyles = makeStyles({
  root: { display: "flex", height: "100vh", overflow: "hidden" },
  content: {
    flex: 1,
    minWidth: 0,
    overflowY: "auto",
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

/** 从路径取当前项目 id：/projects/:projectId/… */
function projectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/projects\/([^/]+)/);
  return m?.[1] ?? null;
}

export function AppShell() {
  const styles = useStyles();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setCurrentProject = useUiStore((s) => s.setCurrentProject);

  const projectId = projectIdFromPath(pathname);
  const isSettings = pathname.startsWith("/settings");
  // 设置页无二级导航（UI-002）；侧栏开合对其余页面生效
  const showSidebar = !isSettings && sidebarOpen;

  useEffect(() => {
    setCurrentProject(projectId);
  }, [projectId, setCurrentProject]);

  useEffect(() => {
    if (pathname === "/") return;
    // 路由变化即维护 last_location（FR-017，settings.json 语义 → mock localStorage）
    void setSettings({ lastLocation: pathname }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    });
  }, [pathname, queryClient]);

  return (
    <div className={styles.root}>
      <ActivityBar />
      {showSidebar ? <Sidebar projectId={projectId} /> : null}
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
