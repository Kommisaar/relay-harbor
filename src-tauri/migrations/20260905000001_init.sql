-- 初始 Schema（docs/design/05-detailed-design/data-model.md，2026-09-04 修订循环版：七表）。
-- 纪律（NFR-006）：迁移只增不改；降级（新库旧应用）在 open() 版本检查处明确报错。
-- 状态枚举不设 DB CHECK——状态机归属 domain（BR-002），DB 只存文本；
-- relation_type 例外：五类型是封闭词表且不涉状态机，用 CHECK 兜底。
-- 外键全部 ON DELETE CASCADE（BR-011 项目级联删除单事务，INV-010）。

CREATE TABLE projects (
    id         TEXT PRIMARY KEY NOT NULL, -- UUID v4（内部身份，DOM-001）
    name       TEXT NOT NULL,             -- 仅展示，不唯一（2026-08-27 确认）
    repo_path  TEXT,                      -- 关联仓库路径（仅登记，可空）
    created_at TEXT NOT NULL,             -- UTC（RFC3339/ISO-8601 文本）
    updated_at TEXT NOT NULL
);

CREATE TABLE items (
    id               TEXT PRIMARY KEY NOT NULL, -- UUID v4
    project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    display_code     TEXT NOT NULL,       -- 「前缀-序号」（DOM-008），UNIQUE 即 INV-001 兜底
    item_type        TEXT NOT NULL,       -- 15 种前缀之一，创建后不可变（INV-008）
    title            TEXT NOT NULL,
    body_md          TEXT NOT NULL,
    metadata         TEXT NOT NULL,       -- JSON（默认 {}）
    status           TEXT NOT NULL,       -- 状态文本；状态机归 domain（BR-002），不设 CHECK
    current_revision INTEGER NOT NULL,    -- 乐观并发凭据（BR-005），每次提交 +1
    superseded_by    TEXT REFERENCES items(id) ON DELETE CASCADE, -- 已替代时必填（INV-006 领域层校验）
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);

CREATE UNIQUE INDEX uq_items_project_code ON items(project_id, display_code);
CREATE INDEX ix_items_type_status ON items(project_id, item_type, status);

-- 不可变追加表（BR-004）：迁移与测试断言均无 UPDATE/DELETE 代码路径
CREATE TABLE revisions (
    item_id          TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    revision_no      INTEGER NOT NULL,    -- 单调递增（DOM-004）
    title            TEXT NOT NULL,       -- 修订标题（2026-09-03 用户指令新增，替代 actor）
    summary          TEXT NOT NULL,       -- 变更摘要（含 status: draft→in_review 类迁移记录）
    content_snapshot TEXT NOT NULL,       -- JSON RevisionContent（历史版本查看即读此列）
    changed_at       TEXT NOT NULL,
    PRIMARY KEY (item_id, revision_no)
);

CREATE TABLE relations (
    id            TEXT PRIMARY KEY NOT NULL, -- UUID v4
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    target_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL CHECK (relation_type IN ('derives','depends','satisfies','traces','relates'))
);

CREATE UNIQUE INDEX uq_relations_triple ON relations(source_id, target_id, relation_type); -- 同向同类唯一（幂等基础）
CREATE INDEX ix_relations_incoming ON relations(target_id); -- 入边：影响遍历/关联展开热点
CREATE INDEX ix_relations_outgoing ON relations(source_id); -- 出边

CREATE TABLE project_settings (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    data       TEXT NOT NULL -- JSON（M1 无写入口，保留概念表位）
);

-- 项目级文档（DOM-009，2026-09-04 由 project_overview 两表泛化）：不入 items 体系
CREATE TABLE project_docs (
    project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_key          TEXT NOT NULL,       -- 受控词表 overview/data_model/structure/tech_stack
    title            TEXT NOT NULL,
    body_md          TEXT NOT NULL,
    current_revision INTEGER NOT NULL,    -- 乐观并发凭据（BR-005 同口径）
    updated_at       TEXT NOT NULL,
    PRIMARY KEY (project_id, doc_key)
);

CREATE TABLE project_doc_revisions (
    project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_key          TEXT NOT NULL,
    revision_no      INTEGER NOT NULL,
    title            TEXT NOT NULL,       -- 修订标题（同 revisions，2026-09-03）
    summary          TEXT NOT NULL,
    content_snapshot TEXT NOT NULL,       -- JSON DocContent {title, body_md}
    changed_at       TEXT NOT NULL,
    PRIMARY KEY (project_id, doc_key, revision_no)
);
