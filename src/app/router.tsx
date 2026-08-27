// 路由集中式（modules/frontend.md）：/projects、/projects/:projectId/*、/settings。
// impact 属 design feature 的子视图（UC-015），不独立成顶层路由。
import { createBrowserRouter, Navigate } from "react-router-dom";
import { DesignPage } from "../features/design";
import { ExportPanelPlaceholder } from "../features/export";
import { ProjectsPage } from "../features/projects";
import { SearchPage } from "../features/search";
import { SettingsPage } from "../features/settings";
import { TasksPage } from "../features/tasks";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/projects" replace /> },
  { path: "/projects", element: <ProjectsPage /> },
  {
    path: "/projects/:projectId",
    children: [
      { index: true, element: <DesignPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "export", element: <ExportPanelPlaceholder /> },
    ],
  },
  { path: "/settings", element: <SettingsPage /> },
]);
