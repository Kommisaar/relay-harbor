//! BR-001/DOM-008 编号规则（解析/格式/分配纯函数）、INV-005 存储文本解析、
//! DOM-005 变更集组装校验。

use serde_json::json;

use relay_harbor_lib::domain::changeset::{ChangeOp, ChangeSet, ContentChanges};
use relay_harbor_lib::domain::error::DomainError;
use relay_harbor_lib::domain::item::{
    status_from_storage, AnyStatus, DisplayCode, ItemStatus, ItemType, ITEM_TYPES,
};
use relay_harbor_lib::domain::project::ProjectDocKey;
use relay_harbor_lib::domain::relation::RelationType;
use relay_harbor_lib::domain::task::TaskStatus;
use relay_harbor_lib::domain::project::ProjectId;

#[test]
fn item_type_vocabulary_pinned_to_design() {
    // 15 类固定序（2026-09-04：+MOD，序在 UI 之后、ADR 之前）
    let prefixes: Vec<&str> = ITEM_TYPES.iter().map(|t| t.prefix()).collect();
    assert_eq!(
        prefixes,
        vec![
            "FR", "NFR", "BR", "CON", "UC", "DOM", "CMP", "INT", "SEQ", "UI", "MOD", "ADR",
            "RISK", "OQ", "TASK"
        ]
    );
    assert_eq!(ITEM_TYPES.len(), 15);
    for t in ITEM_TYPES {
        assert_eq!(ItemType::from_prefix(t.prefix()), Some(*t), "{t} 往返");
    }
    assert_eq!(ItemType::from_prefix("XX"), None);
    assert_eq!(ItemType::from_prefix("fr"), None, "前缀大小写敏感");
    assert!(ItemType::Task.is_task());
    assert!(!ItemType::Mod.is_task());
}

#[test]
fn display_code_parse_and_format() {
    assert_eq!(
        DisplayCode::parse("FR-001").map(|c| c.as_code()),
        Ok("FR-001".to_string())
    );
    // 短序号按值归一
    assert_eq!(
        DisplayCode::parse("FR-1").map(|c| c.as_code()),
        Ok("FR-001".to_string())
    );
    // 超过 999 自然扩位
    assert_eq!(
        DisplayCode::parse("TASK-1000").map(|c| c.as_code()),
        Ok("TASK-1000".to_string())
    );
    for bad in [
        "FR001", "FR-", "FR-0", "FR-xy", "XX-001", "", "FR-001-x", "-001", "FR_001",
    ] {
        assert!(
            matches!(DisplayCode::parse(bad), Err(DomainError::Validation { .. })),
            "{bad:?} 应为 ERR_VALIDATION"
        );
    }
}

#[test]
fn code_allocation_is_pure_and_monotonic() {
    // BR-001 纯函数：计数 → 下一序号；None = 首个
    assert_eq!(DisplayCode::next(ItemType::Fr, None).as_code(), "FR-001");
    assert_eq!(DisplayCode::next(ItemType::Fr, Some(3)).as_code(), "FR-004");
    assert_eq!(DisplayCode::next(ItemType::Dom, Some(9)).as_code(), "DOM-010");
    assert_eq!(DisplayCode::next(ItemType::Task, Some(998)).as_code(), "TASK-999");
    // 永不复用：序号只从「当前最大」前进（删除/取消/替代不回退计数）
    assert!(DisplayCode::next(ItemType::Fr, Some(3)).seq > 3);
}

#[test]
fn status_from_storage_resolves_machine_by_type() {
    assert_eq!(
        status_from_storage(ItemType::Fr, "confirmed"),
        Ok(AnyStatus::Item(ItemStatus::Confirmed))
    );
    assert_eq!(
        status_from_storage(ItemType::Task, "await_review"),
        Ok(AnyStatus::Task(TaskStatus::AwaitReview))
    );
    // 同名状态 "cancelled" 按类型正确归属（AnyStatus 不做 JSON 反序列化的原因）
    assert_eq!(
        status_from_storage(ItemType::Task, "cancelled"),
        Ok(AnyStatus::Task(TaskStatus::Cancelled))
    );
    assert_eq!(
        status_from_storage(ItemType::Fr, "cancelled"),
        Ok(AnyStatus::Item(ItemStatus::Cancelled))
    );
    // 机器外文本拒绝
    assert!(status_from_storage(ItemType::Fr, "todo").is_err());
    assert!(status_from_storage(ItemType::Task, "confirmed").is_err());
    assert!(status_from_storage(ItemType::Fr, "unknown").is_err());
}

#[test]
fn content_changes_field_grouping() {
    // BR-009 触发口径：提供且实际不同才算修改；元数据不触发
    let mut c = ContentChanges::new();
    assert!(c.is_empty());
    assert!(!c.content_changed("旧标题", "旧正文"));

    c.title = Some("新标题".into());
    assert!(c.content_changed("旧标题", "旧正文"));
    assert!(!c.content_changed("新标题", "旧正文"), "同值不算修改");

    let meta_only = ContentChanges {
        metadata: Some(json!({"priority": "high"})),
        ..ContentChanges::new()
    };
    assert!(!meta_only.content_changed("标题", "正文"), "元数据不触发");

    let body = ContentChanges {
        body_md: Some("新正文".into()),
        ..ContentChanges::new()
    };
    assert!(body.content_changed("标题", "正文"));

    // 空编辑拒绝
    assert!(matches!(
        ContentChanges::new().ensure_non_empty("FR-001"),
        Err(DomainError::Validation { .. })
    ));
}

#[test]
fn changeset_assembly_validation() {
    let pid = ProjectId::new_v4();
    // 空集拒绝
    assert!(matches!(
        ChangeSet::new(pid, vec![]),
        Err(DomainError::Validation { .. })
    ));

    let edit = |code: &str| ChangeOp::EditItem {
        code: code.into(),
        expected_revision: 2,
        changes: ContentChanges {
            title: Some("t".into()),
            ..ContentChanges::new()
        },
    };

    // 同一条目重复出现 → 结构错误（期望修订号无法唯一确定）
    assert!(matches!(
        ChangeSet::new(pid, vec![edit("FR-001"), edit("FR-001")]),
        Err(DomainError::Validation { .. })
    ));
    // 同文档重复同理
    let doc = || ChangeOp::SetProjectDoc {
        doc_key: ProjectDocKey::Overview,
        expected_revision: 1,
        title: Some("t".into()),
        body_md: "b".into(),
    };
    assert!(matches!(
        ChangeSet::new(pid, vec![doc(), doc()]),
        Err(DomainError::Validation { .. })
    ));

    // 合法组合：不同目标 + 无目标操作混排
    let cs = ChangeSet::new(
        pid,
        vec![
            edit("FR-001"),
            ChangeOp::AddRelation {
                source: "FR-001".into(),
                target: "UC-002".into(),
                relation_type: RelationType::Derives,
            },
            ChangeOp::RemoveRelation {
                source: "FR-001".into(),
                target: "UC-003".into(),
                relation_type: RelationType::Relates,
            },
            ChangeOp::CreateItem {
                item_type: ItemType::Br,
                title: "规则".into(),
                body_md: "正文".into(),
                metadata: json!({}),
            },
            doc(),
        ],
    );
    assert!(cs.is_ok());
    assert_eq!(cs.unwrap().ops.len(), 5);
}
