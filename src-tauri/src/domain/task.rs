//! 任务（DOM-006）：任务状态机（BR-002 第二张表）与派生阻塞
//!（depends 上游未满足即阻塞，非状态——BR-010/INV-007）。

use std::fmt;

use super::error::DomainError;

/// 任务状态（DOM-006 状态机；任务无「已确认」态，BR-009 不适用）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Todo,
    Doing,
    AwaitReview,
    Done,
    Cancelled,
}

pub const TASK_STATUSES: &[TaskStatus] = &[
    TaskStatus::Todo,
    TaskStatus::Doing,
    TaskStatus::AwaitReview,
    TaskStatus::Done,
    TaskStatus::Cancelled,
];

impl TaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            TaskStatus::Todo => "todo",
            TaskStatus::Doing => "doing",
            TaskStatus::AwaitReview => "await_review",
            TaskStatus::Done => "done",
            TaskStatus::Cancelled => "cancelled",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        TASK_STATUSES.iter().copied().find(|st| st.as_str() == s)
    }

    pub fn is_terminal(self) -> bool {
        matches!(self, TaskStatus::Done | TaskStatus::Cancelled)
    }

    /// 活跃 = 非终态。阻塞派生口径（BR-010）：未完成上游 = 处于活跃态的任务
    ///（done 已满足；cancelled 视为不再阻塞——解除办法是移除关系，
    /// 与已交付 UI mock 语义一致，2026-08-28 实现期定案）。
    pub fn is_active(self) -> bool {
        !self.is_terminal()
    }
}

impl fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// 任务状态机白名单（BR-002，03 state-models 任务转换表为唯一数据源）
pub const TASK_TRANSITIONS: &[(TaskStatus, TaskStatus)] = &[
    (TaskStatus::Todo, TaskStatus::Doing),
    (TaskStatus::Doing, TaskStatus::AwaitReview),
    (TaskStatus::AwaitReview, TaskStatus::Done),
    (TaskStatus::AwaitReview, TaskStatus::Doing),
    (TaskStatus::Todo, TaskStatus::Cancelled),
    (TaskStatus::Doing, TaskStatus::Cancelled),
    (TaskStatus::AwaitReview, TaskStatus::Cancelled),
];

/// from 态的全部合法目标（ERR_TRANSITION_ILLEGAL 结构化上下文）
pub fn allowed_task_transitions(from: TaskStatus) -> Vec<TaskStatus> {
    TASK_TRANSITIONS
        .iter()
        .filter(|(f, _)| *f == from)
        .map(|(_, to)| *to)
        .collect()
}

/// 任务迁移判定（BR-002；终态拒绝在 [`can_transition_item`] 同款语义）
pub fn can_transition_task(code: &str, from: TaskStatus, to: TaskStatus) -> Result<(), DomainError> {
    if from.is_terminal() {
        return Err(DomainError::Terminal {
            code: code.to_string(),
            status: from.to_string(),
        });
    }
    if TASK_TRANSITIONS.contains(&(from, to)) {
        Ok(())
    } else {
        Err(DomainError::TransitionIllegal {
            code: code.to_string(),
            from: from.to_string(),
            allowed: allowed_task_transitions(from)
                .iter()
                .map(|s| s.to_string())
                .collect(),
        })
    }
}

/// 派生阻塞判定（BR-010/INV-007）：存在任一活跃（未完成）上游即阻塞。
/// 阻塞是只读派生属性，不落库、无迁移——上游完成即自动解除。
pub fn is_blocked(upstream_statuses: &[TaskStatus]) -> bool {
    upstream_statuses.iter().any(|st| st.is_active())
}
