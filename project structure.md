# RelayHarbor 目录结构

后端采用四层 DDD（Interfaces / Services / Domain / Infra），依赖方向固定为
`interfaces → services → domain ← infra`：infra 实现 domain 定义的端口，
`state.rs` 作为组合根完成装配。`domain/` 中不得出现 `tauri::`、`sqlx::`、`axum::`。

前端采用 React + TypeScript + Vite：TanStack Query 管服务端状态，Zustand 管 UI
状态，类型由 tauri-specta 从后端 DTO 生成。组件库采用 Fluent UI v9
（@fluentui/react-components）。

```
relay-harbor/
├── src/                        # WebView 前端（React + TS，Vite 构建）
│   ├── app/                    # 应用壳：装配路由与 Provider，不含业务
│   │   ├── router.tsx          # 集中式路由表（不用文件式约定路由）
│   │   ├── layouts/            # 主布局：侧边栏 + 内容区
│   │   └── providers/          # QueryClient / FluentProvider 等 Provider
│   ├── features/               # 业务垂直切片，内部结构固定
│   │   ├── design/             # 需求与设计条目
│   │   │   ├── components/     # 组件（测试 colocate：*.test.tsx）
│   │   │   ├── hooks/
│   │   │   ├── queries.ts      # TanStack Query 查询与变更
│   │   │   ├── types.ts        # 仅本 feature 的视图类型
│   │   │   └── index.ts        # 唯一对外出口
│   │   ├── tasks/              # 任务看板（dnd-kit）
│   │   ├── graph/              # 追踪关系图（@xyflow/react）
│   │   │   └── nodes/          # 自定义节点
│   │   ├── baselines/          # 基线与变更集预览
│   │   └── settings/           # 应用设置
│   ├── components/             # 跨 feature 通用组件（对 Fluent 的封装与组合）
│   ├── shared/                 # 与业务无关：utils / hooks / constants
│   ├── api/                    # 后端访问层（invoke 唯一出口）
│   │   ├── client.ts           # invoke 封装与错误归一化
│   │   ├── generated/          # tauri-specta 产物（提交入库，禁止手改）
│   │   └── items.ts            # 按资源分文件的手写封装（示例）
│   ├── stores/                 # 全局 UI 状态（Zustand，只放 UI 态）
│   ├── styles/                 # 全局样式与 Fluent 主题定制（tokens）
│   └── types/                  # 纯前端类型（后端 DTO 一律用 generated）
│
├── src-tauri/
│   ├── capabilities/
│   │   └── main.json
│   ├── migrations/             # SQL 迁移（sqlx 约定路径，勿移动）
│   ├── icons/
│   ├── tests/                  # Rust 集成测试：状态机、ChangeSet、不变式
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs             # 最小启动入口
│       ├── lib.rs              # Tauri Builder，声明顶层模块
│       ├── state.rs            # 组合根：构造 infra 实现，注入 services
│       ├── interfaces.rs       # 模块门面：声明子模块 + 再导出公共 API
│       ├── interfaces/         # 入站适配层
│       │   ├── ipc.rs          # 门面；commands 按资源分文件放 ipc/
│       │   ├── ipc/            # Tauri commands（UI 入口，进程内受信，含 DTO）
│       │   ├── http.rs         # 门面；MCP 本地 API（令牌、回环绑定、Origin 校验）
│       │   └── http/           # axum 路由与 DTO
│       ├── services.rs         # 模块门面：声明子模块 + 再导出公共 API
│       ├── services/           # 应用层：查询、变更集编排、基线确认、影响分析
│       ├── domain.rs           # 模块门面：声明子模块 + 再导出公共 API
│       ├── domain/             # 领域层：不变式与规则的唯一归属
│       │   ├── item.rs         # Item、状态机、编号规则、依赖环检测
│       │   ├── relation.rs     # Relation 语义与引用完整性
│       │   ├── changeset.rs    # ChangeSet：显式变更操作列表（preview/apply 基础）
│       │   ├── revision.rs     # 不可变修订、乐观并发
│       │   ├── baseline.rs     # 基线
│       │   ├── task.rs         # TASK-* 任务
│       │   ├── snapshot.rs     # 确定性快照的格式与排序规则（业务规则）
│       │   └── ports.rs        # Storage trait 等端口（domain 定义，infra 实现）
│       ├── infra.rs            # 模块门面：声明子模块 + 再导出公共 API
│       └── infra/              # 技术设施：换存储/换框架时才跟着变的代码
│           ├── storage.rs      # 门面：声明 sqlite，再导出 SqliteStorage
│           ├── storage/
│           │   └── sqlite.rs   # 事务、乐观并发、修订审计在单个事务内实现
│           └── tray.rs         # 托盘与窗口生命周期
│
├── mcp-bridge/                 # Plugin 分发的轻量 MCP 连接器（语言与打包待定）
├── tests/                      # UI 端 e2e（tauri-driver / Playwright）
└── docs/
```

## 分层规则

- **domain 不贫血**：不变式（编号唯一、合法状态迁移、依赖环检测、禁止物理删除）
  写在 `domain/`；`services/` 只做跨对象编排，不复制规则。
- **端口只表达意图**：`ports.rs` 中的 Storage trait 只暴露意图级原子操作
  （`apply_change_set`、`transition_item` 等），事务是 infra 内部实现细节，
  不跨层暴露事务对象。需要"多步写入放一个事务"时，为端口新增具名方法，
  而不是开通用事务逃生舱。
- **infra 只收技术设施**：判断标准是"换 SQLite 为 PostgreSQL、换 axum 为其他框架时
  会跟着变的代码"。快照的固定顺序与格式是业务规则，在 `domain/snapshot.rs`；
  只有文件写出属于基础设施。PostgreSQL 实现将随 Remote Server 宿主出现
  （见"远程形态候选"），桌面应用内不新增 postgres 存储实现。
- **interfaces 内部保持 ipc/http 分离**：前者是进程内受信调用，后者承载令牌、
  回环绑定和 Origin 校验，各自定义 DTO，不共用 handler。
- **测试归位**：Rust 集成测试放 `src-tauri/tests/`，顶层 `tests/` 只放 UI e2e。
- **模块声明统一 2018 风格**：目录模块一律用同名 `.rs` + 目录（如 `storage.rs` +
  `storage/`），禁止 `mod.rs`。门面文件只做 `pub mod` 声明与 `pub use` 再导出；
  跨层、跨模块引用只走再导出的公共 API，不得深路径引用内部模块。

## 前端规则

- **依赖方向单向**：`app → features → components/shared/api`。components、shared、
  api 不得 import features；feature 之间只通过对方的 `index.ts` 导入。
- **服务端状态只归 TanStack Query**：每个 feature 在自己的 `queries.ts` 里定义
  query/mutation；禁止把后端数据复制进 Zustand，`stores/` 只放 UI 状态。
- **类型一律来自 `api/generated`**：后端 DTO 由 tauri-specta 生成，禁止手抄；
  `invoke` 只允许出现在 `api/` 目录，组件不直接调后端。
- **feature 内部结构固定**（components / hooks / queries / types / index），
  新 feature 照抄，不得自创结构。
- **测试 colocate**：组件测试写在同目录（`*.test.tsx`），改组件必须同步改测试。
- **UI 基建钉死**：组件库只用 `@fluentui/react-components`（Fluent UI v9），
  禁止引入 v8 的 `@fluentui/react`（两者 API 完全不同，极易混淆）；样式统一走
  Griffel 与 design tokens，不引入 Tailwind 或第二套组件库。dnd-kit、@xyflow、
  CodeMirror 不属组件库，照常使用，按 Fluent 色板定制主题。

## 运行期数据位置（本地模式）

本地模式的数据根目录为用户主目录下的 `~/.relayharbor/`（Windows 即
`%USERPROFILE%\.relayharbor`），不使用 `%APPDATA%`。路径解析是 infra 关注点
（`dirs::home_dir()`），领域层不知晓数据根目录的位置。点前缀目录在 Windows
资源管理器默认不隐藏，与 `.vscode`、`.cargo` 等工具一致，不做特殊处理。

```
~/.relayharbor/
├── settings.json      # 应用设置（infra/settings.rs 读写）
├── harbor.db          # 单一 SQLite 库：全部项目数据与项目注册表
└── runtime/
    └── bridge.json    # 本地 API 端口与令牌（mcp-bridge 发现用）
```

- **单一数据库**：所有项目共用一个 SQLite 文件，`projects` 表即注册表
  （id、名称、关联仓库路径）。隔离是领域层职责——所有业务表带
  `project_id`，唯一约束形如 `UNIQUE(project_id, display_code)`，项目设置表
  为每项目一行（`project_settings(project_id, data)`）；"项目隔离数据、编号
  空间和配置"由查询与约束保证，不靠文件布局。
- **代价与对策**：单项目迁移到其他机器需要导出例程（确定性快照面向审查，
  全保真导出按需再补）；库损坏影响所有项目，以确定性快照加 `VACUUM INTO`
  备份缓解（勿直接拷贝 WAL 模式下的活动库文件）；删除项目是事务性删除
  （级联清理、显式确认、建议先导出快照），偶发 VACUUM 回收空间。
- **收益**：单连接即可，`state.rs` 最简；Schema 迁移只跑一次；将来跨项目
  关系（概览未来候选）同库自然成立；远程平移对称——schema 加 `project_id`
  列即可迁入 Server 端 PostgreSQL。
- **便携模式为未来候选**：若启用，检测 exe 同目录的标记文件后将数据根目录
  覆盖为 exe 相对路径，其余规则不变；`bridge.json` 的发现位置随之同步。
- `runtime/bridge.json` 属运行期文件，包含访问令牌，权限收紧、随会话轮换。

## 远程形态候选（Remote Server）

远程演进形态为独立 Server 宿主，不是"桌面应用直连远程数据库"：

- 同一领域核心（domain + services）抽为共享 crate（如 `crates/rh-core`），
  Server（`crates/rh-server`）与桌面应用同为宿主；Server 侧新增认证、
  RBAC 与 PostgreSQL 存储（`crates/rh-storage-pg`）。
- 单写者原则从"单进程"升级为"单服务"：桌面应用不得在本地跑领域服务直写
  远程库（智能客户端共享库为反模式）。
- 桌面端不设全局 Remote 开关：后端选择以项目为单位（项目的数据归属 =
  本地库或某个 Server 连接），本地项目与远程项目在项目列表中并存、可同时
  打开。应用的命令路由层按项目句柄分发到 Local 或 Remote 后端，两者实现
  同一套操作签名；UI（ipc）与 MCP（http）共用这套路由。
- **MCP 连接器只对接本地桌面**：无论项目归属本地还是远程，连接器一律
  转发到本地应用的受控接口，远程项目由应用携带已登录凭据转发 Server。
  连接器因此不持有任何用户凭据，bridge.json 仍是唯一引导文件。代价：
  Agent 的工作依赖桌面应用存活（连接器可拉起应用，与 OQ-004 一致），
  且应用需正确透传远程调用的结果与错误。
- 两条硬规则：单一项目任一时刻只有一个数据归属，本地↔远程迁移是一次性
  导出导入，不是双向同步；跨归属的聚合（全局搜索、跨项目关系图）由客户
  端分别取数后内存合并，不做跨库 JOIN。
- 现在不做任何超前实现，仅以纪律保住可移植性：domain/services 不依赖框架；
  service 操作签名即 API 契约（含 CallContext/actor），审计记录从第一天
  带 actor 字段。
