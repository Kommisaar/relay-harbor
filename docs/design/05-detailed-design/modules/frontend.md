# 前端应用（WebView）

> 状态：草稿（2026-08-28 界面设计修订：路由/features/概览页/语言/last_location）
> 组件：CMP-001
> 承载：UC-010～018、NFR-002/008、ADR-006/007
> 界面级设计：[../ui/](../ui/README.md)（UI-001～032）

## 责任

- 只读视图：项目列表与切换、项目概览（统计/类型分布/最近修订/阻塞，
  2026-08-28 新增）、条目列表（类型分组）与详情（Markdown 渲染、
  修订历史）、关联展开、任务看板（只读 + 阻塞标记 + 过滤）、
  影响定位清单、导出触发与进度、设置（搜索页 2026-08-28 暂缓移除，
  能力与契约保留）；
- 数据获取：全部经 `api/`（invoke 唯一出口），TanStack Query 管理；
- 事件消费：全局监听 data-changed，按项目前缀失效查询。

## 不负责

任何业务写操作（CON-009）；MCP 协议；令牌（前端零令牌知识）。

## 公开接口

消费 INT-001（命令白名单与事件 payload 见 api-contracts.md）。

## 内部协作者

features 划分（M1，2026-08-28 界面设计修订）：
`projects`（列表/切换）、`overview`（项目概览统计）、
`design`（条目浏览/详情/修订/关联/影响）、`tasks`（只读看板）、
`settings`（`search` feature 2026-08-28 用户指令随搜索页暂缓移除，
规格保留 ui/pages/search.md）；每 feature 固定五件套
（components/hooks/queries/types/index）。
导出弹层为共享组件 `components/ExportPopover`（2026-08-28 用户指令，
原 `export` feature 随导出页面移除；项目列表卡片消费，见
ui/pages/export.md）。

## 关键规则

- **query key 全局约定**：一律以 `["projects", projectId, ...]` 开头
  （事件失效机制的前提，ADR-006）；项目列表类用 `["projects"]`；
- `invoke` 只出现在 `api/`；类型只用 `api/generated`；服务端状态只存
  Query 缓存，Zustand 仅 UI 态（当前项目 id、视图模式、第一层活动栏
  展开态；条目分组展开态随 2026-09-01 聚合页取消而移除）；
- 主题与语言由 `app/providers/` 统一解析（跟随系统默认，可覆盖，
  UI-003/004），组件树只消费；
- `last_location`（当前项目 + 路由）由路由层经 set_settings 维护，
  支撑冷启动恢复（UI-005、FR-017）；
- 依赖白名单：Fluent v9、TanStack Query、Zustand、react-markdown（渲染）、
  i18next + react-i18next（双语，2026-08-28 UI 实现期准入，FR-016/UI-004）
  ——**无编辑器、无 dnd**（只读定位，ADR-007）；@xyflow 待 M2；
- 路由集中式（`app/router.tsx`，2026-09-01 修订）：`/projects`、
  `/projects/:id/`（index=概览；`items`（重定向首个类型页）、
  `items/type/:type`、`items/:code`、`tasks`）、`/settings`；
  条目按 13 类型拆独立子页面、聚合页取消（2026-09-01 用户指令）；
  impact 为详情内嵌区（UI-018），不独立路由；导出无路由（项目列表
  卡片 Popover，2026-08-28 用户指令）；搜索无路由（2026-08-28 用户
  指令暂缓，旧地址通配回落 `/projects`）。

## 状态与数据

无持久业务数据；设置经 get/set_settings 命令（后端 settings.json）。

## 错误处理

查询失败统一错误态组件 + 重试；事件丢失靠 refetchOnWindowFocus 兜底。

## 并发与一致性

只读无冲突；缓存失效即最终一致（秒级）。

## 可观测性

前端错误上报至后端日志（console 桥接，NFR-007）。

## 测试要点

- 组件测试 colocate；事件失效链路（emit → invalidate → refetch）
  的集成测试；白名单 lint（无业务 mutation 调用）。

## 开放问题

无。
