# ADR-008 M1 单 crate 落地，远程演进时再抽共享 crate

- 状态：已接受（随 04 架构基线确认）
- 驱动因素：CON-008、00 概览"远程形态候选"、ADR-001

## 背景

远程形态规划已明确：domain + services 抽为共享 crate（如 `rh-core`），
Remote Server（`rh-server`）与桌面应用同为宿主，PostgreSQL 存储
（`rh-storage-pg`）随 Server 出现。问题是 M1 就搭 workspace 多 crate，
还是单 crate 起步。

## 候选方案

- **M1 单 crate**（`src-tauri` 内以模块承载四层，边界用 lint 强制）；
- M1 即 workspace 多 crate（rh-core / rh-tauri / rh-bridge 分离）：
  边界物理化，但远程需求未立项，多 crate 的版本协调与重构摩擦提前支付；
- Monorepo 一次性含 server：纯投机实现，违反零投机纪律。

## 决策

M1 单 crate。四层以模块边界存在，纪律保住可移植性：domain/services
不依赖框架（ADR-001）；service 操作签名即 API 契约，从第一天带
CallContext/actor；审计记录带 actor 字段（BR-004 已落实；2026-09-03
用户指令修订记录移除 actor、actor 保留于 CallContext 与操作日志）。Remote
Server 立项时执行既定抽取路径（rh-core / rh-server / rh-storage-pg），
mcp-bridge 因需随 Plugin 独立分发，自始就是独立构建单元（不受本决策
影响）。

## 主要理由

- 零投机实现：不维护没有任何消费者的抽象边界；
- 单 crate 内 lint 同样能强制依赖方向（CON-008），抽 crate 时模块边界
  即 crate 边界，迁移是搬运而非重写；
- RBAC 等远程前置的"保险丝"（actor 字段、签名契约）已在需求与领域层
  落位，不依赖 crate 结构。

## 代价与后果

- 抽 crate 时有一次机械性重构（模块 → crate），成本可控但非零；
- 单 crate 内模块深层引用的风险由 lint 封堵。

## 验证或重新评估条件

- 抽取触发条件：Remote Server 正式立项，或桌面应用与 server 需要并行
  开发同一 domain；
- 抽取前的持续验证：CI 边界 lint 保持绿色。
