# 应用服务层（services）

> 状态：草稿
> 组件：CMP-004
> 承载：UC-001～008、UC-015/016 编排

## 责任

- 写路径：把 MCP 工具参数组装为 ChangeSet → domain 校验 → 端口原子提交
  → 返回变更摘要（code、new_revision、status、kinds）；
- 读路径：项目/条目/关系/看板/搜索/影响闭包查询（供 ipc 与 http 共用）；
- 导出编排：取数 → domain/snapshot 格式化 → 交 infra 写盘；
- CallContext：每操作携带（actor 标识、入口来源），入结构化操作日志
  （NFR-007；远程演进的签名保险，ADR-008）——修订记录不含 actor
  （2026-09-03 用户指令），变更者审计由日志承载。

## 不负责

- 规则判定（domain）；SQL 与事务；协议与 DTO（interfaces）；
  事件发射（interfaces 层消费返回的变更摘要后自发）。

## 公开接口

进程内方法，操作签名即契约（M1 入口：interfaces/ipc 与 interfaces/http）；
工具/命令到方法的映射见 api-contracts.md 两张清单。

## 内部协作者

domain（校验）、ports::Storage（读写）、infra（导出写盘经端口化的
SnapshotWriter）。

## 关键规则

- 写操作一律先组 ChangeSet 再提交——细粒度工具（edit_item 等）内部
  同样如此，无旁路（NFR-009 唯一路径）；
- 变更摘要（ChangeSummary）是返回值的一部分：interfaces/http 以此发射
  data-changed 事件（ADR-006 的发射点设计）；
- 影响闭包（get_context / get_impact 共用）：入边 BFS，depth 上限 10、
  访问集去重防环兜底（depends 无环已由写入保证）。

## 状态与数据

无状态服务对象，组合根单例装配。

## 错误处理

透传 domain 错误；存储错误包装为 ERR_INTERNAL（保留 cause 链供日志）。

## 并发与一致性

读路径无锁（WAL 快照）；写路径串行于端口事务（BEGIN IMMEDIATE）；
不缓存业务数据。

## 可观测性

每次写操作记录一条结构化摘要（actor、操作、条目、修订号）→ NFR-007。

## 测试要点

- 集成：工具语义端到端（组 ChangeSet → 提交 → 读回断言）；
- 原子性注入失败点（NFR-009 验证方式）；影响闭包多跳与去重。

## 开放问题

无。
