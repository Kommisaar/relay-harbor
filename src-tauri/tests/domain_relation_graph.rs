//! DOM-003 关系图算法：BR-007 depends 环检测（含环序列返回）、
//! 影响闭包（入边 BFS/深度/去重/确定性排序）、BR-010 派生阻塞。

use relay_harbor_lib::domain::item::{AnyStatus, Item, ItemId, ItemStatus, ItemType};
use relay_harbor_lib::domain::project::ProjectId;
use relay_harbor_lib::domain::relation::{
    check_endpoints, find_depends_cycle, impact_closure, RelationType, RELATION_TYPES,
};
use relay_harbor_lib::domain::task::is_blocked;
use relay_harbor_lib::domain::task::TaskStatus;

fn item(project: ProjectId, code: &str) -> Item {
    let now = chrono::Utc::now();
    Item {
        id: ItemId::new_v4(),
        project_id: project,
        display_code: code.to_string(),
        item_type: ItemType::Fr,
        title: code.to_string(),
        body_md: String::new(),
        metadata: serde_json::json!({}),
        status: AnyStatus::Item(ItemStatus::Draft),
        current_revision: 1,
        superseded_by: None,
        created_at: now,
        updated_at: now,
    }
}

fn edges(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
    pairs
        .iter()
        .map(|(s, t)| (s.to_string(), t.to_string()))
        .collect()
}

#[test]
fn relation_type_vocabulary_and_impact_participation() {
    // 五类型；traces/relates 不参与影响遍历（DOM-003）
    let names: Vec<&str> = RELATION_TYPES.iter().map(|t| t.as_str()).collect();
    assert_eq!(names, vec!["derives", "depends", "satisfies", "traces", "relates"]);
    for t in RELATION_TYPES {
        assert_eq!(RelationType::parse(t.as_str()), Some(*t));
    }
    assert!(RelationType::Derives.participates_in_impact());
    assert!(RelationType::Depends.participates_in_impact());
    assert!(RelationType::Satisfies.participates_in_impact());
    assert!(!RelationType::Traces.participates_in_impact());
    assert!(!RelationType::Relates.participates_in_impact());
    assert_eq!(RelationType::parse("blocks"), None);
}

#[test]
fn endpoints_must_share_project() {
    // INV-003：跨项目 → ERR_VALIDATION（非 Dangling——端点存在）
    let p1 = ProjectId::new_v4();
    let p2 = ProjectId::new_v4();
    assert!(check_endpoints(&item(p1, "FR-001"), &item(p1, "UC-001")).is_ok());
    assert!(check_endpoints(&item(p1, "FR-001"), &item(p2, "UC-001")).is_err());
}

#[test]
fn depends_cycle_detection() {
    // 自环：A depends A
    assert_eq!(
        find_depends_cycle("A", "A", &[]),
        Some(vec!["A".to_string(), "A".to_string()])
    );
    // 二元环：已有 B→A，加 A→B
    assert_eq!(
        find_depends_cycle("A", "B", &edges(&[("B", "A")])),
        Some(vec!["A".into(), "B".into(), "A".into()])
    );
    // 三元环：已有 B→C、C→A，加 A→B
    assert_eq!(
        find_depends_cycle("A", "B", &edges(&[("B", "C"), ("C", "A")])),
        Some(vec!["A".into(), "B".into(), "C".into(), "A".into()])
    );
    // 无环：B 可达 C、D，但到不了 A
    assert_eq!(find_depends_cycle("A", "B", &edges(&[("B", "C"), ("C", "D")])), None);
    // 方向不构成环：已有 C→A（A 是 C 上游），加 A→B 无环
    assert_eq!(find_depends_cycle("A", "B", &edges(&[("C", "A")])), None);
    // 空快照
    assert_eq!(find_depends_cycle("A", "B", &[]), None);
    // 分支干扰：target 沿一条分支可达 source
    assert_eq!(
        find_depends_cycle(
            "A",
            "B",
            &edges(&[("B", "X"), ("X", "Y"), ("B", "A")])
        ),
        Some(vec!["A".into(), "B".into(), "A".into()])
    );
}

#[test]
fn impact_closure_reverse_multihop() {
    // 链：A derives B、B derives C → C 的影响 = B(1)、A(2)
    let es = edges(&[("A", "B"), ("B", "C")]);
    let hits = impact_closure("C", &es, 10);
    assert_eq!(hits.len(), 2);
    assert_eq!(hits[0].code, "B");
    assert_eq!(hits[0].depth, 1);
    assert_eq!(hits[1].code, "A");
    assert_eq!(hits[1].depth, 2);

    // 深度上限（get_context 默认 3、上限 10；此处直接钳 2）
    let chain = edges(&[("A", "B"), ("B", "C"), ("C", "D"), ("D", "E")]);
    let hits = impact_closure("E", &chain, 2);
    assert_eq!(
        hits.iter().map(|h| (h.code.as_str(), h.depth)).collect::<Vec<_>>(),
        vec![("D", 1), ("C", 2)]
    );

    // 菱形去重：A→B、A→C、B→D、C→D → D 的影响 = B(1)、C(1)、A(2) 各一次
    let diamond = edges(&[("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")]);
    let hits = impact_closure("D", &diamond, 10);
    assert_eq!(
        hits.iter().map(|h| (h.code.as_str(), h.depth)).collect::<Vec<_>>(),
        vec![("B", 1), ("C", 1), ("A", 2)]
    );

    // 孤立起点
    assert!(impact_closure("Z", &diamond, 10).is_empty());
    // depth=0 → 空
    assert!(impact_closure("D", &diamond, 0).is_empty());
}

#[test]
fn derived_blocked_matches_shipped_ui_semantics() {
    // BR-010：活跃（未完成）上游才阻塞；done/cancelled 不阻塞
    //（cancelled 不阻塞 = 2026-08-28 mock 实现期定案，解除办法是移除关系）
    assert!(!is_blocked(&[]));
    assert!(!is_blocked(&[TaskStatus::Done]));
    assert!(!is_blocked(&[TaskStatus::Done, TaskStatus::Cancelled]));
    assert!(is_blocked(&[TaskStatus::Todo]));
    assert!(is_blocked(&[TaskStatus::Doing]));
    assert!(is_blocked(&[TaskStatus::AwaitReview]));
    assert!(is_blocked(&[TaskStatus::Done, TaskStatus::Todo]));
    // 状态活性口径一致性
    for st in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::AwaitReview] {
        assert!(st.is_active());
        assert!(!st.is_terminal());
    }
    for st in [TaskStatus::Done, TaskStatus::Cancelled] {
        assert!(!st.is_active());
        assert!(st.is_terminal());
    }
}
