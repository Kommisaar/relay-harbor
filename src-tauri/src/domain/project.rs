//! 项目（DOM-001）：隔离数据、编号空间与配置的工作空间；项目级文档
//!（DOM-009）的归属载体。名称仅展示不唯一（UUID 为身份）。

use chrono::{DateTime, Utc};
use uuid::Uuid;

pub type ProjectId = Uuid;

/// 项目实体（M1 由 Agent 经 MCP 创建与删除，BR-011 级联）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub id: ProjectId,
    /// 仅展示属性，不要求唯一（2026-08-27 确认）
    pub name: String,
    /// 关联仓库路径（仅登记，不识别内容），可空
    pub repo_path: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 项目级文档 key（DOM-009 受控词表，2026-09-04 修订循环）：
/// overview / data_model / structure / tech_stack。
/// 扩展 key 走设计修订，不允许项目自定义；词表外 key → ERR_VALIDATION。
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(rename_all = "snake_case")]
pub enum ProjectDocKey {
    Overview,
    DataModel,
    Structure,
    TechStack,
}

/// 固定序（导出装配视图与 UI 子导航一致，INT-006）
pub const PROJECT_DOC_KEYS: &[ProjectDocKey] = &[
    ProjectDocKey::Overview,
    ProjectDocKey::DataModel,
    ProjectDocKey::Structure,
    ProjectDocKey::TechStack,
];

impl ProjectDocKey {
    pub fn from_key(s: &str) -> Option<Self> {
        PROJECT_DOC_KEYS.iter().copied().find(|k| k.as_key() == s)
    }

    /// 受控 key 字符串（存储与工具参数形态）
    pub fn as_key(&self) -> &'static str {
        match self {
            ProjectDocKey::Overview => "overview",
            ProjectDocKey::DataModel => "data_model",
            ProjectDocKey::Structure => "structure",
            ProjectDocKey::TechStack => "tech_stack",
        }
    }
}

impl std::fmt::Display for ProjectDocKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_key())
    }
}

/// 项目级文档当前态（每项目每 key 恰一篇；无编号、无状态机、不入关系图）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectDoc {
    pub project_id: ProjectId,
    pub doc_key: ProjectDocKey,
    pub title: String,
    pub body_md: String,
    /// 乐观并发凭据（BR-005 同口径，set_project_doc 携带期望值）
    pub current_revision: u32,
    pub updated_at: DateTime<Utc>,
}
