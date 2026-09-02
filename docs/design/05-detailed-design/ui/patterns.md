# 全局界面模式

> 状态：待确认
> 关联：UI-030～032、FR-011/012、NFR-008、ADR-006/007

## 状态徽章语义色（UI-030）

条目与任务状态用 Badge 呈现，色彩映射固定（Fluent Badge appearance +
tokens，具体色值由主题令牌决定，不硬编码）：

| 状态 | 语义 | Badge 档位 |
| --- | --- | --- |
| 草稿 draft | 未定稿 | neutral（灰） |
| 评审中 in_review | 待人审 | warning（琥珀） |
| 已确认 confirmed | 定稿 | success（绿） |
| 已取消 cancelled | 终态-未确认即放弃 | danger（红） |
| 已替代 superseded | 终态-被替代 | brand（紫/品牌色区分） |
| 已废弃 deprecated | 终态-确认后失效且无后继（2026-09-02 新增） | severe（橙红） |
| 待办 todo | 任务未开始 | neutral |
| 进行中 doing | 任务活跃 | brand（蓝） |
| 待验收 await_review | 任务完成待审 | warning |
| 完成 done | 任务终态 | success |
| 已取消（任务） | 任务终态 | danger |

同屏同时用文字（徽章内文案）表达状态，不依赖颜色单独区分（无障碍）。

## 空态（UI-031）

统一结构：图标 + 一句话 + 指引。各页面文案要点：

| 场景 | 提示要点 |
| --- | --- |
| 项目列表为空 | 「项目由 Agent 经 MCP 创建」——M1 UI 无创建入口（CON-009），指引写明写入通道 |
| 条目列表为空 | 项目尚无条目；同样提示由 Agent 写入 |
| 搜索无结果 | 「未找到匹配 XX 的条目」+ 建议检查编号/换关键词（FR-012 验收要求；页面 2026-08-28 暂缓移除，模式保留备恢复） |
| 看板某列为空 | 列头计数 0 + 轻提示，不占大块空态 |
| 详情修订仅 1 条 | 正常显示（r1 即当前），不显示空态 |
| 影响清单为空 | 「无受影响条目」——正向信息，非错误 |

## 加载态（UI-032）

- 列表与卡片类页面（项目列表、条目列表、看板、搜索结果、概览统计）：
  骨架屏占位，避免布局跳动；
- 局部动作（导出提交、版本切换）：按钮/区域 spinner；
- 事件失效触发的后台刷新：保持现有内容 + 静默 refetch（TanStack Query
  默认行为），不闪骨架屏。

## 错误态

统一错误组件（modules/frontend.md 既有约定）：错误说明 + 重试按钮；
查询失败页面级呈现。导出失败遵循 UC-016：原因 + 已完成部分说明，
不留误导性成功产物。

## 数据刷新

继承 ADR-006：写工具成功 → data-changed 事件 → 按项目前缀失效 →
静默 refetch；事件丢失由 refetchOnWindowFocus 兜底。UI 不做轮询。

## 只读边界的视觉表达

全局无任何写控件（按钮/表单提交）指向业务数据；唯一例外是设置页的
应用设置读写与导出面板的参数选择 + 目标路径写入（文件系统，非业务库）。
依赖白名单 lint 保障（无编辑器、无 dnd）。

## 盒模型（2026-09-01 全局迁移）

styles.css 声明全局 `box-sizing: border-box`（`*`/`::before`/`::after`）：
显式 width/height 即最终占位，含 padding 与 border。迁移动机：content-box
下 `width: 100%` + padding 会溢出容器（实例：活动栏展开态条目右侧高亮被
`overflow-x: hidden` 裁切）。

- Fluent v9 组件自带 border-box 声明，不受迁移影响；裸元素（原生
  a/button/div）不再逐个声明 box-sizing；
- 迁移等值调整：第二层侧栏行 minHeight 44/40（原 36/32 + 垂直 padding 8）、
  各页容器 maxWidth +48（原口径只算内容宽）；侧栏总宽回归本文档 232px
  口径（迁移前 content-box 膨胀至实际渲染 249）；
- 任务看板 `height: 100%` 不再叠加垂直 padding 撑出滚动（迁移前内容区
  恒有 32px 幽灵滚动）。

## 工具条（2026-09-01）

页首「标题 + 过滤控件」工具条为不换行 flex 行：标题 `flexShrink: 0` 恒单行
（CJK min-content 仅一字宽，标题不可作为收缩方）；空间不足由过滤控件收缩
让宽，下限 `minWidth: 120px`（须覆盖 Fluent Dropdown 默认 min-width 250px，
否则全部弹性落在标题上导致竖排挤压）。

## Markdown 正文（2026-09-02，UI-035 随概览文档改版升为共享模式）

条目正文与项目概览正文统一由共享组件 `MarkdownBody`（`src/components/`，
react-markdown + remark-gfm 封装；GFM 表格为维护型文档常态，react-markdown
v10 裸用不解析，remark-gfm 白名单 2026-09-02 准入）渲染。排版规则不走
Griffel：Markdown 生成的子元素集合开放，无法逐一建样式，故采用
`src/styles.css` 作用域类 `.md-body`（全局样式的刻意例外，组件注释留痕），
覆盖标题层级/列表/引用/代码块/表格/分隔线；组件本身只承担 article 语义
与行高口径，不干预内容。消费方：条目详情（UI-017）、项目概览（UI-035）。

## 修订时间线（2026-09-02，自条目详情抽为共享模式）

修订历史区统一由共享组件 `RevisionTimeline` 呈现：自绘 subtle Button
列表（Fluent v9 无现成 Timeline，不为此引依赖），每条 = 修订号（等宽）+
摘要 · 操作者 + 相对时间，网格 `56px 1fr auto`；当前版
colorNeutralBackground1Selected 高亮，点历史版切换、点当前版即回当前。
版本切换的页面状态约定：`viewedRevision` 本地 state（null=当前），不入
URL——刷新回当前版本（UI-017 既有行为，UI-035 沿用）；查看历史版时
正文区上方 MessageBar info「正在查看 rN」+「回到当前」按钮
（common.viewingHistory / backToCurrent）。消费方：条目详情（UI-017）、
项目概览（UI-035）。

## 页面容器与标题对齐（2026-09-02）

全部页面容器统一口径：padding 上/下 `XL`（20）/ **左 200px（令牌
外值；同日六改 24→40→64→320→260→200，用户逐轮实览调参定稿）/
右 64px**（非对称）+ **左对齐，不做水平居中**（无 `margin: 0 auto`）
+ 按页面族限宽（border-box，含左右 padding 264；maxWidth 只在
宽窗生效，窄窗内容随区宽收缩）：

| 页面族 | maxWidth | 内容宽上限 |
| --- | --- | --- |
| 条目类型页 / 项目统计 / 项目概览 / 条目详情 | 1344px | 1080 |
| 项目列表 | 1224px | 960 |
| 设置 | 904px | 640 |
| 任务看板 | 不限宽（`height: 100%` 纵向 flex） | 随区宽 |

文章阅读列（概览/详情）内容宽上限自 860 上调 1080，与工作台族
同宽（用户指令正文列太窄）。标题起点恒为「main 左缘 + 200px」，
与窗口宽度无关。废止此前的 `margin: 0 auto` 居中版式：各页限宽
不同，居中使标题起点随窗口宽度与页面族漂移（用户指令：所有页面
标题对齐到同一起点；任务看板页本就未居中，即对齐基准）。
AppShell main 自身无 padding，页面容器是唯一边距层。
