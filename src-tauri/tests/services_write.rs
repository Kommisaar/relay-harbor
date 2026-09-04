//! WriteService 编排层集成测试：ChangeSummary kinds 投影（TASK→Task 类别）、
//! 工具级参数门（空标题/删除确认）、validate 诊断（反向对提示、洁净项目零问题）。
//! 端口级规则（状态机/OCC/环/级联）已由 storage_sqlite.rs 覆盖，不重复。

use serde_json::json;
use std::sync::Arc;

use relay_harbor_lib::domain::changeset::ChangeKind;
use relay_harbor_lib::domain::error::DomainError;
use relay_harbor_lib::domain::item::{AnyStatus, ItemType};
use relay_harbor_lib::domain::ports::StorageError;
use relay_harbor_lib::domain::project::ProjectDocKey;
use relay_harbor_lib::domain::relation::RelationType;
use relay_harbor_lib::infra::storage::SqliteStorage;
use relay_harbor_lib::services::write::{CallContext, Severity, TransitionParams, WriteService};

type TestResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;

const AGENT: &str = "test-agent";

async fn setup() -> (Arc<SqliteStorage>, WriteService, relay_harbor_lib::domain::project::ProjectId, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("临时目录");
    let storage = Arc::new(
        SqliteStorage::open(&dir.path().join("test.db"))
            .await
            .expect("打开存储"),
    );
    let write = WriteService::new(storage.clone());
    let ctx = CallContext::mcp(AGENT);
    let project = write.create_project(&ctx, "P", None).await.expect("项目");
    (storage, write, project.id, dir)
}

#[tokio::test]
async fn create_edit_transition_summaries() -> TestResult {
    let (_storage, write, pid, _dir) = setup().await;
    let ctx = CallContext::mcp(AGENT);

    let created = write
        .create_item(&ctx, pid, ItemType::Task, "实现某事", "正文", json!({}))
        .await?;
    assert_eq!(created.code, "TASK-001");
    assert_eq!(created.new_revision, 1);
    // TASK 条目写入 → Task 类别（看板失效，非条目失效）
    assert_eq!(created.summary.kinds, vec![ChangeKind::Task]);
    assert_eq!(created.summary.code.as_deref(), Some("TASK-001"));

    let edited = write
        .edit_item(
            &ctx,
            pid,
            "TASK-001",
            1,
            relay_harbor_lib::domain::changeset::ContentChanges {
                title: Some("改名".into()),
                ..relay_harbor_lib::domain::changeset::ContentChanges::new()
            },
        )
        .await?;
    assert_eq!(edited.new_revision, 2);
    assert_eq!(edited.summary.revision, Some(2));

    // 任务到 done 须走白名单三步（todo → doing → await_review → done）
    for (expected, status) in [
        (2, relay_harbor_lib::domain::task::TaskStatus::Doing),
        (3, relay_harbor_lib::domain::task::TaskStatus::AwaitReview),
        (4, relay_harbor_lib::domain::task::TaskStatus::Done),
    ] {
        write
            .transition_item(
                &ctx,
                pid,
                TransitionParams {
                    code: "TASK-001",
                    expected_revision: expected,
                    to: AnyStatus::Task(status),
                    superseded_by: None,
                    confirm: false,
                },
            )
            .await?;
    }
    // 非任务条目 → Item 类别
    let fr = write
        .create_item(&ctx, pid, ItemType::Fr, "需求", "正文", json!({}))
        .await?;
    assert_eq!(fr.summary.kinds, vec![ChangeKind::Item]);
    Ok(())
}

#[tokio::test]
async fn tool_level_param_gates() -> TestResult {
    let (_storage, write, pid, _dir) = setup().await;
    let ctx = CallContext::mcp(AGENT);
    // 空标题 → ERR_VALIDATION
    assert!(matches!(
        write.create_item(&ctx, pid, ItemType::Fr, "  ", "正文", json!({})).await,
        Err(StorageError::Domain(DomainError::Validation { .. }))
    ));
    // 删除缺确认 → ERR_VALIDATION（BR-011）
    assert!(matches!(
        write.delete_project(&ctx, pid, false).await,
        Err(StorageError::Domain(DomainError::Validation { .. }))
    ));
    // 空项目名
    assert!(matches!(
        write.create_project(&ctx, "", None).await,
        Err(StorageError::Domain(DomainError::Validation { .. }))
    ));
    // 项目仍在（未删）
    assert!(write.storage().get_project(pid).await?.is_some());
    Ok(())
}

#[tokio::test]
async fn validate_reports_reverse_pairs_and_clean_projects() -> TestResult {
    let (_storage, write, pid, _dir) = setup().await;
    let ctx = CallContext::mcp(AGENT);
    write.create_item(&ctx, pid, ItemType::Fr, "甲", "正文", json!({})).await?;
    write.create_item(&ctx, pid, ItemType::Fr, "乙", "正文", json!({})).await?;

    let issues = write.validate(&ctx, pid).await?;
    assert!(issues.is_empty(), "洁净项目零问题");

    // 反向 derives 对（设计不禁止、validate 提示）
    write.add_relation(&ctx, pid, "FR-001", "FR-002", RelationType::Derives).await?;
    write.add_relation(&ctx, pid, "FR-002", "FR-001", RelationType::Derives).await?;
    let issues = write.validate(&ctx, pid).await?;
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].severity, Severity::Info);
    assert!(issues[0].message.contains("反向对"));

    // 悬空在 FK 级联下不可构造——storage 完整性由 DB 兜底
    Ok(())
}

#[tokio::test]
async fn project_doc_write_via_service() -> TestResult {
    let (_storage, write, pid, _dir) = setup().await;
    let ctx = CallContext::mcp(AGENT);
    let (key, revision) = write
        .set_project_doc(&ctx, pid, ProjectDocKey::Overview, 0, Some("概览"), "正文")
        .await?;
    assert_eq!((key, revision), (ProjectDocKey::Overview, 1));
    // 空正文拒绝
    assert!(matches!(
        write.set_project_doc(&ctx, pid, ProjectDocKey::Overview, 1, None, "  ").await,
        Err(StorageError::Domain(DomainError::Validation { .. }))
    ));
    Ok(())
}
