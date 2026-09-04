//! 存储设施（CMP-006）：sqlx + SQLite 实现 domain::ports。
//! 单写连接 + 只读池、WAL、busy_timeout=5000、foreign_keys=ON；
//! 迁移执行（../migrations，时间戳序、只向前）；VACUUM INTO 备份原语（NFR-004）。
//! 七表 Schema 与索引见 docs/design/05-detailed-design/data-model.md。
//! 子模块随实现任务在 storage/ 下展开（2018 风格）。
