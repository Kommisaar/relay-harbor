# ADR-003 单一 SQLite 库作为本地数据源

- 状态：已接受（随 04 架构基线确认）
- 驱动因素：CON-003、NFR-001、NFR-004、NFR-006、BR-011、DOM-001

## 背景

需要决定本地数据的物理布局：一个库还是每项目一个库；数据放在哪里；
如何备份与迁移 Schema。单用户桌面形态，写入者只有应用进程（M1 经 MCP）。

## 候选方案

- **单一 SQLite**（`~/.relayharbor/harbor.db`，所有项目共库，业务表带
  `project_id`，`UNIQUE(project_id, display_code)` 类约束隔离）；
- 每项目一个库文件（`projects/<uuid>/`）：物理隔离直观，但连接管理、
  跨项目查询、迁移执行都按项目倍增，注册表仍需另建；
- 桌面直连 PostgreSQL：违背单机离线可用，远程形态另有归属（OQ-003）。

## 决策

单一 SQLite 库，WAL 模式，sqlx 访问，迁移放 `src-tauri/migrations/`；
应用设置存 `~/.relayharbor/settings.json`（infra 读写）；运行期引导文件
`~/.relayharbor/runtime/bridge.json`。数据根目录解析（`dirs::home_dir()`）
是 infra 关注点，domain 不知晓路径。

## 主要理由

- 单连接、组合根最简；Schema 迁移只跑一次（NFR-006 的迁移矩阵最小化）；
- 隔离是领域职责（project_id 约束），不是文件布局职责，与 DOM-001 聚合
  根一致；
- 远程平移对称：schema 加归属列即可整体迁入 Server 端 PostgreSQL；
  未来跨项目关系（概览候选）同库自然成立。

## 代价与后果

- 单项目迁移到其他机器需要导出例程（M1 用文件级备份 + M2 确定性快照
  承接，NFR-004）；
- 库损坏影响所有项目：以 `VACUUM INTO` 定期备份缓解，禁止直接拷贝 WAL
  活动库文件；
- 删除项目后空间回收依赖偶发 VACUUM。

## 验证或重新评估条件

- WAL 崩溃恢复测试（NFR-001 验证方式）；备份→恢复→一致性校验（NFR-004）；
- 重新评估触发：若单库规模显著超出 NFR-002 假设（万级条目、5 万级修订）
  或损坏事故实际发生，再评估分库或增量备份。
