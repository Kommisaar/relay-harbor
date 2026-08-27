# 领域层（domain）

> 状态：草稿
> 组件：CMP-005
> 承载：INV-001～010、BR-001～010、UC-001～007 写入规则

## 责任

- 实体与值对象：Item（含状态字段与 superseded_by）、Relation、Revision、
  ChangeSet、DisplayCode、ProjectRef；
- 规则判定：编号分配、状态白名单（双状态机）、环检测、悬空校验、
  退回判定（标题/正文 vs 元数据）、终态参数校验；
- 端口定义（ports.rs）：Storage trait（意图级原子操作，ADR-002）。

## 不负责

- 事务实现、SQL、路径、协议、事件发射、任何 IO。

## 公开接口

供 services 调用（进程内）；存储端口契约见 data-model.md 事务边界节。

## 内部协作者

- `item.rs`：状态机与编号规则；`relation.rs`：五类型语义与引用完整性；
  `changeset.rs`：变更操作列表与校验编排；`revision.rs`：修订与 OCC；
  `task.rs`：任务状态机与派生阻塞；`snapshot.rs`：导出确定性格式规则；
  `baseline.rs`：M2 占位。

## 关键规则

- BR-001/INV-001：编号分配为纯函数（当前各前缀计数 → 下一序号），
  调用方为存储事务内的分配查询；
- BR-002/INV-005：`can_transition(type, from, to) -> Result`，白名单为
  唯一数据源（03 状态模型两张表）；
- BR-007/INV-002：环检测在 domain 实现（DFS 于 depends 子图，基于
  存储端口提供的关系快照），拒绝时返回环上序列；
- BR-009：`edit_effect(item, changed_fields) -> status`——标题或正文
  变更且状态为 confirmed 时产出 in_review，其余不变；
- INV-008：类型不可变（edit 变更集携带类型即 ERR_VALIDATION）。

## 状态与数据

无状态、无 IO；实体为纯数据 + 行为。

## 错误处理

领域错误枚举（映射 api-contracts 错误码：ERR_TRANSITION_ILLEGAL /
ERR_CYCLE / ERR_DANGLING / ERR_TERMINAL / ERR_CONFLICT / ERR_VALIDATION），
携带结构化上下文（环序列、允许目标列表）。

## 并发与一致性

不自行加锁；校验基于调用方（services）在事务内提供的数据快照，事务
隔离保证判定与落库之间无竞态。

## 可观测性

无日志依赖；拒绝原因结构化返回，由 services/interfaces 记录。

## 测试要点

- 状态机全迁移矩阵（合法/非法逐一断言）；
- 环检测构造与拒绝序列；退回判定的字段分组；编号不复用；
- 全部纯逻辑单测，无数据库依赖（`src-tauri/tests/`）。

## 开放问题

无。
