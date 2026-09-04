//! 关系（DOM-003）：五类型语义（动者在前——A 对 B 做某事）、
//! 同项目约束（INV-003，事务内校验）、depends 子图环检测（BR-007/INV-002，
//! DFS 拒绝并返回环上序列）、影响闭包纯函数（derives/satisfies/depends
//! 入边反向多跳，services 的 get_context/get_impact 共用）。

use std::collections::{HashSet, VecDeque};
use std::fmt;

use uuid::Uuid;

use super::error::{validation, DomainError};
use super::item::{Item, ItemId};
use super::project::ProjectId;

pub type RelationId = Uuid;

/// 关系类型（五种；统一读作「A 对 B 做某事」，A 动者在前）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationType {
    /// A 派生自 B（B 是 A 的来源）
    Derives,
    /// A 依赖 B（B 未完成则 A 阻塞；主要用于任务间；有向无环，INV-002）
    Depends,
    /// A 满足 B（A 是 B 的落实）
    Satisfies,
    /// A 追踪到 B（松散溯源，不参与影响遍历）
    Traces,
    /// A 关联 B（无特定因果语义，不参与影响遍历）
    Relates,
}

pub const RELATION_TYPES: &[RelationType] = &[
    RelationType::Derives,
    RelationType::Depends,
    RelationType::Satisfies,
    RelationType::Traces,
    RelationType::Relates,
];

impl RelationType {
    pub fn as_str(self) -> &'static str {
        match self {
            RelationType::Derives => "derives",
            RelationType::Depends => "depends",
            RelationType::Satisfies => "satisfies",
            RelationType::Traces => "traces",
            RelationType::Relates => "relates",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        RELATION_TYPES.iter().copied().find(|t| t.as_str() == s)
    }

    /// 参与影响遍历的类型（DOM-003：traces/relates 不参与，仅上下文展示）
    pub fn participates_in_impact(self) -> bool {
        matches!(
            self,
            RelationType::Derives | RelationType::Depends | RelationType::Satisfies
        )
    }
}

impl fmt::Display for RelationType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// 关系实体（身份 = 源/目标/类型三元组，同向同类唯一——幂等基础）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Relation {
    pub id: RelationId,
    pub project_id: ProjectId,
    pub source_id: ItemId,
    pub target_id: ItemId,
    pub relation_type: RelationType,
}

/// 关系端点规则（BR-006/INV-003）：两端存在由调用方查得后传入；
/// 本函数校验同项目（跨项目 → ERR_VALIDATION，非「不存在」语义）。
pub fn check_endpoints(source: &Item, target: &Item) -> Result<(), DomainError> {
    if source.project_id != target.project_id {
        return Err(validation(format!(
            "关系两端必须同项目：{} 与 {} 分属不同项目（INV-003）",
            source.display_code, target.display_code
        )));
    }
    Ok(())
}

/// depends 环检测（BR-007）：拟新增 source → target 边，基于既有 depends
/// 边快照（存储事务内提供）DFS 判定是否成环。
///
/// 成环条件：target 已能沿 depends 边抵达 source（含 source == target 自环）。
/// 返回环上编号序列，首尾同为 source（新增边在前），如
/// `TASK-001 → TASK-002 → TASK-003 → TASK-001`；不成环返回 None。
pub fn find_depends_cycle(
    source: &str,
    target: &str,
    depends_edges: &[(String, String)],
) -> Option<Vec<String>> {
    if source == target {
        return Some(vec![source.to_string(), source.to_string()]);
    }
    // 邻接表：node → 后继集合（去重，保证每节点至多访问一次）
    let mut successors: std::collections::HashMap<&str, Vec<&str>> =
        std::collections::HashMap::new();
    for (s, t) in depends_edges {
        successors.entry(s.as_str()).or_default().push(t.as_str());
    }

    // 迭代式 DFS 记录路径，从 target 出发找 source
    let mut visited: HashSet<&str> = HashSet::new();
    // 栈元素：(节点, 从 target 到该节点的路径)
    let mut stack: Vec<(&str, Vec<&str>)> = vec![(target, vec![target])];
    while let Some((node, path)) = stack.pop() {
        if !visited.insert(node) {
            continue;
        }
        for &next in successors.get(node).into_iter().flatten() {
            if next == source {
                let mut cycle = vec![source.to_string()];
                cycle.extend(path.iter().map(|s| s.to_string()));
                cycle.push(source.to_string());
                return Some(cycle);
            }
            if !visited.contains(next) {
                let mut next_path = path.clone();
                next_path.push(next);
                stack.push((next, next_path));
            }
        }
    }
    None
}

/// 影响闭包命中（node = 条目编号；depth = 距起点跳数，直连上游为 1）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImpactHit {
    pub code: String,
    pub depth: u32,
}

/// 影响闭包（DOM-003：从 T 沿 derives/satisfies/depends 入边反向多跳，
/// 「谁派生自我、谁满足我、谁依赖我」）。edges 为参与影响遍历的
///（source, target）编号对；depth 上限 ≤10（get_context 默认 3），
/// 访问集去重防环兜底（depends 无环已由写入保证）。
/// 结果按 depth 升序、同 depth 按编号字典序——确定性输出。
pub fn impact_closure(
    start: &str,
    edges: &[(String, String)],
    max_depth: u32,
) -> Vec<ImpactHit> {
    // 反向邻接表：target → 其 source 集合（入边）
    let mut incoming: std::collections::HashMap<&str, Vec<&str>> =
        std::collections::HashMap::new();
    for (s, t) in edges {
        incoming.entry(t.as_str()).or_default().push(s.as_str());
    }

    let mut visited: HashSet<&str> = HashSet::from([start]);
    let mut frontier: VecDeque<&str> = VecDeque::from([start]);
    let mut depth = 0u32;
    let mut hits: Vec<ImpactHit> = Vec::new();
    while !frontier.is_empty() && depth < max_depth {
        depth += 1;
        let mut next_frontier: Vec<&str> = Vec::new();
        for node in &frontier {
            for &affected in incoming.get(node).into_iter().flatten() {
                if visited.insert(affected) {
                    hits.push(ImpactHit {
                        code: affected.to_string(),
                        depth,
                    });
                    next_frontier.push(affected);
                }
            }
        }
        next_frontier.sort_unstable();
        frontier = next_frontier.into_iter().collect();
    }
    hits
}
