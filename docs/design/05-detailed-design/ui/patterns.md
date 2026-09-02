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

## 修订时间线（2026-09-02 抽为共享模式；同日用户指令改浮动胶囊）

修订历史统一由共享组件 `RevisionTimeline` 呈现，2026-09-02 用户指令
由文末「Divider + 内联列表」区块改版为**右上角浮动胶囊**（原型参照
ZCode 右上角「更改」胶囊，内部排版不照搬、以交互逻辑为准）：

- **收起态胶囊**：圆角胶囊（高 40px + 14px 字——2026-09-02 用户指令
  由 small 升级「太小了」、同日再指令加高；边框 + shadow8 浮起阴影；
  内容 = 图标 + 「修订历史」+ 计数圆角徽标；**hover 时历史图标经
  200ms 交叉渐变旋出为展开图标**（双层图标叠放，`--icon-hover` CSS
  变量门控 + calc 派生透明度/旋转，规避 Griffel 后代选择器限制；
  未随「减弱动态」降级——动效轻量，同活动图 canvas 动画留痕策略））；
  sticky 悬浮于文档容器
  顶部右侧，与页顶保持
  **设定的最小距离**（top XXL 32——2026-09-02 用户三次指令纠正语义：
  既非初版 8px 贴顶、也非锚定文档随页滚离；滚动时胶囊恒不低于此线，
  视觉上钉在固定高度）；正在查看历史版时胶囊呈选中底色提示当前不在
  当前版。
- **展开面板**：点击胶囊开合（aria-expanded），面板 absolute 右对齐
  悬于胶囊下方（elevation 阴影、不挤动正文）；**面板带 header**
  （2026-09-02 用户指令，样例 ZCode「Git 工具」面板：标题「修订历史」
  居左 + 右侧缩小按钮 ArrowMinimize，hairline 下缘与清单分隔；点缩小
  按钮即收起面板，与点外/Esc 等效）；面板内沿用原行布局
  （修订号等宽 + 摘要 · 操作者 + 相对时间，`auto 1fr auto`，当前版
  colorNeutralBackground1Selected 高亮）。
- **关闭逻辑**：点胶囊开合；点击面板外关闭；Esc 关闭；**选中修订后
  收起**（正文换装与 MessageBar 反馈已足够，面板不遮挡阅读）。
- **版本切换逻辑不变**（UI-017 既有约定）：`viewedRevision` 页面本地
  state（null=当前），不入 URL——刷新回当前版本；点历史版切换、
  点当前版即回当前；查看历史版时正文区上方 MessageBar info
  「正在查看 rN」+「回到当前」按钮（common.viewingHistory /
  backToCurrent）不变。

仅 1 条修订时胶囊照常呈现（UI-031 同策略，不隐藏）；自绘组件
（Fluent v9 无现成 Popover 需求匹配的浮动胶囊形态，点外关闭自实现，
不为此引依赖；Fluent Popover 的锚定与滚动行为不合页顶锚定需求，
同此理由自绘）。消费方：条目详情（UI-017）、项目概览（UI-035）。

## 页面容器与标题对齐（2026-09-02，同日七改）

全部页面容器统一口径：padding 上/下 `XL`（20）/ **右 64px** /
**左按整窗 1/4 比例锚定 `max(24px, calc(25vw - 280px))`**（280 =
活动栏收起 48 + 侧栏 232；窗口 < 1216 时钳制下限 24px，最小窗
1024）+ **左对齐，不做水平居中**（无 `margin: 0 auto`）+ 按页面族
限宽（border-box，maxWidth 随 25vw 联动 = `25vw - 280px + 内容宽
上限 + 64px`，内容宽上限不随窗变；设置页无侧栏，左 padding 为
`calc(25vw - 48px)`，最小窗下即 25% 无需钳制，maxWidth 相应少
232）：

| 页面族 | maxWidth | 内容宽上限 |
| --- | --- | --- |
| 条目类型页 / 项目统计 / 项目概览 / 条目详情 | `calc(25vw + 864px)` | 1080 |
| 项目列表 | `calc(25vw + 744px)` | 960 |
| 设置 | `calc(25vw + 656px)` | 640 |
| 任务看板 | 不限宽（`height: 100%` 纵向 flex） | 随区宽 |

沿革：同日先六轮实览调参 24→40→64→320→260→200 定稿固定左 200；
随即七改（用户指令「按整个页面的 1/4 处开始」）——固定像素只在
调参窗口成立：200 = 1920 整窗 1/4（480）减左栏 280，换窗比例即漂
（1280 下标题落到整窗 37.5%），即「页边距始终不对」的根源。比例
锚定后标题起点恒为整窗 1/4 分界，任意窗口视觉一致；1920 宽下与
六改终版逐像素等值（padding 200 / maxWidth 1344）。文章阅读列
（概览/详情）内容宽上限自 860 上调 1080 维持不变（用户指令正文列
太窄）。废止更早的 `margin: 0 auto` 居中版式：各页限宽不同，居中
使标题起点随窗口宽度与页面族漂移（用户指令：所有页面标题对齐到
同一起点；任务看板页本就未居中，即对齐基准）。

已知偏差（留痕）：① 活动栏展开（48→200）时标题随内容区右移
152px，比例锚定以默认收起态为基准；② `25vw` 含滚动条宽（Windows
经典滚动条约 17px），标题实际起点右偏约 4px，实览不可辨。

实现收敛：口径落 `src/components/usePageContainerStyles.ts`
（七页共用，页面族 variant 入参），页面不再各自手写
padding/maxWidth。AppShell main 自身无 padding，页面容器是唯一
边距层。

## 侧栏条目入场动画（2026-09-02）

第二层导航栏（UI-001，进入式两级呈现）的条目行、组头行、题行在
**层级进入**时做一次入场浮现：透明度 0→1 + 纵向 `translateY(8px)→0`，
时长 `durationNormal`（200ms）、缓动 `curveDecelerateMid`，按 DOM 序
逐项错开 `16ms`、错开总量钳制 240ms（`animation-fill-mode: backwards`
保证延迟期保持首帧不可见）。动画类整体落 styles.css 全局
`.sidebar-enter`（.md-body 同款刻意例外）：Griffel 不透出 keyframes
工具（不为其引 @griffel/react 直依赖），且**实测其 makeStyles 的
@media 槽位不生成规则**（全页 83 条 media 规则均出自 makeResetStyles，
留痕），动画声明与降级门控须一并落全局；错开经行内 CSS 变量
`--enter-delay` 注入单一类，不逐项造类。

触发语义（2026-09-02 用户指令「这些 item 做入场动画」，范围限第二层
侧栏）：**只在层级切换时播一次**——进入层级 ⇄ 根层级、设置页往返
（侧栏整体卸载重挂）时新条目集挂载即播；**层内导航不重播**（概览→
统计→类型页，DOM 节点复用无重挂）；数据 refetch 重渲染亦不重播。
两层级同规格（根层级项目清单行、进入层级返回行/题行/子导航/组头）。

「减弱动态」降级：动画类由 `@media (prefers-reduced-motion:
no-preference)` **反向门控**——仅在未偏好减弱动态时声明动画，开启
偏好即不匹配规则、直接呈现终态。不在 Griffel 类内写 @media 覆盖
（实测不生成规则，见上；亦不触碰「盒模型」节记载的 Griffel @media
桶序坑——该坑仅在 @media 与 :hover 同抢 transform 时反向）。

与共享指示条的互作（留痕）：条目 transform 不影响 `offsetTop/offsetLeft`
布局值，指示条定位（indicatorMotion 测量的即布局位）不受入场动画
干扰；指示条元素本身常驻不重挂，不参与入场。

实现收敛：`src/styles.css`（`@keyframes sidebar-item-enter` +
`.sidebar-enter` 类，no-preference 门控，令牌走主题 CSS 变量）+
`src/app/layout/Sidebar.tsx`（mergeClasses 挂全局类 + `--enter-delay`
错开变量），规格与触发语义以本节为准。
