// 路由集中式（modules/frontend.md 2026-09-01 修订；2026-09-02 拆分修订）：
// /projects、/projects/:projectId/（index=项目概览 UI-035；stats=项目统计
// （原概览页更名，2026-09-02 用户指令）、items→重定向首个类型、
// items/type/:type（2026-09-01 用户指令：条目按 14 类型拆独立子页面，
// 聚合页取消）、items/:code、tasks）、/settings。impact 为条目详情
// 内嵌区（UI-018），不独立路由；导出无路由（2026-08-28 用户指令：
// 项目列表卡片 Popover，ui/pages/export.md）；搜索无路由（2026-08-28
// 用户指令暂缓：ui/pages/search.md），旧路由均经通配回落 /projects。
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { Boot } from "./Boot";
import { ItemDetailPage, ItemsIndexRedirect, ItemsTypePage } from "../features/design";
import { OverviewPage } from "../features/overview";
import { ProjectsPage } from "../features/projects";
import { SettingsPage } from "../features/settings";
import { StatsPage } from "../features/stats";
import { TasksPage } from "../features/tasks";

export const router = createBrowserRouter([
  { path: "/", element: <Boot /> },
  {
    element: <AppShell />,
    children: [
      { path: "projects", element: <ProjectsPage /> },
      {
        path: "projects/:projectId",
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "stats", element: <StatsPage /> },
          { path: "items", element: <ItemsIndexRedirect /> },
          { path: "items/type/:type", element: <ItemsTypePage /> },
          { path: "items/:code", element: <ItemDetailPage /> },
          { path: "tasks", element: <TasksPage /> },
        ],
      },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/projects" replace /> },
    ],
  },
]);
