# 界面设计（UI）

> 状态：待确认
> 关联：FR-008～018、UC-010～018、CMP-001、INT-001、ADR-006/007
> 来源：2026-08-28 界面设计访谈（六轮，结论逐条编号 UI-xxx）

## 目的

定义前端应用（CMP-001）的界面结构与每个页面的布局、数据来源和交互，
使实现阶段可直接消费；不负责组件树内部实现与视觉细节（样式、间距、
图标选型留给实现）。

## 设计决策总表

| 编号 | 决策 | 详见 |
| --- | --- | --- |
| UI-001 | 双层侧栏骨架：第一层活动栏（项目工作台/设置），第二层（全局位 + 项目清单 + 子导航） | app-shell |
| UI-002 | 第二层导航（2026-08-28 用户指令重构）：顶部「总览/导出」全局位 + 项目清单（取代下拉切换器）；选中项目就地展开概览/条目/任务/搜索/导出 | app-shell |
| UI-003 | 主题三态：跟随系统（默认）/浅色/深色，即时生效并持久化 | app-shell |
| UI-004 | 界面语言三态：跟随系统（默认）/中文/英文（双语资源） | app-shell |
| UI-005 | 冷启动恢复上次浏览位置（项目 + 路由持久化于应用设置） | app-shell |
| UI-006 | 系统原生标题栏（Tauri 默认，不自绘） | app-shell |
| UI-007 | 窗口默认 1280×800、最小 1024×640、可自由缩放；常规密度（假设） | app-shell |
| UI-010 | 项目列表页由第二层导航「项目」承载，列表行/卡片双形态可切换 | pages/project-list |
| UI-011 | 项目概览页为进入项目默认落地页：状态统计/类型分布/最近修订/阻塞提醒 | pages/project-overview |
| UI-012 | 条目浏览按 13 类型手风琴分组（组头=类型名+计数+折叠） | pages/items |
| UI-013 | 条目标准行：编号+标题+状态徽章+修订号+最后更新时间 | pages/items |
| UI-014 | 条目页内过滤工具条：状态过滤+关键词+排序（编号/更新时间） | pages/items |
| UI-015 | 条目详情独立全宽页（/items/:code），面包屑返回 | pages/item-detail |
| UI-016 | 详情单栏滚动：头部→正文→关联→影响→修订 | pages/item-detail |
| UI-017 | 修订时间线+版本切换（正文区切换显示选中版本快照，无 diff） | pages/item-detail |
| UI-018 | 影响定位为详情内嵌清单（按类型分组，逐项可跳转） | pages/item-detail |
| UI-019 | 任务看板五列横排（待办/进行中/待验收/完成/已取消），横向滚动 | pages/tasks |
| UI-020 | 任务卡片基础款：编号+标题+阻塞标记（来源编号可跳转） | pages/tasks |
| UI-021 | 看板全局单过滤框（FR-011「列内过滤」的实用化解读，见注记） | pages/tasks |
| UI-022 | 搜索仅独立页（页内输入+回车查询，结果手风琴分组） | pages/search |
| UI-023 | 导出表单式单页：范围+形式（目录/zip）+路径+异步进度+结果条 | pages/export |
| UI-024 | 设置单页分组卡片：外观（主题/语言）+ 行为（关闭行为） | pages/settings |
| UI-033 | 全部项目导出页（/export）：形式+路径+进度+结果条，无范围选择（2026-08-28 用户指令新增） | pages/export |
| UI-030 | 状态徽章语义色映射（条目 5 态 + 任务 5 态） | patterns |
| UI-031 | 引导式空态：图标+一句话+指引（如「项目由 Agent 经 MCP 创建」） | patterns |
| UI-032 | 加载态：列表/卡片骨架屏，局部动作用 spinner | patterns |

## 页面与路由映射

路由为 [modules/frontend.md](../modules/frontend.md) 的修订版（2026-08-28）：

| 路由 | 页面 | 第二层导航态 | 承载 |
| --- | --- | --- | --- |
| `/projects` | 项目列表（总览） | 总览（全局位） | FR-008、UC-010 |
| `/export` | 全部项目导出 | 导出（全局位） | FR-014/UC-016 引申（UI-033） |
| `/projects/:id/` | 项目概览（index） | 项目清单展开 · 概览 | FR-018、UC-010 |
| `/projects/:id/items` | 条目浏览 | 项目清单展开 · 条目 | FR-009、UC-011 |
| `/projects/:id/items/:code` | 条目详情 | 项目清单展开 · 条目（激活） | FR-009/010/013、UC-011/012/015 |
| `/projects/:id/tasks` | 任务看板 | 项目清单展开 · 任务 | FR-011、UC-013 |
| `/projects/:id/search` | 搜索 | 项目清单展开 · 搜索 | FR-012、UC-014 |
| `/projects/:id/export` | 导出 | 项目清单展开 · 导出 | FR-014、UC-016 |
| `/settings` | 设置 | 第一层「设置」 | FR-016/017、UC-018 |

## 骨架示意

```text
┌──┬────────────────┬──────────────────────────
│◧ │ 总览            │  内容区（当前路由页面）
│⚙ │ 导出            │
│  │────────────────│
│  │ 项目            │
│  │  relay-harbor   │
│  │    ● 概览       │
│  │    ○ 条目       │
│  │    ○ 任务       │
│  │    ○ 搜索       │
│  │    ○ 导出       │
│  │  zhsppy         │
└──┴────────────────┴──────────────────────────
 ↑第一层          ↑第二层
 (项目/设置)      (全局位 + 项目清单 + 子导航)
```

详见 [app-shell.md](app-shell.md)。

## 促成的设计修订（2026-08-28，按修订循环同步）

- FR-016 增加「界面语言」设置项（UI-004）；
- 新增 FR-017 恢复上次浏览位置（UI-005）、FR-018 项目概览视图（UI-011）；
- UC-018 目标补「界面语言」；
- INT-001 命令白名单新增 `list_recent_revisions`（13 → 14，概览页最近修订支撑）；
- modules/frontend.md 路由与 features 划分修订（概览页、条目详情子路由、
  overview feature）；
- 第二层侧栏重构 + 新增 `/export` 全部项目导出（UI-033，2026-08-28
  用户指令）：下拉切换器由项目清单就地取代；导出仍走 INT-006 既有
  命令（前端循环调用），命令白名单不变。

## 全局约束（继承，不因 UI 设计改变）

- UI 零业务写命令（CON-009、ADR-006）：全部页面只读，设置读写是唯一
  持久化写操作；
- 数据获取全部经 `api/` invoke，query key 以 `["projects", projectId, ...]`
  开头，事件失效 + refetchOnWindowFocus 兜底；
- 无编辑器、无 dnd 依赖（ADR-007）。

## 子文档

- [app-shell.md](app-shell.md)：骨架、导航、启动、主题与语言、窗口
- [patterns.md](patterns.md)：徽章、空态、加载、错误、刷新
- pages/：[project-list](pages/project-list.md) ｜
  [project-overview](pages/project-overview.md) ｜ [items](pages/items.md) ｜
  [item-detail](pages/item-detail.md) ｜ [tasks](pages/tasks.md) ｜
  [search](pages/search.md) ｜ [export](pages/export.md) ｜
  [settings](pages/settings.md)

## 开放问题

无。视觉细节（图标、间距、组件选型）留给实现，不构成设计问题。
