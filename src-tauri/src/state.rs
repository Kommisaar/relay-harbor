//! 组合根（ADR-001）：进程内唯一装配点。
//!
//! 装配：RuntimePaths（数据根目录/日志）→ SqliteStorage（迁移 + 连接池）→
//! `Arc<dyn Storage>` 注入 Tauri 与 axum 两个入口（P5/P4 逐段接入）。
//! 日志 guard 挂在 AppState 上随进程存活（drop 即停写）。

use std::sync::Arc;

use crate::domain::ports::{Storage, StorageError};
use crate::infra::runtime::{init_logging, RuntimePaths};
use crate::infra::storage::SqliteStorage;

pub struct AppState {
    pub storage: Arc<dyn Storage>,
    pub paths: RuntimePaths,
    /// NFR-007：非阻塞日志线程句柄，随 AppState 存活
    _log_guard: tracing_appender::non_blocking::WorkerGuard,
}

impl AppState {
    /// 默认装配：`~/.relayharbor` 数据根目录
    pub async fn init() -> Result<Self, StorageError> {
        let paths = RuntimePaths::resolve_default().map_err(|e| {
            StorageError::Internal(format!("运行时目录初始化失败：{e}"))
        })?;
        Self::init_with(paths).await
    }

    /// 指定路径装配（测试注入临时目录）
    pub async fn init_with(paths: RuntimePaths) -> Result<Self, StorageError> {
        let log_guard = init_logging(&paths);
        tracing::info!(root = %paths.data_root.display(), "组合根装配");
        let storage = SqliteStorage::open(&paths.db_path).await?;
        Ok(AppState {
            storage: Arc::new(storage),
            paths,
            _log_guard: log_guard,
        })
    }
}
