//! 条目（DOM-002）：15 类型词表、双状态机（BR-002 白名单为唯一数据源）、
//! 编号规则（BR-001：分配纯函数 + 永不复用）、退回判定（BR-009：仅标题/正文）、
//! 类型不可变（INV-008）。迁移矩阵单测见 src-tauri/tests/。

use std::fmt;

use serde_json::Value;
use uuid::Uuid;

use super::error::{validation, DomainError};
use super::project::ProjectId;
use super::task::TaskStatus;

pub type ItemId = Uuid;

/// 条目类型（15 种前缀，INV-008 创建后不可变；固定序 = 导出类型目录序与
/// UI 侧栏分组序）。MOD 为 2026-09-04 修订循环新增（固定序 UI 之后、ADR 之前）。
/// specta::Type：IPC DTO 直用领域枚举（单一事实来源，serde rename 即 TS 字面量联合）。
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize, specta::Type,
)]
pub enum ItemType {
    #[serde(rename = "FR")]
    Fr,
    #[serde(rename = "NFR")]
    Nfr,
    #[serde(rename = "BR")]
    Br,
    #[serde(rename = "CON")]
    Con,
    #[serde(rename = "UC")]
    Uc,
    #[serde(rename = "DOM")]
    Dom,
    #[serde(rename = "CMP")]
    Cmp,
    #[serde(rename = "INT")]
    Int,
    #[serde(rename = "SEQ")]
    Seq,
    #[serde(rename = "UI")]
    Ui,
    #[serde(rename = "MOD")]
    Mod,
    #[serde(rename = "ADR")]
    Adr,
    #[serde(rename = "RISK")]
    Risk,
    #[serde(rename = "OQ")]
    Oq,
    #[serde(rename = "TASK")]
    Task,
}

/// 类型固定序（BR-001 编号按前缀独立递增；此序为展示/导出排序依据）
pub const ITEM_TYPES: &[ItemType] = &[
    ItemType::Fr,
    ItemType::Nfr,
    ItemType::Br,
    ItemType::Con,
    ItemType::Uc,
    ItemType::Dom,
    ItemType::Cmp,
    ItemType::Int,
    ItemType::Seq,
    ItemType::Ui,
    ItemType::Mod,
    ItemType::Adr,
    ItemType::Risk,
    ItemType::Oq,
    ItemType::Task,
];

impl ItemType {
    /// 前缀（= 存储形态与工具参数形态，与类型一一绑定）
    pub fn prefix(self) -> &'static str {
        match self {
            ItemType::Fr => "FR",
            ItemType::Nfr => "NFR",
            ItemType::Br => "BR",
            ItemType::Con => "CON",
            ItemType::Uc => "UC",
            ItemType::Dom => "DOM",
            ItemType::Cmp => "CMP",
            ItemType::Int => "INT",
            ItemType::Seq => "SEQ",
            ItemType::Ui => "UI",
            ItemType::Mod => "MOD",
            ItemType::Adr => "ADR",
            ItemType::Risk => "RISK",
            ItemType::Oq => "OQ",
            ItemType::Task => "TASK",
        }
    }

    pub fn from_prefix(s: &str) -> Option<Self> {
        ITEM_TYPES.iter().copied().find(|t| t.prefix() == s)
    }

    /// TASK 条目即任务（DOM-006），使用任务状态机
    pub fn is_task(self) -> bool {
        self == ItemType::Task
    }
}

impl fmt::Display for ItemType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.prefix())
    }
}

/// 非任务条目状态（三活态 + 三终态；2026-09-02 +已废弃终态）
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    Draft,
    InReview,
    Confirmed,
    Cancelled,
    Superseded,
    Deprecated,
}

pub const ITEM_STATUSES: &[ItemStatus] = &[
    ItemStatus::Draft,
    ItemStatus::InReview,
    ItemStatus::Confirmed,
    ItemStatus::Cancelled,
    ItemStatus::Superseded,
    ItemStatus::Deprecated,
];

impl ItemStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            ItemStatus::Draft => "draft",
            ItemStatus::InReview => "in_review",
            ItemStatus::Confirmed => "confirmed",
            ItemStatus::Cancelled => "cancelled",
            ItemStatus::Superseded => "superseded",
            ItemStatus::Deprecated => "deprecated",
        }
    }

    /// 存储文本解析（DB 只存文本，状态机归属 domain——白名单违规在领域层拒绝）
    pub fn parse(s: &str) -> Option<Self> {
        ITEM_STATUSES.iter().copied().find(|st| st.as_str() == s)
    }

    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            ItemStatus::Cancelled | ItemStatus::Superseded | ItemStatus::Deprecated
        )
    }
}

impl fmt::Display for ItemStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// 条目当前状态值：按类型选定状态机（INV-005 两机互不混用）。
/// 刻意不实现 Deserialize——"cancelled" 两机同名，反序列化无法判定归属，
/// 入库文本一律经 [`status_from_storage`]（携带类型）解析。
/// IPC DTO 层状态字段以 String 承载（specta 不适用 untagged 联合）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize)]
#[serde(untagged)]
pub enum AnyStatus {
    Item(ItemStatus),
    Task(TaskStatus),
}

impl AnyStatus {
    /// 终态判定（跨两机：三终态 / done+cancelled）
    pub fn is_terminal(self) -> bool {
        match self {
            AnyStatus::Item(st) => st.is_terminal(),
            AnyStatus::Task(st) => st.is_terminal(),
        }
    }

    /// 两机同名状态的文本解析入口（DTO 层用：先条目机后任务机，
    /// "cancelled" 归条目机——与 storage 解析按类型分派不同，此处无类型上下文）
    pub fn from_storage_text(s: &str) -> Option<Self> {
        ItemStatus::parse(s)
            .map(AnyStatus::Item)
            .or_else(|| TaskStatus::parse(s).map(AnyStatus::Task))
    }
}

impl fmt::Display for AnyStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AnyStatus::Item(st) => st.fmt(f),
            AnyStatus::Task(st) => st.fmt(f),
        }
    }
}

/// 条目状态机白名单（BR-002，03 state-models 转换表为唯一数据源）。
/// 注意 confirmed→in_review 不在此表：那是 BR-009 内容编辑退回路径，
/// 由 edit_effect 产出，不是 transition 工具可用的迁移。
pub const ITEM_TRANSITIONS: &[(ItemStatus, ItemStatus)] = &[
    (ItemStatus::Draft, ItemStatus::InReview),
    (ItemStatus::InReview, ItemStatus::Confirmed),
    (ItemStatus::InReview, ItemStatus::Draft),
    (ItemStatus::Draft, ItemStatus::Cancelled),
    (ItemStatus::InReview, ItemStatus::Cancelled),
    (ItemStatus::Confirmed, ItemStatus::Superseded),
    (ItemStatus::Confirmed, ItemStatus::Deprecated),
];

/// from 态的全部合法目标（ERR_TRANSITION_ILLEGAL 结构化上下文）
pub fn allowed_item_transitions(from: ItemStatus) -> Vec<ItemStatus> {
    ITEM_TRANSITIONS
        .iter()
        .filter(|(f, _)| *f == from)
        .map(|(_, to)| *to)
        .collect()
}

/// 终态迁移的参数要求（BR-008：替代必带替代者；取消/废弃需显式确认）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransitionRequirements {
    pub needs_confirm: bool,
    pub needs_superseded_by: bool,
}

pub fn transition_requirements(to: ItemStatus) -> TransitionRequirements {
    match to {
        ItemStatus::Cancelled | ItemStatus::Deprecated => TransitionRequirements {
            needs_confirm: true,
            needs_superseded_by: false,
        },
        ItemStatus::Superseded => TransitionRequirements {
            needs_confirm: false,
            needs_superseded_by: true,
        },
        _ => TransitionRequirements {
            needs_confirm: false,
            needs_superseded_by: false,
        },
    }
}

/// 非任务条目迁移判定（BR-002/INV-005）
pub fn can_transition_item(code: &str, from: ItemStatus, to: ItemStatus) -> Result<(), DomainError> {
    if from.is_terminal() {
        return Err(DomainError::Terminal {
            code: code.to_string(),
            status: from.to_string(),
        });
    }
    if ITEM_TRANSITIONS.contains(&(from, to)) {
        Ok(())
    } else {
        Err(DomainError::TransitionIllegal {
            code: code.to_string(),
            from: from.to_string(),
            allowed: allowed_item_transitions(from)
                .iter()
                .map(|s| s.to_string())
                .collect(),
        })
    }
}

/// 状态迁移总入口：按类型分派到两张状态机之一（BR-002）。
/// 携带错误机器的状态（如 TASK 条目配条目态）→ ERR_VALIDATION（INV-005）。
pub fn can_transition(
    item_type: ItemType,
    code: &str,
    from: &AnyStatus,
    to: &AnyStatus,
) -> Result<(), DomainError> {
    match item_type {
        ItemType::Task => {
            let from = expect_task_status(code, from)?;
            let to = expect_task_status(code, to)?;
            super::task::can_transition_task(code, from, to)
        }
        _ => {
            let from = expect_item_status(code, from)?;
            let to = expect_item_status(code, to)?;
            can_transition_item(code, from, to)
        }
    }
}

fn expect_item_status(code: &str, s: &AnyStatus) -> Result<ItemStatus, DomainError> {
    match s {
        AnyStatus::Item(st) => Ok(*st),
        AnyStatus::Task(st) => Err(validation(format!(
            "条目 {code} 为非 TASK 类型，不得使用任务状态 {st}（INV-005 两机不混用）"
        ))),
    }
}

fn expect_task_status(code: &str, s: &AnyStatus) -> Result<TaskStatus, DomainError> {
    match s {
        AnyStatus::Task(st) => Ok(*st),
        AnyStatus::Item(st) => Err(validation(format!(
            "条目 {code} 为 TASK 类型，不得使用条目状态 {st}（INV-005 两机不混用）"
        ))),
    }
}

/// BR-009 退回判定：已确认非任务条目在标题或正文实际变更时退回评审中；
/// 元数据修改不触发；任务无已确认态、不适用（编辑只产生修订）。
pub fn edit_effect(status: ItemStatus, title_changed: bool, body_changed: bool) -> ItemStatus {
    if status == ItemStatus::Confirmed && (title_changed || body_changed) {
        ItemStatus::InReview
    } else {
        status
    }
}

/// 稳定编号（DOM-008）：「前缀-序号」，项目内唯一、永不复用（BR-001/INV-001）。
/// 序号按类型前缀独立递增，分配为纯函数（存储事务内取当前计数调用）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DisplayCode {
    pub item_type: ItemType,
    pub seq: u32,
}

impl DisplayCode {
    pub fn new(item_type: ItemType, seq: u32) -> Result<Self, DomainError> {
        if seq == 0 {
            return Err(validation("编号序号从 1 起（BR-001）"));
        }
        Ok(DisplayCode { item_type, seq })
    }

    /// 解析对外编号（接受 1 位以上序号，按值归一——"FR-1" 即 "FR-001"）
    pub fn parse(s: &str) -> Result<Self, DomainError> {
        let (prefix, seq) = s.split_once('-').ok_or_else(|| {
            validation(format!("编号格式应为 前缀-序号（如 FR-001），得到 {s:?}"))
        })?;
        let item_type = ItemType::from_prefix(prefix)
            .ok_or_else(|| validation(format!("编号前缀 {prefix:?} 不在 15 类型词表内")))?;
        let seq: u32 = seq.parse().map_err(|_| {
            validation(format!("编号序号应为正整数，得到 {seq:?}（如 FR-001）"))
        })?;
        DisplayCode::new(item_type, seq)
    }

    /// 下一编号（BR-001 纯函数：当前前缀计数 → 下一序号；计数只增不减，
    /// 删除/取消/替代不释放——「永不复用」由存储计数单调性保证）
    pub fn next(item_type: ItemType, current_max_seq: Option<u32>) -> Self {
        DisplayCode {
            item_type,
            seq: current_max_seq.map_or(1, |max| max + 1),
        }
    }

    /// 规范形态（序号零填充至 3 位；超过 999 自然扩位）
    pub fn as_code(&self) -> String {
        format!("{}-{:03}", self.item_type.prefix(), self.seq)
    }
}

impl fmt::Display for DisplayCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.as_code())
    }
}

/// 条目实体（DOM-002；条目当前内容恒等于最新修订，INV-004）
#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub id: ItemId,
    pub project_id: ProjectId,
    pub display_code: String,
    pub item_type: ItemType,
    pub title: String,
    pub body_md: String,
    /// 结构化元数据（优先级、备注等辅助信息），整对象替换
    pub metadata: Value,
    pub status: AnyStatus,
    /// 乐观并发凭据（BR-005），每次提交 +1
    pub current_revision: u32,
    /// 已替代时指向替代者（INV-006：必填、同项目存在、替代者非终态）
    pub superseded_by: Option<ItemId>,
    /// 创建时间（UTC；= 修订 1 的 changed_at）
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// 最后写入时间（UTC；= 最新修订 changed_at，UI 列表排序用）
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl Item {
    /// 非任务条目态快捷读取（存储解析保证与类型匹配；不匹配为数据损坏）
    pub fn item_status(&self) -> ItemStatus {
        match self.status {
            AnyStatus::Item(st) => st,
            AnyStatus::Task(st) => panic!(
                "数据损坏：非 TASK 条目 {} 处于任务态 {st}（INV-005）",
                self.display_code
            ),
        }
    }

    /// 任务态快捷读取（同上，仅 TASK 条目）
    pub fn task_status(&self) -> TaskStatus {
        match self.status {
            AnyStatus::Task(st) => st,
            AnyStatus::Item(st) => panic!(
                "数据损坏：TASK 条目 {} 处于条目态 {st}（INV-005）",
                self.display_code
            ),
        }
    }
}

/// 存储文本 → 状态（按类型选机；机器外文本 = 词表违规，领域层拒绝）
pub fn status_from_storage(item_type: ItemType, s: &str) -> Result<AnyStatus, DomainError> {
    if item_type.is_task() {
        TaskStatus::parse(s).map(AnyStatus::Task).ok_or_else(|| {
            validation(format!("未知任务状态 {s:?}（任务状态机外文本）"))
        })
    } else {
        ItemStatus::parse(s).map(AnyStatus::Item).ok_or_else(|| {
            validation(format!("未知条目状态 {s:?}（条目状态机外文本）"))
        })
    }
}
