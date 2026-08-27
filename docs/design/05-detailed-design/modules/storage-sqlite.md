# 存储设施（infra/storage）

> 状态：草稿
> 组件：CMP-006
> 承载：NFR-001/002/006、INT-004、ADR-002/003

## 责任

- 实现 ports::Storage（意图级原子操作）于 sqlx + SQLite；
- 连接管理：单写连接池（写操作）+ 只读池（查询），WAL、
  busy_timeout=5000、foreign_keys=ON；
- 迁移执行（`src-tauri/migrations/`，启动时，版本检查防降级）；
- 单事务内完成：OCC 校验 → 变更落库 → 编号分配 → 修订追加（含 actor）；
- 备份原语：`VACUUM INTO`（NFR-004）。

## 不负责

- 业务规则（只执行 domain 已校验的意图）；路径解析（infra/runtime 提供
  数据根目录）；导出写盘（SnapshotWriter 另属 infra）。

## 公开接口

INT-004（Storage trait，domain 定义）；trait 方法与数据模型见
data-model.md。

## 内部协作者

sqlx（编译期校验 SQL）、infra/runtime（数据根目录与数据库路径）。

## 关键规则

- 每个端口写方法一个 `BEGIN IMMEDIATE` 事务，事务内首次操作即完成
  OCC 检查（`WHERE current_revision = expected`，0 行命中即冲突）；
- 编号分配在事务内 `MAX(seq)+1` 式取号（按前缀），配合
  `UNIQUE(project_id, display_code)` 兜底——并发冲突由唯一约束转译为
  重试（单进程下不发生，机制完备即可）；
- revisions 表无 UPDATE/DELETE 代码路径（测试断言 + 代码评审清单）。

## 状态与数据

连接池句柄由组合根构造注入；无业务状态。

## 错误处理

sqlx 错误分类映射：唯一约束冲突 → ERR_CONFLICT/ERR_VALIDATION（按约束），
busy → 等待后单次重试，其余 → ERR_INTERNAL。

## 并发与一致性

WAL 单写多读；写事务极短（无外部调用混入）；崩溃恢复依赖 WAL
（NFR-001 验证：强杀进程后重启校验）。

## 可观测性

迁移结果、每次写事务的摘要（操作、耗时、行数）入日志（NFR-007）。

## 测试要点

- OCC 冲突、级联删除（INV-010）、迁移矩阵（历史版本库逐个打开，
  NFR-006）、WAL 崩溃恢复、规模数据计时（NFR-002）。

## 开放问题

无。
