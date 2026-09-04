//! 导出链路集成测试（INT-006 / FR-014）：确定性（同数据两次构建字节一致）、
//! 目录结构与 facilitator 装配视图、SnapshotWriter 原子写（目标存在拒绝、
//! 失败清理）、zip 形态、ExportService 端到端。

use serde_json::json;
use std::sync::Arc;

use relay_harbor_lib::domain::item::ItemType;
use relay_harbor_lib::domain::ports::{SnapshotWriter, Storage};
use relay_harbor_lib::domain::project::ProjectDocKey;
use relay_harbor_lib::domain::relation::RelationType;
use relay_harbor_lib::domain::snapshot::build_file_list;
use relay_harbor_lib::infra::writer::LocalSnapshotWriter;
use relay_harbor_lib::services::export::{ExportError, ExportForm, ExportService};

type TestResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;

async fn seed() -> (
    Arc<relay_harbor_lib::infra::storage::SqliteStorage>,
    relay_harbor_lib::domain::project::ProjectId,
    tempfile::TempDir,
) {
    let dir = tempfile::tempdir().expect("临时目录");
    let storage = relay_harbor_lib::infra::storage::SqliteStorage::open(
        &dir.path().join("test.db"),
    )
    .await
    .expect("打开存储");
    let storage = Arc::new(storage);
    let project = storage.create_project("样例项目", Some("/repo")).await.expect("项目");
    let pid = project.id;
    // FR-001（确认链）、FR-002、MOD-001、TASK-001 + 关系 + 两个文档
    let fr1 = storage
        .create_item(pid, ItemType::Fr, "登录需求 Feature requirement", "正文一", json!({"priority": "high"}))
        .await
        .expect("FR-001")
        .item;
    storage
        .transition_item(pid, "FR-001", 1, relay_harbor_lib::domain::item::AnyStatus::Item(relay_harbor_lib::domain::item::ItemStatus::InReview), None, false)
        .await
        .expect("提交");
    storage
        .transition_item(pid, "FR-001", 2, relay_harbor_lib::domain::item::AnyStatus::Item(relay_harbor_lib::domain::item::ItemStatus::Confirmed), None, false)
        .await
        .expect("确认");
    let fr2 = storage
        .create_item(pid, ItemType::Fr, "纯中文标题", "正文二", json!({}))
        .await
        .expect("FR-002")
        .item;
    let module = storage
        .create_item(pid, ItemType::Mod, "storage module 模块", "模块正文", json!({}))
        .await
        .expect("MOD-001")
        .item;
    storage
        .create_item(pid, ItemType::Task, "任务", "正文", json!({}))
        .await
        .expect("TASK-001");
    storage
        .add_relation(pid, &module.display_code, &fr1.display_code, RelationType::Derives)
        .await
        .expect("关系");
    storage
        .set_project_doc(pid, ProjectDocKey::Overview, 0, Some("项目概览"), "概览正文")
        .await
        .expect("概览文档");
    let _ = fr2;
    (storage, pid, dir)
}

#[tokio::test]
async fn file_list_is_deterministic_and_structured() -> TestResult {
    let (storage, pid, _dir) = seed().await;
    let snapshot = storage.export_snapshot(pid).await?.expect("快照");

    let first = build_file_list(&snapshot, None);
    let second = build_file_list(&snapshot, None);
    assert_eq!(first, second, "同数据两次构建字节一致（FR-014）");

    let paths: Vec<&str> = first.iter().map(|f| f.path.as_str()).collect();
    // 通用结构：根 README + relations + 类型目录（仅出现过的类型）+ 条目文件
    assert!(paths.contains(&"README.md"));
    assert!(paths.contains(&"relations.md"));
    assert!(paths.contains(&"fr/README.md"));
    assert!(paths.contains(&"task/README.md"));
    assert!(paths.iter().any(|p| p.starts_with("fr/001-")));
    // 纯中文标题 → 空 slug → 纯序号文件名（确定性规则）
    assert!(paths.contains(&"fr/002.md"));
    // facilitator 装配视图
    assert!(paths.contains(&"00-overview/README.md"));
    assert!(paths.iter().any(|p| p.starts_with("05-detailed-design/modules/")));

    // 排序确定 + 条目文件内容含状态/修订/元数据
    let mut sorted = paths.clone();
    sorted.sort_unstable();
    assert_eq!(paths, sorted);
    let fr1_file = first
        .iter()
        .find(|f| f.path.starts_with("fr/001-"))
        .expect("FR-001 文件");
    assert!(fr1_file.content.contains("- 状态：confirmed"));
    assert!(fr1_file.content.contains("- priority：high"));
    assert!(fr1_file.content.contains("## 修订历史"));
    assert!(fr1_file.content.contains("- v3 "));
    // MOD 条目在通用目录与 modules/ 双视图同内容（设计行为）
    let mod_generic = first.iter().find(|f| f.path.starts_with("mod/001-")).expect("通用视图");
    let mod_view = first.iter().find(|f| f.path.starts_with("05-detailed-design/modules/")).expect("装配视图");
    assert_eq!(mod_generic.content, mod_view.content);

    // scope 过滤：仅 FR → 无 MOD 装配视图、无 task 目录
    let scoped = build_file_list(&snapshot, Some(&[ItemType::Fr]));
    let scoped_paths: Vec<&str> = scoped.iter().map(|f| f.path.as_str()).collect();
    assert!(!scoped_paths.iter().any(|p| p.starts_with("task/")));
    assert!(!scoped_paths.iter().any(|p| p.starts_with("05-detailed-design/modules/")));
    Ok(())
}

#[tokio::test]
async fn writer_directory_atomic_and_refuses_existing() -> TestResult {
    let (storage, pid, dir) = seed().await;
    let snapshot = storage.export_snapshot(pid).await?.expect("快照");
    let files = build_file_list(&snapshot, None);
    let snapshot_files: Vec<relay_harbor_lib::domain::ports::SnapshotFile> = files
        .iter()
        .map(|f| relay_harbor_lib::domain::ports::SnapshotFile {
            path: f.path.clone(),
            content: f.content.clone(),
        })
        .collect();
    let writer = LocalSnapshotWriter::new();
    let target = dir.path().join("out");

    writer.write_directory(&target, &snapshot_files).expect("写目录");
    assert!(target.join("README.md").exists());
    assert!(target.join("00-overview").join("README.md").exists());
    let readme = std::fs::read_to_string(target.join("README.md"))?;
    assert!(readme.contains("样例项目"));
    // 无临时残留
    let leftovers: Vec<_> = std::fs::read_dir(dir.path())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with(".relayharbor-export-"))
        .collect();
    assert!(leftovers.is_empty(), "临时目录已 rename，无残留");

    // 目标已存在 → 拒绝（INT-006：不合并、不覆盖）
    match writer.write_directory(&target, &snapshot_files) {
        Err(relay_harbor_lib::domain::ports::SnapshotWriteError::TargetExists) => {}
        other => panic!("期望 TargetExists，得到 {other:?}"),
    }
    Ok(())
}

#[tokio::test]
async fn export_service_end_to_end_directory_and_zip() -> TestResult {
    let (storage, pid, dir) = seed().await;
    let service = ExportService::new(storage.clone(), Arc::new(LocalSnapshotWriter::new()));
    let mut phases: Vec<(u32, String)> = Vec::new();
    let outcome = service
        .export(
            pid,
            None,
            ExportForm::Directory,
            dir.path().join("export-out"),
            &mut |p, phase| phases.push((p, phase.to_string())),
        )
        .await?;
    assert!(outcome.file_count >= 8);
    assert!(dir.path().join("export-out").join("relations.md").exists());
    assert_eq!(phases.last().map(|(p, _)| *p), Some(100));

    // zip 形态
    let outcome = service
        .export(
            pid,
            None,
            ExportForm::Zip,
            dir.path().join("export-out.zip"),
            &mut |_, _| {},
        )
        .await?;
    assert!(dir.path().join("export-out.zip").exists());
    assert!(outcome.file_count >= 8);
    // zip 两次构建字节一致（FR-014：入口时间戳固定 + 内容确定性）
    let first = std::fs::read(dir.path().join("export-out.zip"))?;
    std::fs::remove_file(dir.path().join("export-out.zip"))?;
    service
        .export(
            pid,
            None,
            ExportForm::Zip,
            dir.path().join("export-out.zip"),
            &mut |_, _| {},
        )
        .await?;
    let second = std::fs::read(dir.path().join("export-out.zip"))?;
    assert_eq!(first, second, "zip 同数据两次导出字节一致");

    // 目标已存在 → EXPORT_TARGET_EXISTS
    let err = service
        .export(
            pid,
            None,
            ExportForm::Directory,
            dir.path().join("export-out"),
            &mut |_, _| {},
        )
        .await
        .expect_err("目标已存在");
    assert!(matches!(err, ExportError::TargetExists));
    // 不存在项目 → NotFound
    assert!(matches!(
        service
            .export(
                relay_harbor_lib::domain::project::ProjectId::new_v4(),
                None,
                ExportForm::Directory,
                dir.path().join("nope"),
                &mut |_, _| {}
            )
            .await,
        Err(ExportError::Storage(relay_harbor_lib::domain::ports::StorageError::NotFound { .. }))
    ));
    Ok(())
}
