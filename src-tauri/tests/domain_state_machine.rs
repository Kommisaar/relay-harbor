//! BR-002/INV-005 迁移矩阵全量断言（合法/非法逐一）、BR-009 退回判定、
//! BR-008 终态参数要求。白名单常量为唯一数据源，本测试以设计文档
//! 03 state-models 两张转换表逐条硬编码钉死，防止白名单意外漂移。

use relay_harbor_lib::domain::error::DomainError;
use relay_harbor_lib::domain::item::{
    allowed_item_transitions, can_transition, can_transition_item, edit_effect, AnyStatus,
    ItemStatus, ItemType, ITEM_STATUSES, ITEM_TRANSITIONS,
};
use relay_harbor_lib::domain::item::transition_requirements as req;
use relay_harbor_lib::domain::task::{
    allowed_task_transitions, TaskStatus, TASK_STATUSES, TASK_TRANSITIONS,
};

/// 03 state-models 条目状态机转换表（硬编码基线）
const EXPECTED_ITEM: &[(ItemStatus, ItemStatus)] = &[
    (ItemStatus::Draft, ItemStatus::InReview),
    (ItemStatus::InReview, ItemStatus::Confirmed),
    (ItemStatus::InReview, ItemStatus::Draft),
    (ItemStatus::Draft, ItemStatus::Cancelled),
    (ItemStatus::InReview, ItemStatus::Cancelled),
    (ItemStatus::Confirmed, ItemStatus::Superseded),
    (ItemStatus::Confirmed, ItemStatus::Deprecated),
];

/// 03 state-models 任务状态机转换表（硬编码基线）
const EXPECTED_TASK: &[(TaskStatus, TaskStatus)] = &[
    (TaskStatus::Todo, TaskStatus::Doing),
    (TaskStatus::Doing, TaskStatus::AwaitReview),
    (TaskStatus::AwaitReview, TaskStatus::Done),
    (TaskStatus::AwaitReview, TaskStatus::Doing),
    (TaskStatus::Todo, TaskStatus::Cancelled),
    (TaskStatus::Doing, TaskStatus::Cancelled),
    (TaskStatus::AwaitReview, TaskStatus::Cancelled),
];

#[test]
fn item_whitelist_matches_design_baseline() {
    assert_eq!(ITEM_TRANSITIONS, EXPECTED_ITEM);
    assert_eq!(TASK_TRANSITIONS, EXPECTED_TASK);
}

#[test]
fn item_transition_matrix_exhaustive() {
    for from in ITEM_STATUSES {
        for to in ITEM_STATUSES {
            let result = can_transition_item("FR-001", *from, *to);
            if from.is_terminal() {
                assert!(
                    matches!(result, Err(DomainError::Terminal { .. })),
                    "终态 {from:?} → {to:?} 应拒绝为 ERR_TERMINAL"
                );
            } else if EXPECTED_ITEM.contains(&(*from, *to)) {
                assert!(result.is_ok(), "{from:?} → {to:?} 应为合法迁移");
            } else {
                assert!(
                    matches!(result, Err(DomainError::TransitionIllegal { .. })),
                    "{from:?} → {to:?} 应拒绝为 ERR_TRANSITION_ILLEGAL"
                );
            }
        }
    }
}

#[test]
fn task_transition_matrix_exhaustive() {
    for from in TASK_STATUSES {
        for to in TASK_STATUSES {
            let result =
                relay_harbor_lib::domain::task::can_transition_task("TASK-001", *from, *to);
            if from.is_terminal() {
                assert!(
                    matches!(result, Err(DomainError::Terminal { .. })),
                    "终态 {from:?} → {to:?} 应拒绝为 ERR_TERMINAL"
                );
            } else if EXPECTED_TASK.contains(&(*from, *to)) {
                assert!(result.is_ok(), "{from:?} → {to:?} 应为合法迁移");
            } else {
                assert!(
                    matches!(result, Err(DomainError::TransitionIllegal { .. })),
                    "{from:?} → {to:?} 应拒绝为 ERR_TRANSITION_ILLEGAL"
                );
            }
        }
    }
}

#[test]
fn confirmed_to_in_review_is_edit_only_not_a_transition() {
    // BR-009 路径：confirmed→in_review 只能由内容编辑触发（edit_effect），
    // transition 工具不可达
    assert!(can_transition_item(
        "FR-001",
        ItemStatus::Confirmed,
        ItemStatus::InReview
    )
    .is_err());
    assert_eq!(
        edit_effect(ItemStatus::Confirmed, true, false),
        ItemStatus::InReview
    );
}

#[test]
fn allowed_targets_listed_for_illegal_transitions() {
    let err = can_transition_item("FR-001", ItemStatus::Draft, ItemStatus::Confirmed)
        .expect_err("draft→confirmed 不在白名单");
    match err {
        DomainError::TransitionIllegal { allowed, from, .. } => {
            assert_eq!(from, "draft");
            assert_eq!(allowed, vec!["in_review".to_string(), "cancelled".to_string()]);
        }
        other => panic!("期望 TransitionIllegal，得到 {other:?}"),
    }
    assert_eq!(
        allowed_item_transitions(ItemStatus::Confirmed),
        vec![ItemStatus::Superseded, ItemStatus::Deprecated]
    );
    assert_eq!(
        allowed_task_transitions(TaskStatus::AwaitReview),
        vec![TaskStatus::Done, TaskStatus::Doing, TaskStatus::Cancelled]
    );
}

#[test]
fn machines_do_not_mix() {
    // INV-005：TASK 条目配条目态 / 非 TASK 配任务态 → ERR_VALIDATION
    assert!(matches!(
        can_transition(
            ItemType::Task,
            "TASK-001",
            &AnyStatus::Item(ItemStatus::Draft),
            &AnyStatus::Item(ItemStatus::InReview)
        ),
        Err(DomainError::Validation { .. })
    ));
    assert!(matches!(
        can_transition(
            ItemType::Fr,
            "FR-001",
            &AnyStatus::Task(TaskStatus::Todo),
            &AnyStatus::Task(TaskStatus::Doing)
        ),
        Err(DomainError::Validation { .. })
    ));
    // 正确分派
    assert!(can_transition(
        ItemType::Task,
        "TASK-001",
        &AnyStatus::Task(TaskStatus::Todo),
        &AnyStatus::Task(TaskStatus::Doing)
    )
    .is_ok());
    assert!(can_transition(
        ItemType::Fr,
        "FR-001",
        &AnyStatus::Item(ItemStatus::Draft),
        &AnyStatus::Item(ItemStatus::InReview)
    )
    .is_ok());
}

#[test]
fn edit_effect_only_on_confirmed_with_content_change() {
    use ItemStatus::*;
    // 仅标题或正文触发；元数据不触发（BR-009 字段分组）
    assert_eq!(edit_effect(Confirmed, true, false), InReview);
    assert_eq!(edit_effect(Confirmed, false, true), InReview);
    assert_eq!(edit_effect(Confirmed, true, true), InReview);
    assert_eq!(edit_effect(Confirmed, false, false), Confirmed);
    // 非已确认态不变
    assert_eq!(edit_effect(Draft, true, true), Draft);
    assert_eq!(edit_effect(InReview, true, true), InReview);
}

#[test]
fn terminal_transition_requirements() {
    // BR-008：替代必带替代者；取消/废弃需显式确认
    assert!(req(ItemStatus::Superseded).needs_superseded_by);
    assert!(!req(ItemStatus::Superseded).needs_confirm);
    assert!(req(ItemStatus::Cancelled).needs_confirm);
    assert!(req(ItemStatus::Deprecated).needs_confirm);
    assert!(!req(ItemStatus::Cancelled).needs_superseded_by);
    assert!(!req(ItemStatus::InReview).needs_confirm);
    assert!(!req(ItemStatus::InReview).needs_superseded_by);
}
