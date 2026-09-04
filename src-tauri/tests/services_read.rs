//! ReadService 组装层集成测试：与 mock 门面（INT-001 演示实现）语义对齐——
//! 项目统计补零窗口、看板阻塞派生、影响闭包（via/深度/排序）、搜索命中
//! 优先级、关联方向与对端、文档 summary 取最新修订、列表计数。

use serde_json::json;
use std::sync::Arc;

use relay_harbor_lib::domain::item::{AnyStatus, ItemStatus, ItemType};
use relay_harbor_lib::domain::ports::{Storage, StorageError};
use relay_harbor_lib::domain::project::ProjectDocKey;
use relay_harbor_lib::domain::relation::RelationType;
use relay_harbor_lib::services::read::{
    Direction, ItemListSpec, MatchedIn, ReadService,
};
use relay_harbor_lib::domain::task::TaskStatus;
use relay_harbor_lib::infra::storage::SqliteStorage;

type TestResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;

async fn setup() -> (Arc<SqliteStorage>, relay_harbor_lib::domain::project::ProjectId, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("临时目录");
    let storage = SqliteStorage::open(&dir.path().join("test.db"))
        .await
        .expect("打开存储");
    let storage = Arc::new(storage);
    let project = storage.create_project("P", None).await.expect("项目");
    (storage, project.id, dir)
}

async fn create(
    storage: &SqliteStorage,
    pid: relay_harbor_lib::domain::project::ProjectId,
    item_type: ItemType,
    title: &str,
) -> relay_harbor_lib::domain::item::Item {
    storage
        .create_item(pid, item_type, title, "正文", json!({}))
        .await
        .expect("创建")
        .item
}

#[tokio::test]
async fn project_state_fills_window_and_counts() -> TestResult {
    let (storage, pid, _dir) = setup().await;
    let svc = ReadService::new(storage.clone());
    storage
        .create_item(pid, ItemType::Fr, "甲", "正文", json!({}))
        .await?;
    storage
        .create_item(pid, ItemType::Task, "任务", "正文", json!({}))
        .await?;

    let state = svc.project_state(pid).await?;
    assert_eq!(state.by_type, vec![(ItemType::Fr, 1), (ItemType::Task, 1)]);
    // 状态映射全词表含零
    let draft = state
        .item_by_status
        .iter()
        .find(|(s, _)| *s == ItemStatus::Draft)
        .map(|(_, c)| *c);
    assert_eq!(draft, Some(1));
    let todo = state
        .task_by_status
        .iter()
        .find(|(s, _)| *s == TaskStatus::Todo)
        .map(|(_, c)| *c);
    assert_eq!(todo, Some(1));
    // 活动图窗口恒 182 天、升序、末日为今天（UTC 口径）
    assert_eq!(state.revisions_by_day.len(), 182);
    let today = chrono::Utc::now().date_naive().to_string();
    assert_eq!(state.revisions_by_day.last().unwrap().0, today);
    assert!(state.revisions_by_day.last().unwrap().1 >= 2);
    assert!(state
        .revisions_by_day
        .windows(2)
        .all(|w| w[0].0 < w[1].0));
    // 不存在项目 → NotFound{Project}
    assert!(matches!(
        svc.project_state(relay_harbor_lib::domain::project::ProjectId::new_v4()).await,
        Err(StorageError::NotFound { .. })
    ));
    Ok(())
}

#[tokio::test]
async fn task_board_blocks_on_active_upstream_only() -> TestResult {
    let (storage, pid, _dir) = setup().await;
    let svc = ReadService::new(storage.clone());
    let t1 = create(&storage, pid, ItemType::Task, "上游").await;
    let t2 = create(&storage, pid, ItemType::Task, "下游").await;
    let done = create(&storage, pid, ItemType::Task, "已完成上游").await;
    // 任务到 done 须走 todo → doing → await_review → done（BR-002 白名单）
    for (expected, status) in [
        (1, TaskStatus::Doing),
        (2, TaskStatus::AwaitReview),
        (3, TaskStatus::Done),
    ] {
        storage
            .transition_item(pid, &done.display_code, expected, AnyStatus::Task(status), None, false)
            .await?;
    }
    storage
        .add_relation(pid, &t2.display_code, &t1.display_code, RelationType::Depends)
        .await?;
    storage
        .add_relation(pid, &t1.display_code, &done.display_code, RelationType::Depends)
        .await?;

    let board = svc.task_board(pid).await?;
    let todo_column = &board.columns[0]; // todo 列
    assert_eq!(todo_column.status, TaskStatus::Todo);
    let downstream = todo_column
        .tasks
        .iter()
        .find(|t| t.item.display_code == t2.display_code)
        .expect("下游卡");
    assert_eq!(downstream.blocked_by.len(), 1);
    assert_eq!(downstream.blocked_by[0].code, t1.display_code);
    // 上游自己被已完成任务依赖 → 不阻塞（done 非活跃）
    let upstream = todo_column
        .tasks
        .iter()
        .find(|t| t.item.display_code == t1.display_code)
        .expect("上游卡");
    assert!(upstream.blocked_by.is_empty());
    // done 列恒存在（五列全词表）
    assert_eq!(board.columns.len(), 5);
    Ok(())
}

#[tokio::test]
async fn impact_closure_via_and_depth() -> TestResult {
    let (storage, pid, _dir) = setup().await;
    let svc = ReadService::new(storage.clone());
    // 链：TASK-1 depends TASK-2 depends TASK-3；TASK-1 satisfies FR-001
    let t1 = create(&storage, pid, ItemType::Task, "一").await;
    let t2 = create(&storage, pid, ItemType::Task, "二").await;
    let t3 = create(&storage, pid, ItemType::Task, "三").await;
    let fr = create(&storage, pid, ItemType::Fr, "需求").await;
    storage
        .add_relation(pid, &t1.display_code, &t2.display_code, RelationType::Depends)
        .await?;
    storage
        .add_relation(pid, &t2.display_code, &t3.display_code, RelationType::Depends)
        .await?;
    storage
        .add_relation(pid, &t1.display_code, &fr.display_code, RelationType::Satisfies)
        .await?;

    // 影响 FR-001：入边反向 = 谁满足/派生/依赖我 → 仅 TASK-1（satisfies）。
    // TASK-2/TASK-3 是 TASK-1 的上游依赖（TASK-1 depends 它们），不参与 FR-001 的影响集。
    let impact = svc.impact(pid, &fr.display_code, None).await?;
    assert_eq!(impact.trigger.display_code, "FR-001");
    assert_eq!(impact.entries.len(), 1);
    assert_eq!(impact.entries[0].item.display_code, t1.display_code);
    assert_eq!(impact.entries[0].via, RelationType::Satisfies);
    // 反向验证：影响 TASK-3 → TASK-2（depends 上游）@1、TASK-1 @2
    let impact = svc.impact(pid, &t3.display_code, None).await?;
    assert_eq!(
        impact
            .entries
            .iter()
            .map(|e| (e.item.display_code.as_str(), e.depth))
            .collect::<Vec<_>>(),
        vec![(t2.display_code.as_str(), 1), (t1.display_code.as_str(), 2)]
    );
    assert!(impact.entries.iter().all(|e| e.via == RelationType::Depends));
    // 深度钳制 1 → 只有直连
    let impact = svc.impact(pid, &t3.display_code, Some(1)).await?;
    assert_eq!(impact.entries.len(), 1);
    // 不存在条目 → NotFound{Item}
    assert!(matches!(
        svc.impact(pid, "FR-404", None).await,
        Err(StorageError::NotFound { .. })
    ));
    Ok(())
}

#[tokio::test]
async fn search_matched_in_and_relations_views() -> TestResult {
    let (storage, pid, _dir) = setup().await;
    let svc = ReadService::new(storage.clone());
    let fr = create(&storage, pid, ItemType::Fr, "登录需求").await;
    let uc = create(&storage, pid, ItemType::Uc, "登录用例").await;
    storage
        .add_relation(pid, &uc.display_code, &fr.display_code, RelationType::Satisfies)
        .await?;

    let hits = svc.search(pid, "登录").await?;
    assert_eq!(hits.len(), 2);
    // FR-001 与 UC-001 都按 title 命中（编号不含「登录」）
    assert!(hits.iter().all(|h| h.matched_in == MatchedIn::Title));
    let hits = svc.search(pid, "FR-0").await?;
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].matched_in, MatchedIn::Code);

    // FR 视角：入边 satisfies（UC 满足 FR）
    let views = svc.item_relations(pid, &fr.display_code).await?;
    assert_eq!(views.len(), 1);
    assert_eq!(views[0].direction, Direction::In);
    assert_eq!(views[0].peer.display_code, uc.display_code);
    // UC 视角：出边
    let views = svc.item_relations(pid, &uc.display_code).await?;
    assert_eq!(views[0].direction, Direction::Out);
    assert_eq!(views[0].peer.display_code, fr.display_code);
    Ok(())
}

#[tokio::test]
async fn project_doc_summary_and_doc_not_found() -> TestResult {
    let (storage, pid, _dir) = setup().await;
    let svc = ReadService::new(storage.clone());
    assert!(matches!(
        svc.project_doc(pid, ProjectDocKey::Overview).await,
        Err(StorageError::NotFound { .. })
    ));
    storage
        .set_project_doc(pid, ProjectDocKey::Overview, 0, Some("概览"), "第一版")
        .await?;
    let (doc, summary) = svc.project_doc(pid, ProjectDocKey::Overview).await?;
    assert_eq!(doc.title, "概览");
    assert_eq!(doc.current_revision, 1);
    // summary = 最新修订的摘要（创建修订 summary 为空，与条目同口径）
    assert_eq!(summary, "");
    // 修订历史倒序
    let revisions = svc.list_project_doc_revisions(pid, ProjectDocKey::Overview).await?;
    assert_eq!(revisions.len(), 1);
    assert_eq!(revisions[0].content.body_md, "第一版");
    // 列表计数（本项目无条目）
    let entries = svc.list_projects().await?;
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].item_count, 0);
    assert_eq!(entries[0].task_count, 0);
    Ok(())
}

#[tokio::test]
async fn list_items_spec_and_detail_not_found() -> TestResult {
    let (storage, pid, _dir) = setup().await;
    let svc = ReadService::new(storage.clone());
    create(&storage, pid, ItemType::Fr, "甲").await;
    let items = svc
        .list_items(
            pid,
            &ItemListSpec {
                item_type: Some(ItemType::Fr),
                status: Some(AnyStatus::Item(ItemStatus::Draft)),
            },
        )
        .await?;
    assert_eq!(items.len(), 1);
    assert!(matches!(
        svc.item_detail(pid, "FR-404").await,
        Err(StorageError::NotFound { .. })
    ));
    let revisions = svc.item_revisions(pid, "FR-001").await?;
    assert_eq!(revisions.len(), 1);
    Ok(())
}
