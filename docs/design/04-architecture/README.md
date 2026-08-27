# 架构

> 状态：已确认（2026-08-27）
> 关联：01 需求、02 用例、03 领域模型（均已确认）

## 架构驱动因素

- **质量属性**：NFR-001 数据可靠性（WAL、事务边界）、NFR-005 本地安全
  （回环 + 令牌）、NFR-006 升级兼容（迁移机制）、NFR-009 写入原子性
  （ChangeSet）；
- **关键场景**：UC-009 MCP 会话（唯一写入通道的建立与恢复）、UC-004～007
  Agent 写入（原子性与规则拒绝）、UC-016 导出（确定性与失败不污染）；
- **硬约束**：CON-001 Tauri v2、CON-002 四层 DDD、CON-009 UI 只读、
  CON-008 边界必须机器可校验；
- **规模假设**：单用户、万级条目 / 5 万级修订（NFR-002），无并发多写者
  （M1 单 Agent 串行为主，机制上不假设）；
- **最高不确定性**：本地 MCP API 的协议与安全细节、bridge 拉起链路的
  可靠性——均已以 ADR + 用例备选流程覆盖。

## 架构总览

见 [components.md](components.md)：双入站层（ipc 只读 / http 写入）共用
services 与 domain，单 SQLite 库，bridge 纯转发，托盘常驻单实例。

## 关键组件与决策

组件 8 个（CMP-001～008），决策 8 项：

| ADR | 一句话结论 |
| --- | --- |
| [ADR-001](decisions/adr-001-layered-architecture.md) | 四层 DDD、依赖方向固定、domain 零框架依赖 |
| [ADR-002](decisions/adr-002-intent-ports-changeset.md) | 意图级存储端口，ChangeSet 唯一原子单位，无事务逃生舱 |
| [ADR-003](decisions/adr-003-single-sqlite-db.md) | 单一 SQLite（WAL）+ `~/.relayharbor/` 数据根 |
| [ADR-004](decisions/adr-004-local-mcp-http-api.md) | 本地 API 直接讲 MCP（Streamable HTTP，回环 + 令牌 + 握手） |
| [ADR-005](decisions/adr-005-bridge-pure-gateway.md) | mcp-bridge 纯转发网关，bridge.json 唯一引导 |
| [ADR-006](decisions/adr-006-ipc-readonly-channel.md) | UI 走 Tauri IPC 只读命令，白名单 lint 强制 |
| [ADR-007](decisions/adr-007-frontend-stack.md) | React + TS + Fluent v9 + TanStack Query + Zustand + specta（无编辑器/无 dnd） |
| [ADR-008](decisions/adr-008-single-crate.md) | M1 单 crate 零投机，远程立项时抽 rh-core/rh-server/rh-storage-pg |

## 风险

- **写入唯一依赖应用存活**：bridge 拉起 + 托盘常驻缓解（00 概览已录）；
- **MCP 协议版本演进**：握手与最低版本检查（UC-009 A3），传输细节封闭
  在 `interfaces/http/`；
- **WebView2 环境差异**：系统 webview 兼容面靠禁 Chromium 独占 API +
  特性检测（CON-005）；
- **Agent 生成代码越界**：CI 三件套（TS 最严 + 依赖白名单 + 边界 lint）
  是唯一的结构性防线（CON-008），缺失即风险成立；
- **单库损坏**：`VACUUM INTO` 备份纪律 + M2 确定性快照。

## 子文档

- [components.md](components.md)
- [interfaces.md](interfaces.md)
- [deployment.md](deployment.md)
- decisions/：
  - [adr-001-layered-architecture.md](decisions/adr-001-layered-architecture.md)
  - [adr-002-intent-ports-changeset.md](decisions/adr-002-intent-ports-changeset.md)
  - [adr-003-single-sqlite-db.md](decisions/adr-003-single-sqlite-db.md)
  - [adr-004-local-mcp-http-api.md](decisions/adr-004-local-mcp-http-api.md)
  - [adr-005-bridge-pure-gateway.md](decisions/adr-005-bridge-pure-gateway.md)
  - [adr-006-ipc-readonly-channel.md](decisions/adr-006-ipc-readonly-channel.md)
  - [adr-007-frontend-stack.md](decisions/adr-007-frontend-stack.md)
  - [adr-008-single-crate.md](decisions/adr-008-single-crate.md)

## 阻塞问题

无。仓库根《project structure.md》自本阶段起降级为历史探索记录，技术
决策以本目录 ADR 为准（其内容与 ADR-001/002/003/005/007 一致，个别
条目按只读定位修订）。
