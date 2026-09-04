//! NFR 验收测试（06 verification 开放风险收尾）：
//! - NFR-004：VACUUM INTO 备份 → 恢复 → 数据一致
//! - NFR-001：崩溃（句柄即弃、无显式关闭）后重开库数据完整（WAL 承诺：
//!   已提交事务零丢失；真实强杀进程注入留人工验收——测试进程无法自模拟 SIGKILL）
//! - INT-005：bridge.json 写读往返 + 版本不识别过滤
//! - NFR-002：规模计时（#[ignore]，显式 `cargo test --test nfr_acceptance -- --ignored`）

use std::sync::Arc;
use std::time::Instant;

use relay_harbor_lib::domain::item::ItemType;
use relay_harbor_lib::domain::ports::{ItemFilter, Storage};
use relay_harbor_lib::infra::runtime::{
    read_bridge_json, write_bridge_json, BridgeDiscovery, RuntimePaths,
};
use relay_harbor_lib::infra::storage::{backup_database, SqliteStorage};

type TestResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;

async fn seed(
    dir: &std::path::Path,
    count: usize,
) -> (Arc<SqliteStorage>, relay_harbor_lib::domain::project::ProjectId) {
    let storage = Arc::new(
        SqliteStorage::open(&dir.join("test.db"))
            .await
            .expect("打开存储"),
    );
    let project = storage.create_project("验收项目", None).await.expect("项目");
    for i in 0..count {
        storage
            .create_item(
                project.id,
                if i % 10 == 0 { ItemType::Task } else { ItemType::Fr },
                &format!("条目 {i}"),
                "正文内容",
                serde_json::json!({}),
            )
            .await
            .expect("条目");
    }
    (storage, project.id)
}

#[tokio::test]
async fn backup_restore_roundtrip() -> TestResult {
    let dir = tempfile::tempdir()?;
    let (storage, _pid) = seed(dir.path(), 5).await;
    let backup_path = dir.path().join("backup.db");
    backup_database(&storage, &backup_path).await?;
    // 从备份副本打开（恢复路径）→ 数据一致
    let restored = SqliteStorage::open(&backup_path).await?;
    let projects = restored.list_projects().await?;
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].name, "验收项目");
    let items = restored
        .list_items(projects[0].id, &ItemFilter::default())
        .await?;
    assert_eq!(items.len(), 5);
    Ok(())
}

#[tokio::test]
async fn crash_reopen_preserves_committed_data() -> TestResult {
    let dir = tempfile::tempdir()?;
    let path = dir.path().join("test.db");
    {
        let (storage, _pid) = seed(dir.path(), 3).await;
        // 模拟崩溃：句柄即弃（无显式关闭/checkpoint），依赖 WAL 恢复
        drop(storage);
    }
    let reopened = SqliteStorage::open(&path).await?;
    let projects = reopened.list_projects().await?;
    assert_eq!(projects.len(), 1);
    let items = reopened
        .list_items(projects[0].id, &ItemFilter::default())
        .await?;
    assert_eq!(items.len(), 3, "已提交事务零丢失（NFR-001）");
    Ok(())
}

#[test]
fn bridge_json_roundtrip_and_version_gate() -> TestResult {
    let dir = tempfile::tempdir()?;
    let paths = RuntimePaths::resolve(dir.path().to_path_buf())?;
    assert!(read_bridge_json(&paths).is_none(), "缺失 → None");
    let discovery = BridgeDiscovery {
        version: 1,
        port: 53712,
        token: "abc".into(),
        pid: 12345,
        protocol_version: "2025-06-18".into(),
        updated_at: "2026-09-05T00:00:00Z".into(),
    };
    write_bridge_json(&paths, &discovery)?;
    assert_eq!(read_bridge_json(&paths), Some(discovery.clone()));
    // 版本不识别（未来格式）→ None（演进可检测，INT-005）
    let future = BridgeDiscovery {
        version: 99,
        port: discovery.port,
        token: discovery.token.clone(),
        pid: discovery.pid,
        protocol_version: discovery.protocol_version.clone(),
        updated_at: discovery.updated_at.clone(),
    };
    write_bridge_json(&paths, &future)?;
    assert!(read_bridge_json(&paths).is_none());
    Ok(())
}

/// NFR-002 规模计时：2000 条目（含 200 任务）+ 修订写入后，读路径 ≤1s。
/// 写入约数千事务（synchronous=FULL），耗时数十秒——默认跳过，
/// 显式运行：`cargo test --test nfr_acceptance -- --ignored --nocapture`
#[tokio::test]
#[ignore = "NFR-002 规模基准：写量大、耗时长，显式 --ignored 运行"]
async fn scale_read_paths_within_budget() -> TestResult {
    let dir = tempfile::tempdir()?;
    let (storage, project_id) = seed(dir.path(), 2000).await;
    let started = Instant::now();
    for i in 0..300 {
        storage
            .edit_item(
                project_id,
                &format!("FR-{:03}", i + 1),
                1,
                &relay_harbor_lib::domain::changeset::ContentChanges {
                    title: Some(format!("条目 {i} 改")),
                    ..relay_harbor_lib::domain::changeset::ContentChanges::new()
                },
            )
            .await
            .expect("编辑");
    }
    println!("写入 300 修订耗时 {:?}", started.elapsed());

    for name in ["list_items", "search", "count", "recent"] {
        let t = Instant::now();
        match name {
            "list_items" => {
                let items = storage
                    .list_items(project_id, &ItemFilter::default())
                    .await?;
                assert_eq!(items.len(), 2000);
            }
            "search" => {
                let hits = storage.search_items(project_id, "FR-").await?;
                assert_eq!(hits.len(), 1800);
            }
            "count" => {
                let counts = storage.count_items_by_type_status(project_id).await?;
                assert!(!counts.is_empty());
            }
            "recent" => {
                let recent = storage.recent_revisions(project_id, 10).await?;
                assert_eq!(recent.len(), 10);
            }
            _ => unreachable!(),
        }
        let elapsed = t.elapsed();
        println!("{name} 耗时 {elapsed:?}");
        assert!(
            elapsed.as_millis() <= 1000,
            "{name} 超出 NFR-002 预算（1s）：{elapsed:?}"
        );
    }
    Ok(())
}
