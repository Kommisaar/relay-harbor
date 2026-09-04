//! 本地文件系统 SnapshotWriter（CMP-007）：目录形态（临时目录 + rename）
//! 与 zip 形态（临时文件 + rename）双实现，目标已存在一律拒绝、失败清理
//! 临时产物（modules/export.md 关键规则）。
//!
//! zip 字节确定性（FR-014）：条目时间戳固定为 DOS 纪元（1980-01-01），
//! 不随墙钟漂移；内容归 domain/snapshot。

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::domain::ports::{SnapshotFile, SnapshotWriteError, SnapshotWriter};

pub struct LocalSnapshotWriter;

impl LocalSnapshotWriter {
    pub fn new() -> Self {
        Self
    }

    fn ensure_absent(target: &Path) -> Result<(), SnapshotWriteError> {
        if target.exists() {
            return Err(SnapshotWriteError::TargetExists);
        }
        Ok(())
    }

    /// 临时产物路径（目标同级，避免跨卷 rename 失败）
    fn temp_path(target: &Path, suffix: &str) -> PathBuf {
        target.with_file_name(format!(
            ".relayharbor-export-{}{suffix}",
            Uuid::new_v4().simple()
        ))
    }

    /// 失败清理（尽力而为，清理失败不掩盖原错误）
    fn cleanup(path: &Path) {
        let _ = if path.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        };
    }
}

impl Default for LocalSnapshotWriter {
    fn default() -> Self {
        Self::new()
    }
}

impl SnapshotWriter for LocalSnapshotWriter {
    fn write_directory(
        &self,
        target: &Path,
        files: &[SnapshotFile],
    ) -> Result<(), SnapshotWriteError> {
        Self::ensure_absent(target)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| SnapshotWriteError::Io(e.to_string()))?;
        }
        let temp = Self::temp_path(target, ".d");
        let result = (|| -> Result<(), SnapshotWriteError> {
            fs::create_dir_all(&temp).map_err(|e| SnapshotWriteError::Io(e.to_string()))?;
            for file in files {
                // 相对路径以 '/' 分隔（domain 产出契约）；平台路径分隔归实现
                let rel = PathBuf::from(file.path.replace('/', std::path::MAIN_SEPARATOR_STR));
                let dest = temp.join(&rel);
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| SnapshotWriteError::Io(e.to_string()))?;
                }
                fs::write(&dest, &file.content)
                    .map_err(|e| SnapshotWriteError::Io(e.to_string()))?;
            }
            fs::rename(&temp, target).map_err(|e| {
                // rename 失败多为目标已被并发创建——按「已存在」语义报错
                if target.exists() {
                    SnapshotWriteError::TargetExists
                } else {
                    SnapshotWriteError::Io(e.to_string())
                }
            })?;
            Ok(())
        })();
        if result.is_err() {
            Self::cleanup(&temp);
        }
        result
    }

    fn write_zip(
        &self,
        target: &Path,
        files: &[SnapshotFile],
    ) -> Result<(), SnapshotWriteError> {
        Self::ensure_absent(target)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| SnapshotWriteError::Io(e.to_string()))?;
        }
        let temp = Self::temp_path(target, ".zip.tmp");
        let result = (|| -> Result<(), SnapshotWriteError> {
            let file = fs::File::create(&temp).map_err(|e| SnapshotWriteError::Io(e.to_string()))?;
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for f in files {
                zip.start_file(f.path.as_str(), options)
                    .map_err(|e| SnapshotWriteError::Io(e.to_string()))?;
                zip.write_all(f.content.as_bytes())
                    .map_err(|e| SnapshotWriteError::Io(e.to_string()))?;
            }
            zip.finish()
                .map_err(|e| SnapshotWriteError::Io(e.to_string()))?;
            fs::rename(&temp, target).map_err(|e| {
                if target.exists() {
                    SnapshotWriteError::TargetExists
                } else {
                    SnapshotWriteError::Io(e.to_string())
                }
            })?;
            Ok(())
        })();
        if result.is_err() {
            Self::cleanup(&temp);
        }
        result
    }
}
