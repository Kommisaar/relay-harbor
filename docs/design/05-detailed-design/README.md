# 详细设计

> 状态：已确认（2026-08-27）
> 关联：04 架构（已确认）

## 设计范围

需要详细设计（高失败成本 / 高不确定性 / 跨边界）：

| 路径 | 理由 | 承载文档 |
| --- | --- | --- |
| 数据模型与事务 | 迁移难逆、不变量承载、并发核心 | data-model.md |
| MCP 工具契约 | 唯一写入入口，Agent 直接消费，错误语义即可用性 | api-contracts.md |
| ipc 命令面 + 事件 payload | 只读白名单需机器可校验的权威清单 | api-contracts.md |
| 导出目录结构 | 确定性 + M2 导入逆向依赖 | api-contracts.md、modules/export.md |
| 领域与服务 | 规则唯一归属与编排路径 | modules/domain-core.md、services.md |
| 存储实现 | OCC/事务/迁移细节 | modules/storage-sqlite.md |
| 本地 API 层 | 鉴权/握手/错误映射/事件发射 | modules/local-mcp-api.md |
| bridge 拉起链路 | 跨进程恢复语义与时限 | modules/bridge.md、seq-002 |
| 写入全链路 | 原子性 + 事件顺序 | seq-001 |
| 前端结构与失效约定 | query key 前缀是事件机制前提 | modules/frontend.md |
| 界面结构与页面设计 | 9 页面 + 骨架，实现直接消费（2026-08-28 访谈定案） | ui/ |

留给实现（不文档化）：托盘菜单与窗口细节、settings 项的读写、UI 视觉
细节与组件树内部实现、specta 具体配置、SQL 语句、错误文案、CI 脚本
本身、zip 打包细节、MCP 协议层心跳参数。

## 模块清单

domain-core、services、storage-sqlite、local-mcp-api、bridge、frontend、
export（见 modules/）。

## 高风险交互清单

seq-001 MCP 写入（ChangeSet 原子提交 + 事件发射）、seq-002 bridge
发现/拉起/令牌轮换（15 秒就绪上限在此定案，UC-009 开放问题关闭）。

## 子文档

- [data-model.md](data-model.md)
- [api-contracts.md](api-contracts.md)
- modules/：[domain-core](modules/domain-core.md) ｜ [services](modules/services.md) ｜
  [storage-sqlite](modules/storage-sqlite.md) ｜ [local-mcp-api](modules/local-mcp-api.md) ｜
  [bridge](modules/bridge.md) ｜ [frontend](modules/frontend.md) ｜ [export](modules/export.md)
- interactions/：[seq-001-mcp-write](interactions/seq-001-mcp-write.md) ｜
  [seq-002-bridge-bootstrap](interactions/seq-002-bridge-bootstrap.md)
- ui/（2026-08-28 新增）：[界面设计总览](ui/README.md) ｜
  [app-shell](ui/app-shell.md) ｜ [patterns](ui/patterns.md) ｜
  pages/（project-list ｜ project-overview ｜ items ｜ item-detail ｜
  tasks ｜ search ｜ export ｜ settings）

## 阻塞问题

无。两处实现期决策已预埋验证条件：搜索用 LIKE（不达标升级 FTS5）、
bridge 实现语言（随 Plugin 联定，不影响契约）。
