//! SqliteStorage 集成测试（CMP-006 测试要点）：OCC 冲突、编号不复用、
//! 级联删除（INV-010）、状态机白名单落地、替代链（INV-006）、关系幂等、
//! depends 环（BR-007）、项目级文档 OCC（DOM-009）、搜索、修订不可变。
//! NFR-001 全真崩溃注入与 NFR-002 规模计时留 P6 NFR 验收（模块头留痕）。

use serde_json::json;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

use relay_harbor_lib::domain::changeset::ContentChanges;
use relay_harbor_lib::domain::error::DomainError;
use relay_harbor_lib::domain::item::{AnyStatus, Item, ItemStatus, ItemType};
use relay_harbor_lib::domain::ports::{
    ItemFilter, RelationFilter, Storage, StorageError, StorageResult, TypeStatusCount,
};
use relay_harbor_lib::domain::project::{ProjectDocKey, ProjectId};
use relay_harbor_lib::domain::relation::RelationType;
use relay_harbor_lib::domain::task::TaskStatus;
use relay_harbor_lib::infra::storage::SqliteStorage;

type TestResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;

async fn setup() -> (SqliteStorage, ProjectId, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("临时目录");
    let storage = SqliteStorage::open(&dir.path().join("test.db"))
        .await
        .expect("打开存储");
    let project = storage.create_project("P", None).await.expect("创建项目");
    (storage, project.id, dir)
}

fn expect_domain_err<T>(result: StorageResult<T>) -> DomainError {
    match result {
        Err(StorageError::Domain(e)) => e,
        Err(other) => panic!("期望领域错误，得到 {other:?}"),
        Ok(_) => panic!("期望领域错误，得到 Ok"),
    }
}

fn st(status: ItemStatus) -> AnyStatus {
    AnyStatus::Item(status)
}

fn ts(status: TaskStatus) -> AnyStatus {
    AnyStatus::Task(status)
}

/// 建条目（draft / todo 起步）
async fn create(
    storage: &SqliteStorage,
    project_id: ProjectId,
    item_type: ItemType,
    title: &str,
) -> Item {
    storage
        .create_item(project_id, item_type, title, "正文", json!({}))
        .await
        .expect("创建条目")
        .item
}

/// 走完 draft → in_review → confirmed
async fn confirm(storage: &SqliteStorage, project_id: ProjectId, code: &str, expected: u32) {
    storage
        .transition_item(
            project_id,
            code,
            expected,
            st(ItemStatus::InReview),
            None,
            false,
        )
        .await
        .expect("提交评审");
    storage
        .transition_item(
            project_id,
            code,
            expected + 1,
            st(ItemStatus::Confirmed),
            None,
            false,
        )
        .await
        .expect("确认");
}

#[tokio::test]
async fn reopen_same_database_is_idempotent() -> TestResult {
    let (storage, _pid, dir) = setup().await;
    let path = dir.path().join("test.db");
    drop(storage);
    let reopened = SqliteStorage::open(&path).await?;
    let projects = reopened.list_projects().await?;
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].name, "P");
    // WAL 模式生效（NFR-001 前提）：独立连接读 PRAGMA
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(SqliteConnectOptions::new().filename(&path))
        .await?;
    let mode: String = sqlx::query_scalar("PRAGMA journal_mode").fetch_one(&pool).await?;
    assert_eq!(mode, "wal");
    Ok(())
}

#[tokio::test]
async fn numbering_monotonic_and_never_reused() {
    let (storage, pid, _dir) = setup().await;
    let a = create(&storage, pid, ItemType::Fr, "甲").await;
    assert_eq!(a.display_code, "FR-001");
    let b = create(&storage, pid, ItemType::Fr, "乙").await;
    assert_eq!(b.display_code, "FR-002");
    // 类型独立递增
    let t = create(&storage, pid, ItemType::Task, "任务一").await;
    assert_eq!(t.display_code, "TASK-001");
    // 取消后编号不复用（BR-001/INV-001）
    storage
        .transition_item(pid, &a.display_code, 1, st(ItemStatus::Cancelled), None, true)
        .await
        .expect("取消");
    let c = create(&storage, pid, ItemType::Fr, "丙").await;
    assert_eq!(c.display_code, "FR-003");
}

#[tokio::test]
async fn occ_conflict_rejected() {
    let (storage, pid, _dir) = setup().await;
    let item = create(&storage, pid, ItemType::Fr, "甲").await;
    let changes = ContentChanges {
        title: Some("新标题".into()),
        ..ContentChanges::new()
    };
    storage
        .edit_item(pid, &item.display_code, 1, &changes)
        .await
        .expect("首次编辑");
    // 期望修订号仍是 1（当前已是 2）→ ERR_CONFLICT（BR-005）
    let err = expect_domain_err(
        storage
            .edit_item(pid, &item.display_code, 1, &changes)
            .await,
    );
    match err {
        DomainError::Conflict {
            expected, current, ..
        } => assert_eq!((expected, current), (1, 2)),
        other => panic!("期望 Conflict，得到 {other:?}"),
    }
    // 不存在条目 → NotFound（services 映射 ERR_NOT_FOUND）
    assert!(matches!(
        storage
            .edit_item(
                pid,
                "FR-404",
                1,
                &ContentChanges {
                    title: Some("x".into()),
                    ..ContentChanges::new()
                }
            )
            .await,
        Err(StorageError::NotFound(_))
    ));
}

#[tokio::test]
async fn edit_effect_and_metadata_no_regression() {
    let (storage, pid, _dir) = setup().await;
    let item = create(&storage, pid, ItemType::Fr, "甲").await;
    confirm(&storage, pid, &item.display_code, 1).await;

    // 已确认 + 纯元数据编辑 → 不退回（BR-009 字段分组）
    let meta_only = ContentChanges {
        metadata: Some(json!({"priority": "high"})),
        ..ContentChanges::new()
    };
    let changed = storage
        .edit_item(pid, &item.display_code, 3, &meta_only)
        .await
        .expect("元数据编辑");
    assert_eq!(changed.item.item_status(), ItemStatus::Confirmed);
    assert_eq!(changed.revision.revision_no, 4);

    // 已确认 + 标题编辑 → 退回评审中
    let title_edit = ContentChanges {
        title: Some("新甲".into()),
        ..ContentChanges::new()
    };
    let changed = storage
        .edit_item(pid, &item.display_code, 4, &title_edit)
        .await
        .expect("标题编辑");
    assert_eq!(changed.item.item_status(), ItemStatus::InReview);

    // 任务编辑不触发退回（无已确认态）
    let task = create(&storage, pid, ItemType::Task, "任务").await;
    storage
        .transition_item(pid, &task.display_code, 1, ts(TaskStatus::Doing), None, false)
        .await
        .expect("开始");
    let changed = storage
        .edit_item(
            pid,
            &task.display_code,
            2,
            &ContentChanges {
                title: Some("任务改".into()),
                ..ContentChanges::new()
            },
        )
        .await
        .expect("任务编辑");
    assert_eq!(changed.item.task_status(), TaskStatus::Doing);
}

#[tokio::test]
async fn transition_whitelist_and_terminal_lockdown() {
    let (storage, pid, _dir) = setup().await;
    let item = create(&storage, pid, ItemType::Fr, "甲").await;

    // 非法直达 → ERR_TRANSITION_ILLEGAL（含允许目标列表）
    let err = expect_domain_err(
        storage
            .transition_item(
                pid,
                &item.display_code,
                1,
                st(ItemStatus::Confirmed),
                None,
                false,
            )
            .await,
    );
    match err {
        DomainError::TransitionIllegal { allowed, .. } => {
            assert_eq!(allowed, vec!["in_review".to_string(), "cancelled".to_string()]);
        }
        other => panic!("期望 TransitionIllegal，得到 {other:?}"),
    }
    // 取消缺确认 → ERR_VALIDATION（BR-008）
    assert!(matches!(
        expect_domain_err(
            storage
                .transition_item(pid, &item.display_code, 1, st(ItemStatus::Cancelled), None, false)
                .await
        ),
        DomainError::Validation { .. }
    ));
    // 终态禁一切迁移
    storage
        .transition_item(pid, &item.display_code, 1, st(ItemStatus::Cancelled), None, true)
        .await
        .expect("取消");
    let err = expect_domain_err(
        storage
            .transition_item(pid, &item.display_code, 2, st(ItemStatus::InReview), None, false)
            .await,
    );
    assert!(matches!(err, DomainError::Terminal { .. }));
    // 终态禁内容编辑
    let err = expect_domain_err(
        storage
            .edit_item(
                pid,
                &item.display_code,
                2,
                &ContentChanges {
                    title: Some("改".into()),
                    ..ContentChanges::new()
                },
            )
            .await,
    );
    assert!(matches!(err, DomainError::Terminal { .. }));
}

#[tokio::test]
async fn superseded_flow_invariants() {
    let (storage, pid, _dir) = setup().await;
    let old = create(&storage, pid, ItemType::Fr, "旧").await;
    confirm(&storage, pid, &old.display_code, 1).await;
    let new = create(&storage, pid, ItemType::Fr, "新").await;
    confirm(&storage, pid, &new.display_code, 1).await;

    // 缺替代者 → ERR_VALIDATION（BR-008）
    assert!(matches!(
        expect_domain_err(
            storage
                .transition_item(
                    pid,
                    &old.display_code,
                    3,
                    st(ItemStatus::Superseded),
                    None,
                    false
                )
                .await
        ),
        DomainError::Validation { .. }
    ));
    // 以自身为替代者 → ERR_VALIDATION（INV-006）
    assert!(matches!(
        expect_domain_err(
            storage
                .transition_item(
                    pid,
                    &old.display_code,
                    3,
                    st(ItemStatus::Superseded),
                    Some(&old.display_code),
                    false
                )
                .await
        ),
        DomainError::Validation { .. }
    ));
    // 以终态条目为替代者 → ERR_VALIDATION
    let cancelled = create(&storage, pid, ItemType::Fr, "被取消").await;
    storage
        .transition_item(
            pid,
            &cancelled.display_code,
            1,
            st(ItemStatus::Cancelled),
            None,
            true,
        )
        .await
        .expect("取消");
    assert!(matches!(
        expect_domain_err(
            storage
                .transition_item(
                    pid,
                    &old.display_code,
                    3,
                    st(ItemStatus::Superseded),
                    Some(&cancelled.display_code),
                    false
                )
                .await
        ),
        DomainError::Validation { .. }
    ));
    // 合法替代：superseded_by 落库、修订含替代者注记
    let changed = storage
        .transition_item(
            pid,
            &old.display_code,
            3,
            st(ItemStatus::Superseded),
            Some(&new.display_code),
            false,
        )
        .await
        .expect("替代");
    assert_eq!(changed.item.superseded_by, Some(new.id));
    assert!(changed.revision.summary.contains(&new.display_code));
    // 修订历史保留全链路（创建 + 两次迁移 + 替代 = 4）
    let revisions = storage.list_revisions(old.id).await.expect("修订历史");
    assert_eq!(revisions.len(), 4);
}

#[tokio::test]
async fn relation_rules_dangling_cross_project_idempotent_cycle() {
    let (storage, pid, _dir) = setup().await;
    let q = storage.create_project("Q", None).await.expect("项目");
    let a = create(&storage, pid, ItemType::Fr, "甲").await;
    let b = create(&storage, pid, ItemType::Fr, "乙").await;

    // 悬空 → ERR_DANGLING（BR-006）
    assert!(matches!(
        expect_domain_err(
            storage
                .add_relation(pid, "FR-001", "FR-404", RelationType::Derives)
                .await
        ),
        DomainError::Dangling { .. }
    ));
    // 跨项目替代者按同项目作用域查不到 → 同为 Dangling（INV-003/INV-006）
    let _stranger = create(&storage, q.id, ItemType::Fr, "别项目").await;
    assert!(matches!(
        expect_domain_err(
            storage
                .add_relation(pid, "FR-001", "FR-001b", RelationType::Derives)
                .await
        ),
        DomainError::Dangling { .. }
    ));

    // 幂等：重复建立返回原 id
    let first = storage
        .add_relation(pid, &a.display_code, &b.display_code, RelationType::Derives)
        .await
        .expect("建立");
    assert!(first.created);
    let again = storage
        .add_relation(pid, &a.display_code, &b.display_code, RelationType::Derives)
        .await
        .expect("重复建立");
    assert!(!again.created);
    assert_eq!(first.relation.id, again.relation.id);
    // 移除幂等
    storage
        .remove_relation(pid, &a.display_code, &b.display_code, RelationType::Derives)
        .await
        .expect("移除");
    storage
        .remove_relation(pid, &a.display_code, &b.display_code, RelationType::Derives)
        .await
        .expect("再移除亦 ok");

    // depends 环（BR-007）：t1 depends t2 成功；t2 depends t1 → ERR_CYCLE 带序列
    let t1 = create(&storage, pid, ItemType::Task, "一").await;
    let t2 = create(&storage, pid, ItemType::Task, "二").await;
    storage
        .add_relation(pid, &t1.display_code, &t2.display_code, RelationType::Depends)
        .await
        .expect("t1 depends t2");
    let err = expect_domain_err(
        storage
            .add_relation(pid, &t2.display_code, &t1.display_code, RelationType::Depends)
            .await,
    );
    match err {
        DomainError::Cycle { path } => assert_eq!(
            path,
            vec![t2.display_code.clone(), t1.display_code.clone(), t2.display_code.clone()]
        ),
        other => panic!("期望 Cycle，得到 {other:?}"),
    }
    // 非 depends 类型不参与环约束
    storage
        .add_relation(pid, &t2.display_code, &t1.display_code, RelationType::Relates)
        .await
        .expect("relates 无环约束");
}

#[tokio::test]
async fn cascade_delete_and_isolation() {
    let (storage, pid, _dir) = setup().await;
    let q = storage.create_project("Q", None).await.expect("项目");
    let a = create(&storage, pid, ItemType::Fr, "甲").await;
    let b = create(&storage, pid, ItemType::Fr, "乙").await;
    confirm(&storage, pid, &a.display_code, 1).await;
    storage
        .add_relation(pid, &a.display_code, &b.display_code, RelationType::Satisfies)
        .await
        .expect("关系");
    storage
        .set_project_doc(pid, ProjectDocKey::Overview, 0, Some("概览"), "内容")
        .await
        .expect("文档");
    let q_item = create(&storage, q.id, ItemType::Uc, "隔离样本").await;

    let stats = storage.delete_project(pid).await.expect("删除");
    // 修订数 = 甲（创建+提交评审+确认 = 3）+ 乙（创建 = 1）
    assert_eq!((stats.items, stats.relations, stats.revisions), (2, 1, 4));
    // 级联清空（INV-010）
    assert!(storage
        .list_items(pid, &ItemFilter::default())
        .await
        .unwrap()
        .is_empty());
    assert!(storage.edge_snapshot(pid).await.unwrap().is_empty());
    assert!(storage
        .get_project_doc(pid, ProjectDocKey::Overview)
        .await
        .unwrap()
        .is_none());
    assert!(storage
        .get_item_by_code(pid, "FR-001")
        .await
        .unwrap()
        .is_none());
    // 其他项目不受影响
    assert!(storage
        .get_item_by_code(q.id, "UC-001")
        .await
        .unwrap()
        .is_some());
    assert_eq!(q_item.display_code, "UC-001");
    // 重复删除 → NotFound
    assert!(matches!(
        storage.delete_project(pid).await,
        Err(StorageError::NotFound(_))
    ));
}

#[tokio::test]
async fn project_doc_occ_and_history() {
    let (storage, pid, _dir) = setup().await;
    // 新文档：expected=0 创建（契约细化留痕：首次写入以 0 创建、修订号从 1 起）
    let first = storage
        .set_project_doc(pid, ProjectDocKey::Overview, 0, Some("概览"), "第一版")
        .await
        .expect("创建");
    assert_eq!(first.doc.current_revision, 1);
    assert_eq!(first.revision.revision_no, 1);
    // 尚不存在的文档（data_model）非零 expected 视为冲突（current=0）
    let err = expect_domain_err(
        storage
            .set_project_doc(pid, ProjectDocKey::DataModel, 5, None, "第二版")
            .await,
    );
    assert!(matches!(
        err,
        DomainError::Conflict {
            expected: 5,
            current: 0,
            ..
        }
    ));
    // 正常更新（OCC 1→2），title 不传沿用
    let second = storage
        .set_project_doc(pid, ProjectDocKey::Overview, 1, None, "第二版")
        .await
        .expect("更新");
    assert_eq!(second.doc.current_revision, 2);
    assert_eq!(second.doc.title, "概览");
    // 陈旧期望 → ERR_CONFLICT（BR-005 同口径）
    assert!(matches!(
        expect_domain_err(
            storage
                .set_project_doc(pid, ProjectDocKey::Overview, 1, None, "第三版")
                .await
        ),
        DomainError::Conflict { .. }
    ));
    // 修订历史不可变追加
    let revisions = storage
        .list_project_doc_revisions(pid, ProjectDocKey::Overview)
        .await
        .expect("文档修订");
    assert_eq!(revisions.len(), 2);
    assert_eq!(revisions[0].content.body_md, "第一版");
    assert_eq!(revisions[1].content.body_md, "第二版");
}

#[tokio::test]
async fn search_filters_and_state_counts() {
    let (storage, pid, _dir) = setup().await;
    let a = create(&storage, pid, ItemType::Fr, "登录需求").await;
    create(&storage, pid, ItemType::Fr, "登出需求").await;
    create(&storage, pid, ItemType::Task, "实现登录").await;
    // 编号精确 + 前缀
    let hits = storage.search_items(pid, "FR-001").await.expect("搜索");
    assert_eq!(hits.len(), 1);
    let hits = storage.search_items(pid, "FR-").await.expect("搜索");
    assert_eq!(hits.len(), 2);
    // 标题正文
    let hits = storage.search_items(pid, "登录").await.expect("搜索");
    assert_eq!(hits.len(), 2); // FR-001 标题 + TASK 标题
    assert_eq!(hits[0].display_code, "FR-001");
    // 类型 + 状态过滤
    let todo = storage
        .list_items(
            pid,
            &ItemFilter {
                item_types: Some(vec![ItemType::Task]),
                statuses: Some(vec![ts(TaskStatus::Todo)]),
            },
        )
        .await
        .expect("过滤");
    assert_eq!(todo.len(), 1);
    // 计数（get_project_state 数据源）
    let counts = storage.count_items_by_type_status(pid).await.expect("计数");
    assert!(counts.contains(&TypeStatusCount {
        item_type: ItemType::Fr,
        status: st(ItemStatus::Draft),
        count: 2,
    }));
    assert!(counts.contains(&TypeStatusCount {
        item_type: ItemType::Task,
        status: ts(TaskStatus::Todo),
        count: 1,
    }));
    // 最近修订（title 为条目标题，倒序）
    storage
        .edit_item(
            pid,
            &a.display_code,
            1,
            &ContentChanges {
                title: Some("登录需求改".into()),
                ..ContentChanges::new()
            },
        )
        .await
        .expect("编辑");
    let recent = storage.recent_revisions(pid, 2).await.expect("最近修订");
    assert_eq!(recent.len(), 2);
    assert_eq!(recent[0].code, "FR-001");
    assert_eq!(recent[0].title, "登录需求改");
    // 逐日计数含今天（活动图数据源）
    let by_day = storage.revisions_by_day(pid, 182).await.expect("逐日");
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    assert!(by_day.iter().any(|d| d.date == today && d.count >= 3));
    // 阻塞派生输入：edge_snapshot 返回编号边
    let t = create(&storage, pid, ItemType::Task, "下游").await;
    storage
        .add_relation(pid, &t.display_code, "TASK-001", RelationType::Depends)
        .await
        .expect("依赖");
    let edges = storage.edge_snapshot(pid).await.expect("边");
    assert!(edges.iter().any(|e| e.relation_type == RelationType::Depends
        && e.source == t.display_code
        && e.target == "TASK-001"));
}

#[tokio::test]
async fn revisions_are_immutable_append_only() {
    let (storage, pid, _dir) = setup().await;
    let item = create(&storage, pid, ItemType::Fr, "甲").await;
    storage
        .edit_item(
            pid,
            &item.display_code,
            1,
            &ContentChanges {
                title: Some("乙".into()),
                ..ContentChanges::new()
            },
        )
        .await
        .expect("编辑");
    let revisions = storage.list_revisions(item.id).await.expect("历史");
    assert_eq!(revisions.len(), 2);
    // 修订 1 快照仍是初始内容（INV-004）
    assert_eq!(revisions[0].content.title, "甲");
    assert_eq!(revisions[0].revision_no, 1);
    assert_eq!(revisions[1].content.title, "乙");
    // RelationFilter 按 target 查询（入边）
    let b = create(&storage, pid, ItemType::Fr, "乙2").await;
    storage
        .add_relation(pid, &b.display_code, &item.display_code, RelationType::Satisfies)
        .await
        .expect("关系");
    let incoming = storage
        .list_relations(
            pid,
            &RelationFilter {
                target: Some(item.id),
                ..RelationFilter::default()
            },
        )
        .await
        .expect("入边");
    assert_eq!(incoming.len(), 1);
    assert_eq!(incoming[0].source_id, b.id);
}

