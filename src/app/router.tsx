// 路由集中式（modules/frontend.md 2026-08-28 修订）：/projects、/export（全部
// 项目导出，UI-033）、/projects/:projectId/（index=概览；items、items/:code、
// tasks、search、export）、/settings。impact 为条目详情内嵌区（UI-018），不独立路由。
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { Boot } from "./Boot";
import { DesignPage, ItemDetailPage } from "../features/design";
import { ExportPage, GlobalExportPage } from "../features/export";
import { OverviewPage } from "../features/overview";
import { ProjectsPage } from "../features/projects";
import { SearchPage } from "../features/search";
import { SettingsPage } from "../features/settings";
import { TasksPage } from "../features/tasks";

export const router = createBrowserRouter([
  { path: "/", element: <Boot /> },
  {
    element: <AppShell />,
    children: [
      { path: "projects", element: <ProjectsPage /> },
      { path: "export", element: <GlobalExportPage /> },
      {
        path: "projects/:projectId",
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "items", element: <DesignPage /> },
          { path: "items/:code", element: <ItemDetailPage /> },
          { path: "tasks", element: <TasksPage /> },
          { path: "search", element: <SearchPage /> },
          { path: "export", element: <ExportPage /> },
        ],
      },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/projects" replace /> },
    ],
  },
]);
