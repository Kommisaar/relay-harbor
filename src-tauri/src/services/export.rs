//! 导出编排（CMP-004 + CMP-007）：取导出快照（单次取数）→ domain/snapshot
//! 确定性格式化 → SnapshotWriter 写盘。目标已存在拒绝、失败清理、
//! 进度回调（reading → rendering → writing → done，interfaces 层转事件）。
//!
//! 偏差留痕 2026-09-05：modules/export.md「大项目导出异步执行（任务句柄 +
//! 进度事件）」——M1 采用同步命令 + 进度事件推送（导出期间 JS 侧 promise
//! 挂起、UI 线程不阻塞、骨架屏持续，万级规模秒级内完成）；任务句柄与
//! 取消机制留 NFR-002 实测不达标时再引入（与 LIKE 搜索同一渐进哲学）。

use std::path::PathBuf;
use std::sync::Arc;

use crate::domain::item::ItemType;
use crate::domain::ports::{SnapshotWriter, Storage, StorageError};
use crate::domain::snapshot::build_file_list;

/// 导出形态（UI ExportOptions.form）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportForm {
    Directory,
    Zip,
}

/// 导出结果（UI ExportResult）
#[derive(Debug, Clone, PartialEq)]
pub struct ExportOutcome {
    pub path: PathBuf,
    pub file_count: usize,
}

/// 导出错误（interfaces 映射 UI 短码：EXPORT_SCOPE_EMPTY / EXPORT_TARGET_EXISTS /
/// EXPORT_IO / ERR_INTERNAL）
#[derive(Debug, Clone)]
pub enum ExportError {
    /// scope 过滤后无可导出条目（mock 口径 EXPORT_SCOPE_EMPTY）
    ScopeEmpty,
    TargetExists,
    Io(String),
    Storage(StorageError),
}

impl From<StorageError> for ExportError {
    fn from(e: StorageError) -> Self {
        ExportError::Storage(e)
    }
}

impl std::fmt::Display for ExportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExportError::ScopeEmpty => write!(f, "导出范围为空"),
            ExportError::TargetExists => write!(f, "目标已存在"),
            ExportError::Io(msg) => write!(f, "导出写盘失败：{msg}"),
            ExportError::Storage(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ExportError {}

pub struct ExportService {
    storage: Arc<dyn Storage>,
    writer: Arc<dyn SnapshotWriter>,
}

/// 进度回调签名（percent 0..=100，phase 与 mock 阶段名一致）。
/// Send 约束：tauri 异步命令的 future 必须 Send（回调经事件发射器闭包注入）。
pub type ProgressFn<'a> = dyn FnMut(u32, &str) + Send + 'a;

impl ExportService {
    pub fn new(storage: Arc<dyn Storage>, writer: Arc<dyn SnapshotWriter>) -> Self {
        Self { storage, writer }
    }

    /// 执行导出。`types` = scope 类型过滤（None = 全量）。
    pub async fn export(
        &self,
        project_id: crate::domain::project::ProjectId,
        types: Option<Vec<ItemType>>,
        form: ExportForm,
        target: PathBuf,
        progress: &mut ProgressFn<'_>,
    ) -> Result<ExportOutcome, ExportError> {
        progress(12, "reading");
        // 项目存在性（EXPORT 流程报 PROJECT_NOT_FOUND）
        if self
            .storage
            .get_project(project_id)
            .await?
            .is_none()
        {
            return Err(ExportError::Storage(StorageError::NotFound {
                kind: crate::domain::ports::NotFoundKind::Project,
                id: project_id.to_string(),
            }));
        }
        let snapshot = self
            .storage
            .export_snapshot(project_id)
            .await?
            .expect("项目存在性已校验");

        progress(45, "rendering");
        let scope = types.as_deref();
        let files = build_file_list(&snapshot, scope);
        // scope 过滤后零条目 → EXPORT_SCOPE_EMPTY（通用目录无条目即空 scope）
        let has_items = !snapshot.items.is_empty() && {
            let scope_types = scope;
            snapshot
                .items
                .iter()
                .any(|i| scope_types.is_none_or(|t| t.contains(&i.item_type)))
        };
        if !has_items {
            return Err(ExportError::ScopeEmpty);
        }

        progress(78, "writing");
        let writer = self.writer.clone();
        let file_count = files.len();
        // ExportFile（domain 产物）→ SnapshotFile（端口形态）
        let snapshot_files: Vec<crate::domain::ports::SnapshotFile> = files
            .into_iter()
            .map(|f| crate::domain::ports::SnapshotFile {
                path: f.path,
                content: f.content,
            })
            .collect();
        let target_display = target.display().to_string();
        let target_for_write = target.clone();
        let result = tokio::task::spawn_blocking(move || match form {
            ExportForm::Directory => writer.write_directory(&target_for_write, &snapshot_files),
            ExportForm::Zip => writer.write_zip(&target_for_write, &snapshot_files),
        })
        .await
        .map_err(|e| ExportError::Io(format!("写盘任务失败：{e}")))?;
        match result {
            Ok(()) => {}
            Err(crate::domain::ports::SnapshotWriteError::TargetExists) => {
                return Err(ExportError::TargetExists);
            }
            Err(crate::domain::ports::SnapshotWriteError::Io(msg)) => {
                return Err(ExportError::Io(msg));
            }
        }

        progress(100, "done");
        tracing::info!(project = %project_id, files = file_count, target = %target_display, "导出完成");
        Ok(ExportOutcome {
            path: target,
            file_count,
        })
    }
}
