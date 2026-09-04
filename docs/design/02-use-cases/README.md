# 用例

> 状态：已确认（2026-08-27；2026-09-04 修订循环 +UC-019，待重新确认）
> 关联：01 需求（2026-08-27 定位修订稿，已确认；2026-09-04 +FR-019）

## 参与者汇总

3 类参与者（详见 [actors.md](actors.md)）：

- **ACT-001 开发者**：业务数据只读 + Markdown 导出（M1 唯一人类参与者）；
- **ACT-002 设计与规划 Agent**：唯一业务写入方，经 MCP（本地受控 API +
  会话令牌）操作；
- **ACT-003 系统环境**：支持参与者（托盘、单实例、文件系统、回环网络）。

## 关键用例

用例共 19 个：Agent 写入与查询 10 个（UC-001～009、UC-019）、开发者浏览与
导出 9 个（UC-010～018）。其中 6 个复杂或高风险用例有详细规约：

| 用例 | 风险点 |
| --- | --- |
| [UC-004 编辑条目产生修订](cases/uc-004-edit-item.md) | 乐观并发、BR-009 退回语义、原子性 |
| [UC-005 迁移条目状态](cases/uc-005-transition-item.md) | 状态白名单、终态显式语义 |
| [UC-006 建立或移除关系](cases/uc-006-manage-relation.md) | 悬空引用、依赖环检测 |
| [UC-009 建立 MCP 会话](cases/uc-009-mcp-session.md) | 发现/拉起、令牌轮换、版本握手 |
| [UC-015 影响定位](cases/uc-015-impact-analysis.md) | 多跳遍历语义与性能 |
| [UC-016 导出 Markdown 文档集](cases/uc-016-export-markdown.md) | 确定性、失败不污染 |

其余 13 个为简单创建、查询或展示流程，目录登记即可（见
[catalog.md](catalog.md)），行为由关联 BR/NFR 承载。

## 需求覆盖情况

| 需求 | 承载用例 |
| --- | --- |
| FR-001 MCP 接入与工具集 | UC-009（通道）+ UC-001～008（工具） |
| FR-002 项目管理（MCP） | UC-001、UC-002 |
| FR-003 条目创建与编辑（MCP） | UC-003、UC-004 |
| FR-004 稳定编号分配 | UC-003（BR-001 承载规则） |
| FR-005 条目状态迁移（MCP） | UC-005 |
| FR-006 关系管理（MCP） | UC-006 |
| FR-007 任务管理（MCP） | UC-007（复用 UC-003/004 机制） |
| FR-008 项目浏览与切换（UI） | UC-010 |
| FR-009 条目浏览与详情（UI） | UC-011 |
| FR-010 关联展开（UI） | UC-012 |
| FR-011 任务看板（只读 UI） | UC-013 |
| FR-012 关键词搜索（UI） | UC-014 |
| FR-013 影响定位（UI） | UC-015 |
| FR-014 Markdown 导出（UI） | UC-016 |
| FR-015 托盘常驻与单实例 | UC-017 |
| FR-016 应用设置 | UC-018 |
| FR-019 项目级文档维护（MCP） | UC-019 |

NFR 承载：NFR-001（UC-004 E1）、NFR-002（UC-006/008/015）、NFR-003
（UC-009 A1、UC-017）、NFR-005（UC-009）、NFR-006（UC-009 A3）、
NFR-008（全部 UI 用例）、NFR-009（UC-004/005/006）。

M1 全部 FR 均有用例承载（2026-08-27 基线 16 条 + 2026-09-04 FR-019），
无待覆盖项。

## 子文档

- [actors.md](actors.md)
- [catalog.md](catalog.md)
- cases/ 下的详细规约：
  - [uc-004-edit-item.md](cases/uc-004-edit-item.md)
  - [uc-005-transition-item.md](cases/uc-005-transition-item.md)
  - [uc-006-manage-relation.md](cases/uc-006-manage-relation.md)
  - [uc-009-mcp-session.md](cases/uc-009-mcp-session.md)
  - [uc-015-impact-analysis.md](cases/uc-015-impact-analysis.md)
  - [uc-016-export-markdown.md](cases/uc-016-export-markdown.md)

## 阻塞问题

无。BR-009 已随用例基线定稿（编辑已确认条目退回评审中）。

进入 03 领域模型的议题（已在规约中标注）：五种关系的方向语义与类型约束
（UC-006/UC-015 共同依赖）、替代关系的存储形态（UC-005）、纯元数据修改
是否触发退回（UC-004）。
