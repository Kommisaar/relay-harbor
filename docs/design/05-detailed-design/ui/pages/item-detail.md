# 条目详情页

> 状态：待确认
> 路由：`/projects/:id/items/:code`
> 关联：UI-015～018、FR-009/010/013、BR-004、UC-011/012/015、CMP-001

## 布局（UI-015/016）

独立页，单栏滚动（容器内容宽 1080 左对齐，见 patterns.md
「页面容器与标题对齐」，2026-09-02 修订——原文「全宽」与实现不符），
区块顺序：

1. **头部**：面包屑（项目 / 类型组 / 返回列表）+ 编号（等宽大字）+
   标题 + 状态徽章 + 元数据摘要（结构化 metadata 键值对：优先级、
   备注等）+ 当前修订号与更新时间；已替代条目在头部显著标注替代者
   编号（superseded_by，可跳转）；
2. **正文**：Markdown 渲染（react-markdown，只读，无分栏编辑形态——
   CON-009）；
3. **关联区**（FR-010）：按关系类型分组（derives/depends/satisfies/
   traces/relates），每组分上下游（该条目指向的 / 指向该条目的），
   每项 = 编号 + 标题 + 方向，点击跳转目标详情；
4. **影响定位区**（UI-018）：受影响条目与任务按类型分组清单，逐项
   可跳转；遍历语义（derives/satisfies/depends 入边反向闭包）由
   `get_impact` 承载，UI 只呈现；
5. **修订历史区**（UI-017）：时间线 = 修订号 + 时间 + 操作者 + 摘要
   （含状态迁移记录）；当前版本高亮；**点选历史版本时正文区切换显示
   该版本完整快照**（content_snapshot，只读），头部出现「正在查看 rN
   （历史版本）」提示条与「回到当前」动作；无 diff 视图（M1 不引入
   diff 组件）。

```text
← 返回 · relay-harbor / FR 功能需求
FR-001  用户登录              [已确认]
优先级 P1 · r3 · 2 分钟前
────────────────────────────
## 需求描述（Markdown 渲染）
────────────────────────────
关联 (5)   derives←UC-004 · satisfies←TASK-007 …
影响定位 (3)   TASK-007 · DEC-002 …（分组清单，可跳转）
修订历史   ● r3 当前 · r2 agent-7 · r1 agent-7
```

## 数据

- `get_item_detail` → `["projects", id, "item", code]`；
- `get_item_revisions` → `["projects", id, "item", code, "revisions"]`
  （历史版本内容经 include revisions 或详情载荷，见 api-contracts）；
- `get_relations` → `["projects", id, "item", code, "relations"]`；
- `get_impact` → `["projects", id, "impact", code]`。

## 交互

- 全部只读；跳转均为路由导航（可后退）；
- 版本切换不改变 URL（查看态），刷新回到当前版本。

## 状态与边界

- 编号不存在：错误态「条目不存在」（可能已被项目删除）；
- 无关联/无影响：区块显示「无」而非隐藏（结构稳定）；
- 仅 1 条修订：时间线正常呈现 r1 当前。

## 测试要点

历史版本快照与 content_snapshot 一致（BR-004 只读）；关联上下游方向
正确；影响清单与 get_impact 一致；superseded 条目的替代者跳转。
