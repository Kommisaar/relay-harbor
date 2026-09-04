//! 快照确定性规则（INT-006）：类型固定序、编号排序、UTC 秒精度时间戳、
//! 内容模板、facilitator 装配视图。换文件系统或打包格式不改此模块
//!（ADR-001 分层规则的典型应用——writer 只收「相对路径 + UTF-8 内容」清单）。
//!
//! 确定性契约（FR-014）：同数据两次构建字节一致——排序全部显式、时间戳
//! 秒精度 UTC。留痕：「导出基准时间」取快照内最新修订 changed_at（数据
//! 自身的时间），而非导出墙钟——墙钟会破坏字节确定性；README 语义不变。

use std::collections::BTreeMap;

use crate::domain::item::{DisplayCode, Item, ItemType, ITEM_TYPES};
use crate::domain::ports::ExportSnapshot;
use crate::domain::project::{ProjectDoc, ProjectDocKey};

/// 导出文件（相对路径以 `/` 分隔；内容 UTF-8）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportFile {
    pub path: String,
    pub content: String,
}

/// UTC 秒精度时间戳（INT-006 确定性要求）
pub fn ts_utc(t: chrono::DateTime<chrono::Utc>) -> String {
    t.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// 文件 slug（标题 ASCII 字母数字小写化，截断 48；纯 CJK 标题 → 空 slug，
/// 文件名退化为纯序号——确定性优先，不做音译）
pub fn slug(title: &str) -> String {
    title
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(48)
        .collect::<String>()
        .to_lowercase()
}

/// 条目文件名：`NNN-<slug>`（slug 空则 `NNN`）
fn item_file_name(code: &DisplayCode, title: &str) -> String {
    let seq = format!("{:03}", code.seq);
    match slug(title).is_empty() {
        true => seq,
        false => format!("{seq}-{}", slug(title)),
    }
}

/// 按类型 scope 过滤（None = 全量）；仅含所选类型的条目集合
fn scoped_items<'a>(items: &'a [Item], scope: Option<&[ItemType]>) -> Vec<&'a Item> {
    items
        .iter()
        .filter(|i| scope.is_none_or(|types| types.contains(&i.item_type)))
        .collect()
}

/// 构建完整文件清单（INT-006 通用结构 + facilitator 装配视图）。
/// scope 语义（留痕）：通用类型目录按类型过滤；MOD 装配视图与条目同进退；
/// 项目级文档装配不受 scope 影响（文档非条目、无类型）。
pub fn build_file_list(
    snapshot: &ExportSnapshot,
    scope: Option<&[ItemType]>,
) -> Vec<ExportFile> {
    let items = scoped_items(&snapshot.items, scope);
    let mut files: Vec<ExportFile> = Vec::new();

    // 根 README：项目信息、条目统计、导出基准时间
    let baseline = snapshot
        .items
        .iter()
        .map(|i| i.updated_at)
        .chain(std::iter::once(snapshot.project.updated_at))
        .max()
        .unwrap_or(snapshot.project.updated_at);
    let mut type_counts: BTreeMap<ItemType, usize> = BTreeMap::new();
    for item in &items {
        *type_counts.entry(item.item_type).or_default() += 1;
    }
    let counts_text = ITEM_TYPES
        .iter()
        .filter_map(|t| type_counts.get(t).map(|c| format!("{} {t}", c)))
        .collect::<Vec<_>>()
        .join("、");
    files.push(ExportFile {
        path: "README.md".into(),
        content: format!(
            "# {}\n\n\
             - 仓库路径：{}\n\
             - 导出基准时间：{}\n\
             - 条目统计：{} 条（{}）\n\n\
             本目录由 RelayHarbor 确定性导出（FR-014）：类型按固定序分目录、\
             文件按编号排序、时间戳 UTC 秒精度；M2 导入按同一结构逆向解析。\n",
            snapshot.project.name,
            snapshot.project.repo_path.as_deref().unwrap_or("（未登记）"),
            ts_utc(baseline),
            items.len(),
            if counts_text.is_empty() { "无" } else { &counts_text },
        ),
    });

    // relations.md：全部关系索引（按源编号 → 类型 → 目标编号排序）
    let code_of = |id: uuid::Uuid| -> String {
        snapshot
            .items
            .iter()
            .find(|i| i.id == id)
            .map(|i| i.display_code.clone())
            .unwrap_or_else(|| id.to_string())
    };
    let mut relations: Vec<_> = snapshot
        .relations
        .iter()
        .filter(|r| {
            // scope 过滤两端都在所选类型内（与条目目录一致）
            let src = snapshot.items.iter().find(|i| i.id == r.source_id);
            let tgt = snapshot.items.iter().find(|i| i.id == r.target_id);
            src.is_some_and(|s| scope.is_none_or(|t| t.contains(&s.item_type)))
                && tgt.is_some_and(|t| scope.is_none_or(|sc| sc.contains(&t.item_type)))
        })
        .map(|r| (code_of(r.source_id), r.relation_type, code_of(r.target_id)))
        .collect();
    relations.sort_unstable();
    let relations_body = relations
        .iter()
        .map(|(src, ty, tgt)| format!("- {src} — {ty} → {tgt}"))
        .collect::<Vec<_>>()
        .join("\n");
    files.push(ExportFile {
        path: "relations.md".into(),
        content: format!(
            "# 关系索引\n\n{}（共 {} 条）\n",
            if relations_body.is_empty() { "（无关系）".to_string() } else { relations_body },
            relations.len()
        ),
    });

    // 类型目录：仅有条目才出现；目录内 README 索引 + 每条目一文件
    let revision_summaries = item_revision_summaries(snapshot);
    for item_type in ITEM_TYPES {
        let group: Vec<&Item> = items.iter().copied().filter(|i| i.item_type == *item_type).collect();
        if group.is_empty() {
            continue;
        }
        let dir = item_type.prefix().to_lowercase();
        let index_body = group
            .iter()
            .map(|i| {
                format!(
                    "- {} {}（{}）",
                    i.display_code,
                    i.title,
                    i.status
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        files.push(ExportFile {
            path: format!("{dir}/README.md"),
            content: format!("# {}（{} 条）\n\n{index_body}\n", item_type, group.len()),
        });
        for item in group {
            // 存储编号恒为规范形态（编号分配唯一来源），解析失败即数据损坏
            let code = DisplayCode::parse(&item.display_code)
                .unwrap_or_else(|e| panic!("损坏的条目编号 {}: {e}", item.display_code));
            files.push(ExportFile {
                path: format!("{dir}/{}.md", item_file_name(&code, &item.title)),
                content: render_item(item, &revision_summaries),
            });
        }
    }

    // facilitator 装配视图（INT-006 映射表；key 无文档不生成文件）
    for doc in &snapshot.docs {
        if let Some(path) = facilitator_doc_path(doc) {
            files.push(ExportFile {
                path: path.into(),
                content: format!("# {}\n\n{}\n", doc.title, doc.body_md),
            });
        }
    }
    // MOD 条目双视图：通用 MOD/ 目录（无损归档）+ modules/（模板兼容）
    if scope.is_none_or(|types| types.contains(&ItemType::Mod)) {
        for item in items.iter().filter(|i| i.item_type == ItemType::Mod) {
            let short = {
                let s = slug(&item.title);
                if s.is_empty() {
                    item.display_code.to_lowercase()
                } else {
                    s
                }
            };
            files.push(ExportFile {
                path: format!("05-detailed-design/modules/{short}.md"),
                content: render_item(item, &revision_summaries),
            });
        }
    }

    // 路径排序输出（确定性；同路径不存在重复——MOD 双视图路径不同）
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files
}

/// facilitator 装配视图映射（INT-006 表）
fn facilitator_doc_path(doc: &ProjectDoc) -> Option<&'static str> {
    match doc.doc_key {
        ProjectDocKey::Overview => Some("00-overview/README.md"),
        ProjectDocKey::Structure => Some("project-structure.md"),
        ProjectDocKey::TechStack => Some("tech-stack.md"),
        ProjectDocKey::DataModel => Some("05-detailed-design/data-model.md"),
    }
}

/// item_id → 修订摘要行（升序）
fn item_revision_summaries(snapshot: &ExportSnapshot) -> BTreeMap<uuid::Uuid, Vec<(u32, String, String)>> {
    let mut map: BTreeMap<uuid::Uuid, Vec<(u32, String, String)>> = BTreeMap::new();
    for r in &snapshot.revisions {
        map.entry(r.item_id).or_default().push((
            r.revision_no,
            ts_utc(r.changed_at),
            match r.summary.is_empty() {
                true => r.title.clone(),
                false => format!("{}（{}）", r.title, r.summary),
            },
        ));
    }
    map
}

/// 条目文件模板：元数据头 + 正文 + 修订摘要（INT-006）
fn render_item(item: &Item, summaries: &BTreeMap<uuid::Uuid, Vec<(u32, String, String)>>) -> String {
    let mut meta = String::new();
    let sorted: BTreeMap<String, String> = metadata_pairs(&item.metadata);
    for (k, v) in &sorted {
        meta.push_str(&format!("- {k}：{v}\n"));
    }
    let history = summaries
        .get(&item.id)
        .map(|rows| {
            rows.iter()
                .map(|(no, ts, text)| format!("- v{no} {ts} {text}"))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    format!(
        "# {} {}\n\n\
         - 状态：{}\n\
         - 当前修订：v{}\n\
         - 最后更新：{}\n{}\n\
         ---\n\n{}\n\n---\n\n## 修订历史\n\n{}\n",
        item.display_code,
        item.title,
        item.status,
        item.current_revision,
        ts_utc(item.updated_at),
        if meta.is_empty() { String::new() } else { format!("\n元数据：\n{meta}") },
        item.body_md,
        if history.is_empty() { "（无修订记录）".to_string() } else { history },
    )
}

/// 元数据 JSON → 有序键值对（仅扁平对象；值非字符串 → JSON 序列化形态；
/// 非对象 → 空映射。UI 契约 metadata 为 Record<string, string>，同口径）
pub fn metadata_pairs(metadata: &serde_json::Value) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    if let Some(obj) = metadata.as_object() {
        for (k, v) in obj {
            let value = match v.as_str() {
                Some(s) => s.to_string(),
                None => v.to_string(),
            };
            out.insert(k.clone(), value);
        }
    }
    out
}
