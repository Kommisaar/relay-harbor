//! 领域错误枚举：映射 api-contracts 六个业务错误码
//! （ERR_VALIDATION / ERR_CONFLICT / ERR_TRANSITION_ILLEGAL / ERR_CYCLE /
//! ERR_DANGLING / ERR_TERMINAL），携带结构化上下文（环序列、允许目标列表）
//! 供 interfaces 组装 MCP 错误 detail（如 ERR_TRANSITION_ILLEGAL「按返回的
//! 允许目标修正」、ERR_CYCLE「按返回的环上条目序列调整」）。
//!
//! ERR_NOT_FOUND / ERR_UNAUTHORIZED / ERR_VERSION_MISMATCH / ERR_INTERNAL
//! 属接口与设施层语义（查找、鉴权、握手、存储故障），不入领域枚举。

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DomainError {
    /// ERR_VALIDATION：参数/结构校验失败（类型词表外、编号格式非法、
    /// 跨项目关系（INV-003）、变更集携带类型（INV-008）等）
    Validation { message: String },
    /// ERR_CONFLICT：期望修订号与当前不一致（BR-005 OCC），不自动合并
    Conflict {
        code: String,
        expected: u32,
        current: u32,
    },
    /// ERR_TRANSITION_ILLEGAL：迁移不在白名单（BR-002/INV-005）。
    /// allowed 携带 from 态的全部合法目标（调用方按此修正）。
    TransitionIllegal {
        code: String,
        from: String,
        allowed: Vec<String>,
    },
    /// ERR_CYCLE：depends 成环（BR-007/INV-002）。path 为环上条目编号序列，
    /// 起点=终点（新增边在前），供调用方定位调整。
    Cycle { path: Vec<String> },
    /// ERR_DANGLING：关系端点条目不存在（BR-006/INV-003）
    Dangling { code: String },
    /// ERR_TERMINAL：终态条目不可变更——禁迁移与内容编辑（BR-002 例外、BR-003）
    Terminal { code: String, status: String },
}

impl DomainError {
    /// api-contracts 错误码（interfaces/http 透传为 MCP 业务错误）
    pub fn error_code(&self) -> &'static str {
        match self {
            DomainError::Validation { .. } => "ERR_VALIDATION",
            DomainError::Conflict { .. } => "ERR_CONFLICT",
            DomainError::TransitionIllegal { .. } => "ERR_TRANSITION_ILLEGAL",
            DomainError::Cycle { .. } => "ERR_CYCLE",
            DomainError::Dangling { .. } => "ERR_DANGLING",
            DomainError::Terminal { .. } => "ERR_TERMINAL",
        }
    }
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DomainError::Validation { message } => write!(f, "校验失败：{message}"),
            DomainError::Conflict {
                code,
                expected,
                current,
            } => write!(
                f,
                "修订号冲突（{code}）：期望 {expected}，当前 {current}（BR-005）"
            ),
            DomainError::TransitionIllegal { code, from, allowed } => write!(
                f,
                "非法迁移（{code}）：{from} 仅允许 → {}（BR-002）",
                allowed.join("、")
            ),
            DomainError::Cycle { path } => {
                write!(f, "depends 成环：{}（BR-007）", path.join(" → "))
            }
            DomainError::Dangling { code } => write!(f, "关系端点不存在：{code}（BR-006）"),
            DomainError::Terminal { code, status } => {
                write!(f, "终态条目不可变更（{code} 处于 {status}）")
            }
        }
    }
}

impl std::error::Error for DomainError {}

/// 领域规则快捷构造（供 domain 内各模块与 storage/services 复用）
pub fn validation(message: impl Into<String>) -> DomainError {
    DomainError::Validation {
        message: message.into(),
    }
}
