# ADR-001 后端采用四层 DDD 分层与固定依赖方向

- 状态：已接受（随 04 架构基线确认；自《project structure.md》技术评审转正）
- 驱动因素：CON-002、CON-008、INV-001～010、NFR-006

## 背景

系统有两个业务入口（UI 的 Tauri IPC、Agent 的本地 MCP HTTP API），未来
还有第三宿主（Remote Server）。领域不变量（编号、状态机、环检测、修订
不可变）必须只有一份归属，否则多入口各写一套规则必然漂移。代码主要由
编码 Agent 产出、人不逐行审阅，边界必须能被机器校验。

## 候选方案

- **四层 DDD**（Interfaces / Services / Domain / Infra，依赖方向
  `interfaces → services → domain ← infra`，`state.rs` 组合根装配）；
- 经典三层（controller / service / dao）：入口逻辑与业务编排混在 service，
  双入口复用靠约定而非结构，领域规则易下沉到 DAO；
- 六边形＋无 services 层：端口适配器齐全但缺少应用编排层，跨对象流程
  （变更集、影响分析）会在适配器里重复；
- 单模块快速堆砌：M1 最快，但多入口与远程演进时无迁移路径。

## 决策

采用四层 DDD。domain 不依赖 `tauri::` / `sqlx::` / `axum::`；Storage 等
端口定义在 domain、实现在 infra；`state.rs` 为唯一组合根。模块声明统一
2018 风格（`storage.rs` + `storage/`，禁 `mod.rs`），门面文件只做
`pub mod` 与 `pub use`，跨层引用只走再导出 API。

## 主要理由

- 不变量与状态机唯一归属 domain，双入口天然共用同一套规则（UC-009 与
  UC-010～018 读到的是同一事实）；
- 远程演进 = 把 domain + services 抽为共享 crate 换宿主（ADR-008），
  分层边界就是将来的 crate 边界；
- 边界规则可被 CI 强制（依赖方向 lint、domain 依赖黑名单），契合
  CON-008 的机器可校验要求。

## 代价与后果

- 文件与门面样板多于扁平结构，对编码 Agent 是额外纪律成本（以模板与
  lint 抵消）；
- 简单查询也要穿过 interfaces → services 两跳。

## 验证或重新评估条件

- CI：domain 依赖黑名单（无 tauri/sqlx/axum）、跨层深路径引用检查；
- 重新评估触发：若 Remote Server 立项，按 ADR-008 抽 crate 而非改分层。
