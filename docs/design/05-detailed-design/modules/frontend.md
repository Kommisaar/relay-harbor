# 前端应用（WebView）

> 状态：草稿
> 组件：CMP-001
> 承载：UC-010～018、NFR-002/008、ADR-006/007

## 责任

- 只读视图：项目列表与切换、条目列表（类型分组）与详情（Markdown 渲染、
  修订历史）、关联展开、任务看板（只读 + 阻塞标记 + 过滤）、搜索、
  影响定位清单、导出触发与进度、设置；
- 数据获取：全部经 `api/`（invoke 唯一出口），TanStack Query 管理；
- 事件消费：全局监听 data-changed，按项目前缀失效查询。

## 不负责

任何业务写操作（CON-009）；MCP 协议；令牌（前端零令牌知识）。

## 公开接口

消费 INT-001（命令白名单与事件 payload 见 api-contracts.md）。

## 内部协作者

features 划分（M1，取代《project structure.md》原稿的 M2 导向划分）：
`projects`（列表/切换）、`design`（条目浏览/详情/修订/关联/影响）、
`tasks`（只读看板）、`search`、`export`、`settings`；每 feature 固定
五件套（components/hooks/queries/types/index）。

## 关键规则

- **query key 全局约定**：一律以 `["projects", projectId, ...]` 开头
  （事件失效机制的前提，ADR-006）；项目列表类用 `["projects"]`；
- `invoke` 只出现在 `api/`；类型只用 `api/generated`；服务端状态只存
  Query 缓存，Zustand 仅 UI 态（当前项目 id、视图模式、侧栏开合）；
- 依赖白名单：Fluent v9、TanStack Query、Zustand、react-markdown（渲染）
  ——**无编辑器、无 dnd**（只读定位，ADR-007）；@xyflow 待 M2；
- 路由集中式（`app/router.tsx`）：`/projects`、`/projects/:id/*`
  （items/tasks/search/impact）、`/settings`。

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
