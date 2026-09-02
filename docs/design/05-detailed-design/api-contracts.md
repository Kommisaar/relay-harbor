# API 与消息契约

> 状态：草稿
> 关联：INT-001～006、CMP-002/003/008、ADR-004/005/006、UC-001～016

权威契约的生成方式：ipc 命令与事件 payload 的类型由 tauri-specta 从
Rust DTO 生成（`api/generated`，提交入库）；MCP 工具的 JSON Schema 由
MCP 协议层从同一批 Rust 类型导出。本文解释关键语义，不重复维护完整
字段表。

## INT-002 本地 MCP API（工具契约）

- 版本：MCP Streamable HTTP；握手交换 appVersion / schemaVersion /
  minBridgeVersion，不兼容返回 ERR_VERSION_MISMATCH（UC-009 A3）
- 调用方：mcp-bridge（INT-003 背后是 MCP 客户端）
- 提供方：CMP-003

### 工具清单（M1）

| 工具 | 参数（要点） | 返回 | 语义备注 |
| --- | --- | --- | --- |
| `create_project` | name, repo_path? | project_id, name | 名称不唯一（DOM-001） |
| `delete_project` | project_id, confirm: true | 删除统计（条目/关系/修订数） | 未带 confirm 拒绝；级联事务（BR-011） |
| `create_item` | project_id, type, title, body_md, metadata? | code, revision=1 | 编号领域分配（BR-001） |
| `edit_item` | project_id, code, expected_revision, title?, body_md?, metadata? | code, new_revision, status | 标题/正文变更触发退回（BR-009），返回的 status 反映；终态条目拒绝 |
| `transition_item` | project_id, code, to, superseded_by?, confirm? | code, status | 白名单校验（BR-002）；to=superseded 必带 superseded_by；to=cancelled 必带 confirm |
| `add_relation` | project_id, source, target, type | relation_id（幂等：已存在返回原 id） | 悬空/成环拒绝（BR-006/007） |
| `remove_relation` | project_id, source, target, type | ok | 不存在的组合返回 ok（幂等） |
| `get_item` | project_id, code, include?: relations, revisions | 条目详情 | 修订默认只回当前，include 可选 |
| `search_items` | project_id, q, type?, status? | 摘要列表 | 编号精确/前缀 + 标题正文匹配 |
| `get_context` | project_id, code, depth? | 入边闭包结果（受影响集合） | 影响定位的 Agent 侧形态：derives/satisfies/depends 反向多跳，depth 默认 3、上限 10 |
| `get_project_state` | project_id | 概况（各类型/状态计数） | 看板与总览数据源 |
| `validate` | project_id | 问题清单 | M1：悬空、终态语义、反向对提示（03 待确认项之一） |

### 错误码与恢复方式

| 错误码 | 语义 | 调用方恢复 |
| --- | --- | --- |
| ERR_UNAUTHORIZED | 令牌缺失/失效 | 重新发现（UC-009 A2） |
| ERR_VERSION_MISMATCH | 版本握手失败 | 升级 Plugin 或应用，不重试 |
| ERR_NOT_FOUND | 项目/条目/关系不存在 | 检查标识，不重试 |
| ERR_VALIDATION | 参数/结构校验失败 | 修正后重试 |
| ERR_CONFLICT | 期望修订号不一致（BR-005） | get_item 取最新后重组变更 |
| ERR_TRANSITION_ILLEGAL | 迁移不在白名单（BR-002） | 按返回的允许目标修正 |
| ERR_CYCLE | depends 成环（BR-007） | 按返回的环上条目序列调整 |
| ERR_DANGLING | 关系端点不存在（BR-006） | 先创建端点条目 |
| ERR_TERMINAL | 终态条目不可变更 | 改编辑替代者或新建条目 |
| ERR_INTERNAL | 未分类内部错误 | 可安全重试（事务保证无半写） |

### 幂等、顺序、重复与重试语义

- 全部写工具经 ChangeSet 单事务：失败无副作用，重试安全（NFR-009）；
- 网络层重试（bridge 透传重连）可能造成同参数重复提交：创建类工具
  幂等键为业务键（同 display_code 不会重复——编号领域分配；add_relation
  天然幂等）；edit_item 依赖 expected_revision，重复提交第二次必得
  ERR_CONFLICT——这是设计行为，不是缺陷；
- 无异步消息、无顺序保证需求（同步请求/响应）。

### 兼容与废弃策略

工具只增不改签名；参数新增必须可选；废弃先标记 deprecated（工具描述）
再移除，间隔至少一个次版本。

## INT-001 Tauri IPC 只读命令通道

- 版本：随应用（specta 生成，构建期类型检查）
- 调用方：CMP-001 前端；提供方：CMP-002

### 命令清单（完整白名单）

查询：`list_projects`、`get_project_state`、`list_items`（按类型/状态/
过滤）、`get_item_detail`、`get_item_revisions`、`get_relations`、
`get_task_board`、`search_items`、`get_impact`（影响定位）、
`list_recent_revisions`（project_id, limit → 跨条目修订摘要倒序：
display_code、标题、revision_no、actor、summary、changed_at；
2026-08-28 界面设计新增，概览页最近修订支撑，UI-011/FR-018）
导出：`export_markdown`（project_id, scope?, target_path）
设置：`get_settings`、`set_settings`（仅应用设置，非业务数据）

**名单即白名单**：CI 断言命令集合与本清单一致，且不含任何业务写命令
（CON-009/ADR-006 机器校验）。

### data-changed 事件（反向，Rust → WebView）

```text
事件名：data-changed-event
（偏差注记 2026-08-27：tauri-specta 从 DataChangedEvent 结构名自动生成线名，
不支持自定义；收发两端均由同一生成产物约束，语义不变，原拟名 data-changed 作废）
payload（specta 类型 DataChangedEvent）：
  projectId: string        // 失效粒度：项目级
  kinds: ("item"|"relation"|"task"|"project")[]  // 变更类别
  revision?: number        // 触发变更集的最大新修订号（诊断用）
  code?: string            // 主条目编号（可空）
```

前端约定：全局唯一监听点（`app/providers`）；所有 query key 以
`["projects", projectId, ...]` 为前缀；收到事件即
`invalidateQueries({ queryKey: ["projects", projectId] })`。事件只失效
不传数据；尽力送达，丢失场景由 refetchOnWindowFocus 兜底。

## INT-003 MCP stdio 通道

bridge 以标准 MCP stdio server 面向客户端；语义同 INT-002，无独立契约。
桥接会话（客户端 initialize）在 bridge 侧应答版本信息后透传应用握手
结果，避免双跳不一致。

## INT-005 bridge.json 发现文件

```json
{
  "version": 1,
  "port": 53712,
  "token": "<每会话随机 256bit>",
  "pid": 12345,
  "protocolVersion": "2025-06-18",
  "updatedAt": "2026-08-27T10:00:00Z"
}
```

写出：临时文件 + 原子 rename；权限仅当前用户；应用启动与令牌轮换时
刷新。读取方仅 bridge；version 字段保证格式演进可检测。

## INT-006 导出产物

目录结构（确定性规则，domain/snapshot.rs 拥有排序与格式）：

```text
<target>/
├── README.md            # 项目信息、条目统计、导出时间
├── relations.md         # 全部关系索引（按源编号排序）
└── <type-dir>/          # 每类型一目录（14 类，仅有条目才出现）
    ├── README.md        # 类型索引（编号、标题、状态）
    └── <NNN>-<slug>.md  # 每条目一文件：元数据头 + 正文 + 修订摘要
```

确定性要求：目录按类型固定序、文件按编号排序、内容含状态与当前修订
信息、同数据两次导出字节一致（FR-014）；M2 导入按同一结构逆向解析。
默认仅当前修订 + 修订历史摘要（UC-016 开放问题在此定案）。
