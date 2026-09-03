# 项目概览页

> 状态：待确认
> 路由：`/projects/:id/`（index，进入项目默认落地页）
> 关联：UI-035、FR-008、UC-010、CMP-001
> 沿革：2026-09-02 用户指令新增，同日两改——初版为结构化五卡
> （get_project_overview 返回 positioning/problems/directions/scope/
> successCriteria/risks 定字字段）；随后用户指出概览是「需要不断维护
> 的文档，有修订记录」，改定为 **article 文档形态**，结构对齐条目
> 详情（UI-015/016/017）。

## 定位

项目概览是每项目一篇的**可维护文档**（对标 dev-toolkit facilitator
设计文档体系 00 项目概览 README）：Agent 经 MCP 持续修订，UI 只读
渲染。正文为 Markdown；修订不可变追加（BR-004），历史版本可切换
查看。文档内容为项目数据，不参与 i18n（与条目正文同策略），语言
切换只影响界面文案。

## 布局（article 形态，对齐条目详情阅读体验）

单栏阅读页（容器 `<article>`，maxWidth 与条目详情同口径，左对齐
见 patterns.md「页面容器与标题对齐」）：

1. **头部**：文档标题（Title2，数据字段）+ meta 行
   `r{revisionNo} · 相对时间`（当前版元信息随正文一次取齐；actor 元信息
   2026-09-03 用户指令随修订模型移除）；
2. **修订历史浮动胶囊**（共享 RevisionTimeline，2026-09-02 用户指令改
   浮动胶囊）：fixed 悬浮视口右上（距右缘 24px、顶距 24px；2026-09-03
   用户指令改，不占正文文档流、滚动中恒在、永不随内容滚走）；收起 =
   历史图标 + 「修订历史」+ 修订数，点击展开面板（行 = 修订号 +
   标题 · 摘要 + 相对时间，当前版高亮），点选历史版切正文、
   点当前版回到当前；面板无名称标题行（2026-09-03 用户指令），首分区
   小节标题行「修订历史」右侧带收起按钮（同日三次指令统一条目详情
   面板样式；收起途径：胶囊/收起按钮/点外/Esc），小节标题区可点击
   折叠/展开分区（同日六次指令，与条目详情同款，折叠 ≠ 收起面板），
   选中不自动收起
   （同日 RadioGroup 形态指令，详见 patterns.md「修订时间线/浮动
   胶囊面板」）；无 diff 视图
   （UI-018 同策略）；版本切换为组件本地 state，不改 URL、刷新回
   当前（UI-017 同款）；
3. **版本提示条**：查看历史版时显示 MessageBar info
   「正在查看历史版本 r{N}」+「回到当前」（复用 common.viewingHistory /
   backToCurrent）；查看当前版不显示；
4. **正文**：Markdown 只读渲染（共享 MarkdownBody，react-markdown +
   remark-gfm（GFM 表格，2026-09-02 实现期准入）+ `.md-body` 排版样式）；
   切换历史版本时整体替换为该版快照正文，头部元信息不变。

```text
项目概览 · relay-harbor
┌───────────────────────────┐
│ 项目概览（Title2）  (⏱修订历史·3)│
│ r3 · agent-session-2 · 2h │
├───────────────────────────┤
│ （Markdown 正文）          │
│ ## 项目目标 …              │
│ ## 范围 …                  │
└───────────────────────────┘
  ↑ 点胶囊展开浮动面板切换版本
```

## 数据

- `get_project_overview`（project_id → 当前文档：title、body_md、
  revision_no、summary、changed_at；actor 2026-09-03 移除）→
  `["projects", id, "overview"]`；
- `list_project_overview_revisions`（**新增命令**，INT-001 白名单
  15→16）：project_id → 修订列表倒序、含快照正文（title、body_md，
  同 get_item_revisions 一次取齐策略——单文档量小，免第三次命令）→
  `["projects", id, "overview-revisions"]`。

## 交互

全部只读；文档无状态机、无关系/影响区（区别于条目详情）；无跳转
目标。

## 状态与边界

- 加载骨架屏；查询失败错误态 + 重试；
- 修订仅 1 条：胶囊照常呈现（UI-031 同策略，不隐藏入口）；
- data-changed 失效刷新（ADR-006），query key 前缀
  `["projects", id, ...]`。

## 测试要点

头部元信息与当前修订一致；胶囊展开/收起与点外关闭；版本切换正文随
快照变化、面板选中后收起、回到当前恢复；滚动时胶囊保持最小距离
钉在固定高度；
修订倒序呈现；语言切换只影响界面文案不改变正文。
