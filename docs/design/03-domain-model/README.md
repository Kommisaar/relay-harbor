# 领域模型

> 状态：已确认（2026-08-27）
> 关联：01 需求（已确认）、02 用例（已确认）

## 核心概念

- DOM-001 项目：隔离编号空间与数据的聚合根，级联删除边界；
- DOM-002 条目：设计资产统一对象（类型不可变，单一状态字段按类型选状态机）；
- DOM-003 关系：项目内有向五种（derives/depends/satisfies/traces/relates），
  统一读作"A 对 B 做某事"（动者在前，2026-08-27 访谈确认）；
- DOM-004 修订：不可变内容快照，乐观并发凭据；
- DOM-005 变更集：原子提交单位（M1 直接提交，M2 加预览 UI）；
- DOM-006 任务：TASK 类型条目，任务状态机 + 派生阻塞；
- DOM-007 基线：M2 占位概念；
- DOM-008 稳定编号："前缀-序号"值对象，项目内唯一永不复用。

编号说明：`INV-*`（不变量）与 `SEQ-*`（时序）为本项目在 dev-toolkit
约定前缀之外引入的扩展编号，定义处见 domain-model.md 与
05/interactions/，用于跨文档精确引用。

## 关键不变量

INV-001～010 详见 [domain-model.md](domain-model.md)。对架构影响最大的：
编号唯一不复用（INV-001）、depends 无环（INV-002）、修订不可变且当前
内容 = 最新修订（INV-004）、变更集原子性（INV-009）、替代者链接完整性
（INV-006）。

## 模型边界

- **项目**为聚合根：编号空间、关系范围（不得跨项目）、级联删除均以项目为界；
- **条目**为一致性单元：编辑、迁移、乐观并发以条目当前修订号为粒度；
- **关系**跨条目但由领域服务在提交事务内统一校验；
- **写入入口唯一**：一切变更经变更集原子提交（MCP）；UI 只读（CON-009）。

## 子文档

- [domain-model.md](domain-model.md)
- [business-processes.md](business-processes.md)
- [state-models.md](state-models.md)

## 待确认问题

无。三项随阶段确认定稿（2026-08-27）：

- 项目名称**不要求唯一**（UUID 为身份，名称仅展示）；
- derives/satisfies 的反向对（A derives B 且 B derives A）不禁止、由 Agent
  自律——M2 考虑增加 validate 工具检查；
- traces/relates **不参与**影响定位遍历（仅作上下文展示）。
