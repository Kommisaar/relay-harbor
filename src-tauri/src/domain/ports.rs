//! 存储端口（INT-004 / ADR-002）：意图级原子操作 trait。
//! 定义于 domain、实现在 infra/storage；每写方法一个 BEGIN IMMEDIATE 事务。
//! 契约（方法面与事务边界）见 docs/design/05-detailed-design/data-model.md。
