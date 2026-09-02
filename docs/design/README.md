# RelayHarbor 系统设计

## 当前状态

- 工作模式：实现期（UI 先行，后端联调暂缓）
- 当前阶段：UI 全量实现完成（mock 数据层，2026-08-28，检查全绿）；后端命令未落地（IPC 白名单 16 中声明 1）
- 设计基线：00 概览、01 需求、02 用例、03 领域模型、04 架构、05 详细设计（含界面设计）、06 验证（均 2026-08-27 确认；2026-08-28 界面设计扩展随实现启动确认）
- 下一步：后端命令落地与联调（届时 api/ 门面切回 tauri-specta 产物）

## 设计基线摘要（2026-08-27 确认）

- **范围**：M1 = Agent 经 MCP 写入（唯一业务写入口）+ UI 纯只读 + 确定性 Markdown 导出；M2（基线确认流程、确定性导入/快照、关系图、JSON 导出）未编号，启动时回 01 补号。
- **规模**：FR 16 ｜ NFR 9 ｜ CON 9 ｜ UC 18（详细规约 6）｜ DOM 8 + INV 10 ｜ CMP 8 ｜ INT 6 ｜ ADR 8 ｜ MCP 工具 12 + 错误码 10 ｜ IPC 只读命令 13 ｜ 数据表 5。（2026-08-28 界面设计修订：FR 16→18、IPC 命令 13→14、新增 UI 决策 32 条；2026-09-02 界面设计修订：UI 决策 →UI-035、IPC 命令 14→16（get_project_overview / list_project_overview_revisions）、数据表 5→7（project_overview 两表），详见最近工作摘要）
- **架构要点**：Tauri v2 四层 DDD（domain 纯净、CI 断言）；意图级存储端口 + ChangeSet 单事务（ADR-002）；本地 HTTP API 直接讲 MCP（ADR-004）；bridge 纯 stdio↔HTTP 网关、15s 拉起时限（ADR-005）；UI 零业务写命令、data-changed 事件失效通知（ADR-006/CON-009）；React + Fluent UI v9 + TanStack Query（ADR-007）；M1 单 crate 零投机（ADR-008）。
- **验证结论**：通过；阻塞 0；开放风险 2（RISK-004 编码 Agent 越界——CI 三件套随脚手架首 commit 建立；RISK-008 LIKE 性能——FTS5 升级路径预埋）。
- **纪律**：实现期一切偏差留痕、新需求先修订设计（修订循环自 02 起）。

## 阶段状态

- 00 项目概览：已确认（2026-08-27 定位修订）
- 01 需求：已确认（2026-08-27 定位修订稿；2026-08-28 增补 FR-017/018、修订 FR-016，随界面设计基线一并确认）
- 02 用例：已确认（2026-08-28 UC-018 目标补界面语言）
- 03 领域模型：已确认
- 04 架构：已确认
- 05 详细设计：已确认（2026-08-27；界面设计扩展 2026-08-28 随实现启动确认）
- 06 验证：已确认（最终基线；2026-08-28 追踪补充随界面设计基线确认）

## 文档导航

- [RelayHarbor 项目概览](00-overview/README.md)
- [需求](01-requirements/README.md)
- [用例](02-use-cases/README.md)
- [领域模型](03-domain-model/README.md)
- [架构](04-architecture/README.md)
- [详细设计](05-detailed-design/README.md)
- [验证](06-verification/README.md)
- [开放问题](open-questions.md)

## 关键决策

产品级决策已确认（OQ-001～OQ-006 全部解决，结论见[开放问题](open-questions.md)）：

- 数据库为唯一运行时事实来源，Markdown/JSON 仅为确定性快照；
- 首期仅交付设计与任务管理平面，执行编排为未来候选；
- MVP 仅实现 SQLite，保留存储端口；远程未来候选为独立 Remote Server（PostgreSQL 仅作 Server 端存储）；
- 桌面应用独立安装，Plugin 携带 stdio↔HTTP 轻量转发连接器；
- Windows 优先首发，代码保持跨平台边界；
- M1 定位（2026-08-27 修订）：UI 只读 + Markdown 导出，业务写入唯一入口为 MCP（提前至 M1 交付）。

技术栈已随 04 架构阶段转正为 ADR-001～008（见[架构](04-architecture/README.md)）；仓库根《project structure.md》降级为历史探索记录，后续以 docs/design 为准。

## 阻塞问题

无。OQ-001～OQ-006 已全部解决，结论见[开放问题](open-questions.md)。

## 最近工作摘要

- 2026-08-27 ｜ 00 项目概览 ｜ 整理 RelayHarbor 产品目标、首期候选范围、系统上下文、概念架构和主要风险 ｜ 等待确认 OQ-001、OQ-002
- 2026-08-27 ｜ 00 项目概览 ｜ 用户确认 OQ-001、OQ-002、OQ-005；OQ-003/004/006 随技术方案评审与仓库现状关闭；阶段进入待确认 ｜ 等待用户确认概览基线
- 2026-08-27 ｜ 00 项目概览 ｜ 远程演进方案由"远程 PostgreSQL 存储"替换为"独立 Remote Server"（同一领域核心第二宿主、桌面 thin client、bridge 直连）；同步修订概览方向与存储章节、系统上下文图、OQ-003 结论与技术方案文档 ｜ 00 仍待确认
- 2026-08-27 ｜ 00 项目概览 ｜ MCP 连接器定位修订：不区分本地/远程项目，一律经本地桌面应用转发，连接器不持有用户凭据；数据归属改为项目级属性（本地与远程项目可并存）；同步概览上下文图、MCP 接入章节、OQ-004 结论与技术方案文档 ｜ 00 仍待确认
- 2026-08-27 ｜ 00 项目概览 ｜ 首版范围裁剪为 M1/M2 两批：M1 以 UI 管理平面为主（领域核心与存储保持完整），MCP 接入、确定性导入导出、基线与变更集 UI、关系图可视化移入 M2；成功标准按 M1/M2 分组 ｜ 00 仍待确认
- 2026-08-27 ｜ 00→01 ｜ 用户确认 00 概览基线（含 M1/M2 裁剪与全部 OQ 结论），00 转已确认，进入 01 需求 ｜ 首轮访谈：条目与任务状态机、关系类型集合、Markdown 编辑形态
- 2026-08-27 ｜ 01 需求 ｜ 产出 M1 需求初稿：FR-001～012、NFR-001～008、BR-001～011、CON-001～008（新建 01-requirements 目录五个文档）；访谈确认条目三态+双终态、任务四态+取消、五种固定关系、源码+实时预览编辑 ｜ 通过门禁检查后待用户确认需求基线
- 2026-08-27 ｜ 01 需求 ｜ 用户确认需求基线；随即提出 M1 定位修订：UI 只读 + Markdown 导出、业务写入唯一入口为 MCP（提前至 M1）。重写 FR-001～016（Agent 写入 7 + 只读 UI 7 + 基础设施 2）、NFR-005/007/009、CON-004/007/009，同步修订 00 概览（范围/成功标准/MCP 排期/风险）与 OQ-002 注记 ｜ 修订稿待重新确认
- 2026-08-27 ｜ 02 用例 ｜ 产出初稿：参与者 3（开发者 / 设计与规划 Agent / 系统环境）、用例 18（Agent 写入与查询 9 + 开发者浏览导出 9），详细规约 6（UC-004/005/006/009/015/016）｜ 待确认（含 BR-009 最终语义）
- 2026-08-27 ｜ 02→03 ｜ 用户确认 01 修订基线与 02 用例，BR-009 定稿（编辑已确认条目退回评审中）；进入 03 领域模型 ｜ 首轮访谈：关系方向语义、替代关系存储形态、元数据修改语义
- 2026-08-27 ｜ 03 领域模型 ｜ 访谈确认三项：关系语义"动者在前"（影响定位沿 derives/satisfies/depends 入边反向闭包）、替代存条目字段 superseded_by、仅标题/正文触发退回且类型不可变。产出初稿：概念 8（DOM-001～008）、不变量 10（INV-001～010）、双状态机（条目/任务）与转换规则、业务过程 2（确认循环、变更集原子提交）；回填 02 四个规约的开放问题 ｜ 待确认
- 2026-08-27 ｜ 03→04 ｜ 用户确认 03 领域模型；三个待确认项按记录定稿（项目名称不要求唯一、derives/satisfies 反向对不禁止靠 Agent 自律、traces/relates 不参与影响遍历）；进入 04 架构 ｜ 首轮工作：技术候选转正 ADR、本地 API 与 MCP 通道架构
- 2026-08-27 ｜ 04 架构 ｜ 产出初稿：组件 8（CMP-001～008，双入站层共用 services/domain）、接口 6（INT-001～006）、部署视图（单进程 + 按需 bridge、回环唯一监听面）、ADR 8（分层、意图端口/ChangeSet、单 SQLite、本地 API 讲 MCP、bridge 纯网关、IPC 只读、前端栈、单 crate 零投机）；《project structure.md》降级为历史记录 ｜ 待确认
- 2026-08-27 ｜ 04→05 ｜ 用户确认 04 架构基线（含 UI 刷新通知机制补充）；进入 05 详细设计 ｜ 首轮工作：Schema、工具契约、命令面、导出结构、事件 payload、bridge 时限
- 2026-08-27 ｜ 05 详细设计 ｜ 产出初稿：数据设计（五表 + 索引 + 事务边界，搜索定 LIKE）、API 契约（MCP 工具 12 个 + 错误码 10 个、ipc 白名单 13 命令、data-changed payload、导出目录结构）、模块设计 7（domain/services/storage/http/bridge/frontend/export）、时序 2（MCP 写入全链路、bridge 引导恢复，拉起时限 15s 定案）；前端 features 按只读定位重划（projects/design/tasks/search/export/settings）｜ 待确认
- 2026-08-27 ｜ 04 架构 ｜ 补 UI 刷新通知机制（用户问询触发）：写工具成功后经 Tauri event 广播 data-changed（仅失效信号，不传数据），前端按项目前缀失效查询、聚焦刷新兜底；只读边界不变；修订 ADR-006、INT-001、CMP-002/003 ｜ 待确认
- 2026-08-27 ｜ 06 验证 ｜ 六步全链路校验完成：发现 4 项建议级缺口（UC-009/016 未回填 05 定案、Plan 概念无承载、INV 编号未声明、同项目约束归属未写明），已按修订循环回填闭环；产出追踪（四链路 + NFR/CON 汇总）、一致性报告（阻塞 0）、风险清单 8 项（开放 2：Agent 越界有 CI 计划、LIKE 性能有 FTS5 升级路径）｜ 结论：通过，待用户确认最终基线
- 2026-08-27 ｜ 06→完成 ｜ 用户确认最终设计基线：06 转"已确认"，根状态改为"设计流程已完成"；根索引记录基线摘要（范围/规模/架构要点/验证结论/纪律）与下一步（脚手架待要求启动）｜ 设计阶段收口，实现任务不自动创建
- 2026-08-27 ｜ 实现期偏差 ｜ 脚手架落地（未提交首 commit）：CI 三件套 + IPC 白名单 + Rust 分层边界全部就位并负向验证；两处偏差留痕——① data-changed 事件线名实际为 data-changed-event（tauri-specta 从结构名生成，不支持自定义，已注记 api-contracts INT-001）；② Windows 测试二进制需链接期嵌入 Common-Controls v6 manifest（tauri 已知问题 #11028/#13419，经 .cargo/config.toml + build.rs 关闭资源内嵌解决，不影响契约）。CRATE-类型收窄为 rlib（无移动端计划）｜ 属实现层修复，设计语义不变
- 2026-08-28 ｜ 05 界面设计 ｜ 六轮访谈定案应用界面，产出 ui/ 目录（README 总览 + app-shell 骨架 + patterns 全局模式 + 8 个页面文档），决策编号 UI-001～032：双层侧栏（第一层项目/设置，第二层项目切换+导航）、项目列表页（列表/卡片可切换）、项目概览页（统计/类型分布/最近修订/阻塞）、条目手风琴分组+标准行+过滤工具条、条目详情独立全宽页（单栏滚动/修订时间线版本切换/影响内嵌清单）、看板五列+基础卡片+全局过滤、搜索独立页、导出表单式、设置分组卡片；主题与语言均跟随系统可覆盖、冷启动恢复上次位置、原生标题栏、骨架屏+引导空态 ｜ 同步修订：FR-016 加语言、新增 FR-017/018、UC-018 补语言、INT-001 白名单 +list_recent_revisions（13→14）、modules/frontend 路由与 features（+overview）、05 README、traceability 链路二/四 ｜ 待用户确认界面设计基线
- 2026-08-28 ｜ 实现期 ｜ 用户确认界面设计基线并要求实现 UI（后端联调暂缓）：05 界面设计转已确认。实现留痕——① 数据层走 api/ 内 mock 门面（fixtures + localStorage 设置），联调时切回 tauri-specta 产物，命令签名与 INT-001 一致；② 类型暂定义于 api/types.ts（generated 未含新命令，联调时替换）；③ i18next + react-i18next 准入（依赖白名单同步，FR-016/UI-004）；④ ipc-command-whitelist.json 同步 +list_recent_revisions ｜ UI 全量实现进行中
- 2026-08-28 ｜ 实现期 ｜ UI 全量实现完成（UI-001～032 落地）：app shell（双层侧栏/活动栏/路由/冷启动恢复 last_location/主题三态/语言切换）+ 7 个 feature（projects 列表卡片双形态、overview 统计+类型分布+最近修订+阻塞、design 手风琴+详情页修订版本切换+关联+影响、tasks 五列看板含阻塞标记、search、export 进度模拟、settings 即时持久化）+ 共享组件 + i18n 双语词典 + api/ mock 层全量命令 ｜ 校验：typecheck/dep-cruise(61 模块)/依赖白名单/IPC 白名单/Rust 边界全绿，dev 冒烟通过（16 关键模块 200）｜ 偏差留痕——① 移除脚手架误装的未用依赖 @fluentui/react-charts（未入白名单且无引用）；② 删除全部页面就位后的 PlaceholderPage 遗留组件 ｜ 下一步：后端命令落地与联调
- 2026-08-28 ｜ 实现期 ｜ 用户要求：概览页四模块统一卡片式；随后要求状态统计与类型分布加图表并点名使用 @fluentui/react-charts（覆盖当日早前的未用移除记录，白名单重新准入）。条目/任务卡 = 状态环形图（扇区色同 StatusBadge 语义色、环心总量）+ 计数清单；类型分布 = 竖向柱状图（类型代码为轴标签、柱顶标数值、零计数灰柱，保留设计盲区识别）｜ 校验：typecheck + npm run check 全绿（62 模块）｜ 图表属实现期视觉增强，数据仍出自 get_project_state，契约不变
- 2026-08-28 ｜ 实现期 ｜ 图表选型改版（用户确认）：评价 Fluent charts 不成熟（callout 字号缺陷，且 9.3.x 用户样式槽位未合并），概览图表换用 @ant-design/charts v2（G2 v5 内核，Pie+innerRadius 环形图 / Column 柱状图，主题跟随明暗设置——新增 useResolvedTheme 共享 hook）；@ant-design/graphs 预准入白名单供 M2 关系图（替代 @xyflow，M2 启动时再安装）；@fluentui/react-charts 移出白名单并卸载，其 callout 字号 CSS 补丁随之删除 ｜ 校验：typecheck + npm run check 全绿（63 模块）｜ 数据契约不变
- 2026-08-28 ｜ 实现期 ｜ 图表配色改版（用户确认）：放弃自选语义色映射，环形图/柱状图走 AntV 主题默认色组（category10，随明暗主题自动适配）；环形图下方图例徽章取同一默认色组保持扇区对应；注意该色组仅用于图表与图例徽章，条目页 StatusBadge 仍为 Fluent 语义色 ｜ typecheck 通过，Vite 重启生效 ｜ 数据契约不变
- 2026-09-02 ｜ 03 领域模型 ｜ 用户指令：新增已废弃终态——已确认 → 已废弃（显式确认），语义为"确认后失效且无后继"，与已取消（未确认即放弃）、已替代（有后继）三分终态，对应 ADR/RFC 惯例 deprecated/superseded 之分；明确不设"已废弃→已替代"后继补记迁移，确有覆盖关系用 relates 表达；同步修订 state-models（状态图+转换表）、BR-002（白名单+终态列举）、BR-008（废弃显式确认）、FR-005、UC-005、domain-model DOM-002、business-processes、data-model items.status、ui/patterns 徽章色（deprecated=severe）｜ mock 夹具加 FR-022 废弃样本，前端 ITEM_STATUSES 常量驱动自动扩展 ｜ 其余曾讨论的方向（删评审中、按类型分治状态机、作废/替代时关系迁移）经讨论暂不采纳
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：侧栏子导航 14 类型清单按设计阶段分组（组头小字分隔）——需求（FR/NFR/BR/CON）、用例（UC）、领域模型（DOM）、架构（CMP/INT/SEQ/ADR）、详细设计（UI）、验证（RISK/OQ）；TASK 与任务面板不入组置尾，组头不带计数、空组恒显示；组词表为工具级静态常量（用户三项指令拍板）｜ 修订 app-shell.md 第二层子导航规格 ｜ 曾考虑的"条目列表按文档小节加副标题"方案未采纳（与本条为不同需求）
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：分组组头易与普通条目混淆，视觉强化——先只加组间分隔线（每组组头行上方 1px hairline；TASK 尾部不加），组头不加粗不编号（加粗+分隔线/阶段编号/浅底色带方案中拍板前者去加粗）；实览后二次指令：通栏太长，收短为两端各缩进 16px（左端对齐条目文字、右侧对称留白，宽约 166px）｜ 修订 app-shell.md 分组规格分隔线段 ｜ 后续仍可叠加加粗或阶段编号（与 docs/design 目录 01→06 同构）
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：自定义滚动条——悬浮型 8px 全局应用（透明轨道 + 半透明圆角拇指，悬停浮现、悬停拇指加深，暗色随 UI-003 解析主题切换）；实现并实览后同日用户指令滚回，后面再议｜ 已全部回退：styles.css 滚动条段、AppProviders data-theme 钩子、ui/patterns「滚动条」节撤销，恢复系统默认滚动条 ｜ 技术结论留 open-questions.md OQ-008 备查
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：概览页「类型分布」仿上方双统计卡只占一半，另一栏新增日期热力图——修订热力图卡片（UI-011）：近 16 周逐日修订计数日历网格（周一首行、按末日所在周整周对齐恒 16 列，格 22px 底色 5 档品牌色透明度，月份/星期 Intl 标签，少→多图例，title 提示；初版 26 周 11px 格实览留白过多，同日三次指令收窄窗口加大格子）｜ 修订 pages/project-overview.md（布局第 2 项改双卡行）、api-contracts get_project_state 扩 revisions_by_day（近 182 天逐日计数）、ui/README UI-011 行；类型 ProjectState + mock 确定性生成；UI 截取最近 16 周渲染 ｜ 热力图实现为 Griffel 网格手绘（日历网格非坐标系图表，G2 无日历变换，偏差留痕）；Rust 侧 M1 落地时同步实现字段
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：热力图卡片命名改「活动图」（原「修订热力图」），并移除顶部月份标签与左侧星期标注——仅留格子网格 + 底部「少→多」图例（视觉再简化）｜ 修订 pages/project-overview.md（布局第 2 项）、ui/README UI-011 行、api-contracts get_project_state 行；i18n 键 revisionHeatmap→activityChart；RevisionHeatmap 组件删 Intl 标注渲染 ｜ 组件名 RevisionHeatmap 与字段 revisions_by_day 保留内部标识不改
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指出 Ant Design Charts 实际有热力图（官方 Heatmap 示例）：查证结论——G2 v5 有通用 Heatmap（矩阵热力图）但无现成日历布局变换（官方 issue antvis/G2#6424 仍开放；旧版 charts v0 曾有 Calendar 组件、v2 无）；经用户确认，活动图改用 AntV 实现，消除早前「Griffel 网格手绘」偏差 ｜ 重写为 ActivityChart 组件（原 RevisionHeatmap 删除）：Heatmap mark="cell" + threshold 五档色阶 + 数据侧整周对齐预计算（周一×16 整列、格 22px 视觉不变），坐标轴全隐、固定 400×175 画布，悬停 tooltip「日期 · N 修订」；tooltipRender 自 OverviewPage 抽出为共享 ChartTooltip；canvas 无 CSS 变量，色值改经 Fluent 主题对象（webLightTheme/webDarkTheme）取具体值 ｜ npm run check 全绿（67 模块）；实览 canvas/图例/tooltip 逐项验证；api 契约不变
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：活动图自适应撑满卡片——格 22px 不变，显示周数按容器可容列数实时计算（4~26 周钳制，26 周 = 数据全量 182 天；ResizeObserver 随窗口缩放重算），替换固定 16 周/400px 画布 ｜ 修订 pages/project-overview.md 布局第 2 项；ActivityChart 加宽度测量与动态周数 ｜ npm run check 全绿；实览验证 1280/1060 窗口下 17 列 422px ↔ 13 列 322px 实时重算、还原正常
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：移除活动图「少 → 多」图例（手绘 DOM legend 删除，格色档语义由悬停 tooltip 承担）｜ 修订 pages/project-overview.md；i18n 删 heatmapLess/heatmapMore 键 ｜ npm run check 全绿
- 2026-09-02 ｜ 05 界面设计 ｜ 活动图留白两连修——① 修垂直居中失效：plots 图表容器默认内联 flex:1 撑满 wrap，覆盖 containerStyle={flex:"0 0 auto"} 后上下对称留白；② 用户指令格子加大 22px→28px（列距 31px）：当前窗口 14 周 431×214，上下留白 53px→33px（22/28/32px 与两轴自适应方案中拍板前者）｜ 修订 pages/project-overview.md ｜ npm run check 全绿
- 2026-09-02 ｜ 05 界面设计 ｜ 用户要求看 AntV 原生图例效果：临时给活动图启用 legend.color（threshold 色阶自动推断 legendContinuousBlock 分段色带，labelFormatter 把阈值 0.5/2.5/4.5/7.5 映射为档位起始值 1/3/5/8，showHandle 关滑块）——实测 G2 布局缺陷：图例默认 padding 20 + crossPadding 12 会四周内缩绘图区、length 同宽会致色带换行挤压格距，需按实测补偿画布宽高；用户看完否决（「算了，不要了」），整体还原 legend:false 无图例版 ｜ 设计文档不变（project-overview.md「无图例无坐标轴」条目维持）；探得的布局参数留本条备查 ｜ npm run check 全绿；实览确认还原 431×217、垂直居中
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：活动图加一行副标题说明日期范围——网格上方弱化小字「起 至 止」，取当前显示窗口首末日（随周数自适应变化，非全量 182 天；en 用 en dash），group aria-label 同步补范围｜ 修订 pages/project-overview.md 活动图条目、ui/README UI-011 行；i18n 新增 activityChartRange 键；ActivityChart 加 subtitle 样式 ｜ npm run check 全绿；实览验证 12px 副标题与网格间距 6px、整卡垂直居中不变（上下各 19px）
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：移除活动图日期范围副标题（上一条刚加，试用后否决——「只保留图表」），i18n activityChartRange 键同删 ｜ 修订 pages/project-overview.md（活动图条目并记「原生图例与副标题均试用后移除，维持纯网格」）、ui/README UI-011 行回退 ｜ npm run check 全绿；实览确认 431×217、上下留白 32px 对称
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：活动图进场动画改 zoom——config.animate.enter = { type: "zoomIn" }（G2 内置 13 种动画之一，逐格从中心放大，默认时长 300ms，update/exit 走默认；canvas 动画不随系统「减弱动态效果」偏好，留待无障碍需要时再处理）｜ 修订 pages/project-overview.md 活动图条目 ｜ npm run check 全绿；实览像素采样证实动画播放（~270ms 帧着色像素为稳态 8% → 两帧内满幅）并抓到中间帧
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：活动图 tooltip 样式与其他图表统一——改用共享 ChartTooltip 的 tooltipRender（色点+名称+加粗值）：名称=日期、加粗值=N 修订（i18n heatmapDayTooltip → revisionCount，en 复数），色点经 G2 heatmapItem 的 itemColorOf 兜底取格子档位色｜ 修订 pages/project-overview.md 活动图条目 ｜ npm run check 全绿；DOM 探针验证悬停结构（色点 rgba(15,108,189,.7)、日期、加粗「5 修订」）与类型分布一致（截图捕获抓不到悬停层，以探针为准）
- 2026-09-02 ｜ 05 界面设计 ｜ 修共享 tooltip 长文字贴值：ChartTooltip 的 tooltipRender 浮层宽度由内容收缩适配，space-between 无富余空间可分，名称过长时贴住加粗值——flex 容器加 gap 12px（悬停实测间距 0→12px），全部图表统一生效 ｜ npm run check 全绿
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：最近修订与阻塞提醒两卡各占半栏合并一行（不再独占一栏）——复用 chartRow 双卡网格（1fr 1fr + 间距 M），卡片由带底边距的 sectionCard 改纯列布局（chartCard），行距交给行容器；阻塞提醒随行等高拉伸，sectionCard 样式随之删除｜ 修订 pages/project-overview.md 布局列表与 ASCII 示意图、ui/README UI-011 行 ｜ npm run check 全绿；实览验证同排等宽（462px×2、间距 12px、等高 626px）
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：概览页阻塞提醒卡片整个移除（上一条刚与最近修订合并双卡，随即否决），最近修订恢复独占一栏——卡内数据（blockedTasks）派生自看板查询一并清理，i18n 删 blockedReminder/noBlocked/blockedCount/viewBoard 四键；阻塞信息由任务看板承担，API 契约不变｜ 修订 pages/project-overview.md 布局列表与 ASCII 示意图、ui/README UI-011 行 ｜ npm run check 全绿；实览验证阻塞卡消失、最近修订满宽（937/985）
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：原概览页更名「项目统计」移居 `/projects/:id/stats`（FR-018 统计语义不变），其上新增「项目概览」页接管 index 落地页——内容对标 dev-toolkit facilitator 设计文档体系 00 项目概览 README：项目目标/重点问题、当前已明确方向、里程碑范围（M1/M2）、成功标准、主要风险五卡；数据经新增只读命令 get_project_overview（INT-001 白名单 14→15，UI-035），结构化概览由 Agent 经 MCP 维护、UI 只读渲染，内容为项目数据不参与 i18n ｜ 修订 ui/pages/project-overview.md（重写为新页）+ 新增 ui/pages/project-stats.md、ui/README（UI-035 新增、UI-011 更名、路由表/骨架图/修订记录/子文档）、app-shell 第二层子导航、api-contracts INT-001、modules/frontend（features 拆分 overview+stats）；实现期：api/types +ProjectOverview/MilestoneItems/ProjectRisk、mock 夹具两项目概览数据、ipc-command-whitelist 同步、features/overview 整体更名 features/stats（StatsPage，顺删遗留死代码 useTaskBoardQuery）、新建 features/overview（OverviewPage）、路由 stats 子路由、侧栏双入口、i18n 双语词条（nav.stats 新增，overview/stats 词表按页重排）｜ npm run check 全绿（70 模块）；实览验证双入口高亮与两页渲染
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：项目概览是需不断维护的文档（有修订记录），结构应与条目（article）同构——五卡方案试用后同日二次改版：UI-035 定为每项目一篇 Markdown 文档（头部 rN·操作者·时间 + 正文 + 修订时间线版本切换，UI-017 同款、无 diff，viewedRevision 本地 state 刷新回当前），结构化契约（positioning/problems/…）废弃 ｜ 共享件上提 src/components：MarkdownBody（react-markdown + remark-gfm——实览暴露表格不渲染缺口，GFM 白名单准入）与 RevisionTimeline（自条目详情 UI-017 抽出），条目详情页同步迁移并回归；api 改版：ProjectOverviewDoc / OverviewRevision 类型、get_project_overview 改文档形态、新增 list_project_overview_revisions（白名单 15→16）；数据设计新增 project_overview / project_overview_revisions 两表（不入 items 体系：无类型前缀/状态机，BR-004 不可变追加同规）；mock 夹具 relay 3 版 / zhsppy 2 版差异化正文（r1 定位+问题 → r3 全量五节）｜ 修订 ui/pages/project-overview.md（重写）、api-contracts、data-model（ER+索引+概念对应）、ui/README（UI-035 行改写+修订条目）、modules/frontend、ui/patterns（Markdown 正文/修订时间线升共享模式）、依赖白名单、ipc-command-whitelist ｜ npm run check 全绿（72 模块）；实览验证：概览头部/正文/表格渲染、版本切换 r3→r1（正文缩至两节+提示条+高亮）、回到当前恢复全量、条目详情页回归正常、统计页不受影响
- 2026-09-02 ｜ 05 界面设计 ｜ 用户指令：所有页面标题应对齐到同一起点——废止 6 个页面容器的 `margin: 0 auto` 居中（各页限宽不同，居中使标题起点随窗口宽度与页面族漂移），统一左对齐、各族 maxWidth 保留 ｜ 标题起点恒为「main 左缘 + 水平 padding」，任务看板页本就未居中即对齐基准；patterns.md 新增「页面容器与标题对齐」节，顺带修正 item-detail.md「全宽」措辞与实现（908 限宽）不一致、ui/README 修订条目；代码 6 页容器一行改动（TasksPage/AppShell/styles.css 不动）｜ npm run check 全绿；实览 evaluate 断言 7 页标题起点全等（项目域 6 页同值；/settings 因项目导航面板隐藏 main 左移至 48，同一规则）
- 2026-09-02 ｜ 05 界面设计 ｜ 用户二次指令：左对齐后左侧需有明显空隙——各页水平 padding 自 XXL 24 上调 40px（令牌外值，注释留痕），7 页容器（含任务看板）统一改 `padding: XL 40px`，各族 maxWidth 同步 +32 保持内容宽不变 ｜ patterns.md「页面容器与标题对齐」节与 ui/README 修订条目同步改口径 ｜ npm run check 全绿；实览复测项目域 6 页标题 left 全等 320、设置页 88（导航面板隐藏致 main 左移，同一规则）
- 2026-09-02 ｜ 05 界面设计 ｜ 用户三次指令：「还是太窄了」，问询确认两者都要——水平 padding 40→64px、文章阅读列（概览/详情）内容宽 860→1080 与统计页同宽 ｜ patterns/ui-README 同步 ｜ npm run check 全绿；实览复测项目域 6 页标题 left 全等 344、设置页 112（同一规则）
- 2026-09-02 ｜ 05 界面设计 ｜ 用户四次指令：左侧起码 320——padding 改左 320 / 右 64 非对称，7 页容器统一，各族 maxWidth 按含 padding 384 重算 ｜ npm run check 全绿；实览复测（用户已加宽窗口，main 1832）标题 left 全等 600、设置页 368
- 2026-09-02 ｜ 05 界面设计 ｜ 用户五次指令：再小一点调整为 260——padding 左 260 / 右 64，maxWidth 按含 padding 324 重算 ｜ npm run check 全绿；实览复测标题 left 全等 540、设置页 308
- 2026-09-02 ｜ 05 界面设计 ｜ 用户六次指令：再小一点，调整为 200——padding 终版**左 200 / 右 64 非对称**（同日轨迹 24→40→64→320→260→200），7 页容器统一，各族 maxWidth 按含 padding 264 重算（类型/统计/概览/详情 1344、项目列表 1224、设置 904、看板不限宽），内容宽上限不变（1080/960/640）｜ patterns.md「页面容器与标题对齐」节、ui/README 修订条目同步终版口径 ｜ npm run check 全绿；实览复测：项目域各页标题 left 全等 480（= 280 + 200）、设置页 248（= 48 + 200，同一规则）
- 2026-09-02 ｜ 05 界面设计 ｜ 用户七次指令：固定左 200「页边距感觉始终不对」，改为**按整个页面的 1/4 处开始**——溯源确认固定像素只在调参窗口成立（200 = 1920 整窗 1/4 的 480 减左栏 280，1280 窗口下标题漂至整窗 37.5%），改**比例锚定**：标题起点恒为整窗 1/4（25vw 绝对位），左 padding `max(24px, calc(25vw - 280px))`（窗口 < 1216 钳制 24；设置页无侧栏 `calc(25vw - 48px)` 无需钳制），右 64 不变，各族 maxWidth 随 25vw 联动（工作台 +864 / 列表 +744 / 设置 +656，看板不限宽），内容宽上限 1080/960/640 不变；1920 宽下与六改终版逐像素等值 ｜ 口径上提共享 `src/components/usePageContainerStyles.ts`（七页共用，页面族 workbench/list/settings/board 入参，TasksPage 看板版面类保留与容器类 mergeClasses 合并）；patterns.md「页面容器与标题对齐」节、ui/README 修订条目同步（已知偏差留痕：活动栏展开标题右移 152 以收起态为基准；25vw 含滚动条宽起点右偏约 4px）｜ npm run check 全绿；实览验证 1024/1280/1920 三档标题起点 304/320/480（设置页 256/320/480），1280 起精确落在整窗 1/4
- 2026-09-02 ｜ 05 界面设计 ｜ 用户新想法指令：第二层侧栏重构为**进入式**——点击项目即进入该项目的侧栏上下文，顶部可返回（「研究一下」后按方案实施）：同一时刻只呈现一个层级，根层级（`/projects`）=「总览」全局位 + 项目清单，点击项目路由跳 `/projects/:id`（落地项目概览）侧栏随即切至进入层级 = 返回行（「返回列表」回 `/projects`，侧栏与路由同步落回根层级，维持「侧栏反映路由」不变式）+ 项目题行（非交互，不承载指示条与选中态）+ 子导航（条目构成不变）；层级由路由派生（projectId 有无）不新增 UI 状态，AppShell/router/Boot last_location 恢复不动，共享指示条动画原样复用 ｜ 替代 2026-08-29「选中项目就地展开子导航」树形呈现与 2026-09-01「项目行自身不呈现选中态」条款（随项目行被题行取代而消解）；双层不合并、第二层常驻继续成立 ｜ 修订 app-shell.md（第二层规格/选中态/状态表/mermaid/测试要点）、ui/README（UI-001 行、路由表「第二层导航态」列、骨架示意 ASCII、修订记录）；Sidebar.tsx 重构为根/进入两态渲染（TYPE_GROUPS/指示条 effect/item 系样式全复用，无新增 i18n 词条，复用 common.backToList）
