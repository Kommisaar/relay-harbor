// Mock 数据集（后端联调暂缓，2026-08-28）：结构与 api-contracts INT-001 契约一致，
// 内容贴合本项目设计文档语境，供 UI 全量开发与走查。
// 联调时整目录随 mock/commands.ts 移除。

import type {
  AnyStatus,
  ItemType,
  ItemDetail,
  ProjectDoc,
  ProjectDocKey,
  ProjectDocRevision,
  ProjectSummary,
  RelationType,
  Revision,
  TaskCard,
} from "../types";

const NOW = Date.now();
const minutesAgo = (m: number) => NOW - m * 60_000;
const hoursAgo = (h: number) => NOW - h * 3_600_000;
const daysAgo = (d: number) => NOW - d * 86_400_000;

export interface MockProject {
  summary: ProjectSummary;
  items: ItemDetail[];
  relations: { source: string; target: string; type: RelationType }[];
  revisions: Revision[];
  /** 项目级文档（DOM-009）：按受控 key 挂接，未维护的 key 缺省（DOC_NOT_FOUND 样本） */
  docs: Partial<Record<ProjectDocKey, ProjectDoc>>;
  docRevisions: Partial<Record<ProjectDocKey, ProjectDocRevision[]>>;
}

interface ItemSpec {
  code: string;
  title: string;
  status?: AnyStatus;
  revision?: number;
  updated?: number;
  supersededBy?: string;
  metadata?: Record<string, string>;
  body?: string;
}

function makeItem(projectId: string, spec: ItemSpec): ItemDetail {
  const itemType = spec.code.split("-")[0] as ItemType;
  return {
    projectId,
    code: spec.code,
    itemType,
    title: spec.title,
    status: spec.status ?? "confirmed",
    currentRevision: spec.revision ?? 1,
    updatedAt: spec.updated ?? daysAgo(1),
    supersededBy: spec.supersededBy ?? null,
    bodyMd:
      spec.body ??
      [
        `## 描述`,
        ``,
        `${spec.title}。本节为正文示例（Markdown 只读渲染，UC-011）。`,
        ``,
        `- 关键点一：数据库为唯一事实来源（OQ-001）`,
        `- 关键点二：条目编号永不复用（BR-001）`,
        ``,
        `## 验收依据`,
        ``,
        `1. 内容与库中当前修订一致；`,
        `2. 历史版本只读且与当时保存一致。`,
      ].join("\n"),
    metadata: spec.metadata ?? { priority: "P2" },
    createdAt: spec.updated ? spec.updated - 86_400_000 * 7 : daysAgo(8),
  };
}

const relayItems: ItemSpec[] = [
  // FR 功能需求
  // FR-001 正文含代码块（2026-09-03 修订对比走查：r2 快照改写其中一行，
  // 行级代码 diff 场景，见 revisionsFor）
  {
    code: "FR-001",
    title: "Agent 经 MCP 写入设计资产",
    revision: 3,
    updated: minutesAgo(26),
    metadata: { priority: "P0" },
    body: [
      "## 描述",
      "",
      "Agent 经本地受控 MCP 通道写入项目、条目、关系与任务等设计资产（写入口唯一，CON-009）。",
      "",
      "## 接入示例",
      "",
      "```json",
      '{ "command": "create_item", "params": { "code": "FR-001" } }',
      "```",
      "",
      "## 验收依据",
      "",
      "1. 全部业务写入仅经 MCP 命令；",
      "2. 非法写入被拒绝并留痕（参见 [MCP 规范](https://modelcontextprotocol.io)）。",
    ].join("\n"),
  },
  { code: "FR-002", title: "项目创建与删除（MCP）", revision: 2, updated: daysAgo(2) },
  { code: "FR-003", title: "条目创建与编辑产生修订", revision: 3, updated: hoursAgo(3) },
  { code: "FR-004", title: "稳定编号分配", revision: 1, updated: daysAgo(6) },
  { code: "FR-005", title: "条目状态迁移（MCP）", status: "in_review", revision: 2, updated: hoursAgo(6) },
  { code: "FR-006", title: "关系建立与移除", revision: 1, updated: daysAgo(4) },
  { code: "FR-007", title: "任务管理与状态迁移", status: "in_review", revision: 2, updated: hoursAgo(5) },
  { code: "FR-008", title: "项目浏览与切换（UI）", revision: 2, updated: daysAgo(1) },
  { code: "FR-009", title: "条目浏览与详情（UI）", revision: 2, updated: daysAgo(1) },
  { code: "FR-010", title: "关联展开（UI）", revision: 1, updated: daysAgo(3) },
  { code: "FR-011", title: "任务看板（只读 UI）", revision: 2, updated: daysAgo(1) },
  { code: "FR-012", title: "关键词搜索（UI）", status: "draft", revision: 1, updated: hoursAgo(8) },
  { code: "FR-013", title: "影响定位（UI）", revision: 1, updated: daysAgo(2) },
  { code: "FR-014", title: "Markdown 导出（UI）", revision: 3, updated: minutesAgo(2), metadata: { priority: "P1" } },
  { code: "FR-015", title: "托盘常驻与单实例", revision: 1, updated: daysAgo(5) },
  { code: "FR-016", title: "应用设置（主题/语言/关闭行为）", revision: 2, updated: minutesAgo(10) },
  { code: "FR-017", title: "恢复上次浏览位置（UI）", status: "draft", revision: 1, updated: minutesAgo(45) },
  { code: "FR-018", title: "项目概览视图（UI）", status: "in_review", revision: 1, updated: minutesAgo(30) },
  { code: "FR-019", title: "条目批量基线确认", status: "cancelled", revision: 1, updated: daysAgo(9) },
  { code: "FR-020", title: "设计条目批量导入", status: "superseded", supersededBy: "FR-021", revision: 2, updated: daysAgo(7) },
  { code: "FR-021", title: "确定性导入与基线快照（M2）", status: "draft", revision: 1, updated: daysAgo(7) },
  // 已废弃走查样本：确认后失效且无后继（2026-09-02 新增终态，被 CON-009 只读边界取代）
  { code: "FR-022", title: "内置轻量编辑器", status: "deprecated", revision: 3, updated: daysAgo(3) },

  // NFR / BR / CON
  { code: "NFR-001", title: "数据可靠性（强杀不丢）", revision: 1, updated: daysAgo(6) },
  { code: "NFR-002", title: "万级条目规模响应", revision: 2, updated: daysAgo(2) },
  { code: "NFR-005", title: "本地通道安全（回环+令牌）", revision: 1, updated: daysAgo(6) },
  { code: "NFR-008", title: "界面一致性（Fluent v9）", revision: 1, updated: daysAgo(3) },
  { code: "BR-001", title: "项目内编号唯一且永不复用", revision: 1, updated: daysAgo(8) },
  { code: "BR-004", title: "修订不可变追加", revision: 1, updated: daysAgo(8) },
  { code: "BR-010", title: "任务阻塞派生规则", revision: 2, updated: daysAgo(2) },
  { code: "CON-006", title: "桌面应用独立安装、托盘常驻", revision: 1, updated: daysAgo(8) },
  { code: "CON-009", title: "UI 零业务写命令", revision: 1, updated: daysAgo(4) },

  // UC / DOM
  { code: "UC-004", title: "编辑条目产生修订", revision: 1, updated: daysAgo(5) },
  { code: "UC-009", title: "建立 MCP 会话", revision: 2, updated: daysAgo(2) },
  { code: "UC-011", title: "查看条目详情与修订历史", revision: 1, updated: daysAgo(3) },
  { code: "UC-015", title: "影响定位", revision: 1, updated: daysAgo(2) },
  { code: "UC-016", title: "导出 Markdown 文档集", revision: 2, updated: daysAgo(1) },
  { code: "DOM-002", title: "条目（设计资产对象）", revision: 1, updated: daysAgo(9) },
  { code: "DOM-003", title: "关系（有向语义链接）", revision: 1, updated: daysAgo(9) },
  { code: "DOM-006", title: "任务（TASK 条目）", revision: 1, updated: daysAgo(9) },
  { code: "DOM-008", title: "显示编号（前缀-序号）", revision: 1, updated: daysAgo(9) },
  { code: "DOM-009", title: "项目级文档（受控 key）", status: "in_review", revision: 1, updated: hoursAgo(20) },

  // CMP / INT / SEQ
  { code: "CMP-001", title: "前端应用（WebView）", revision: 2, updated: daysAgo(1) },
  { code: "CMP-003", title: "本地 HTTP API 层", revision: 1, updated: daysAgo(6) },
  { code: "CMP-007", title: "导出器", revision: 1, updated: daysAgo(4) },
  { code: "INT-001", title: "Tauri IPC 只读命令通道", revision: 2, updated: minutesAgo(30) },
  { code: "INT-006", title: "导出命令与进度事件", revision: 1, updated: daysAgo(4) },
  { code: "SEQ-001", title: "MCP 写入全链路", revision: 1, updated: daysAgo(5) },

  // UI（界面设计规格，2026-09-01 用户指令升格第 14 类型；标题取 ui/README 索引）
  { code: "UI-001", title: "双层侧栏骨架（活动栏双态+项目导航栏）", revision: 2, updated: daysAgo(1) },
  { code: "UI-002", title: "导航内容（总览+项目清单+子导航）", revision: 2, updated: daysAgo(1) },
  { code: "UI-003", title: "主题三态（跟随系统/浅色/深色）", revision: 1, updated: daysAgo(6) },
  { code: "UI-004", title: "界面语言三态（中/英/跟随系统）", revision: 1, updated: daysAgo(6) },
  { code: "UI-005", title: "冷启动恢复上次浏览位置", revision: 1, updated: daysAgo(5) },
  { code: "UI-006", title: "系统原生标题栏", revision: 1, updated: daysAgo(7) },
  { code: "UI-007", title: "窗口默认尺寸与缩放边界", revision: 1, updated: daysAgo(7) },
  { code: "UI-010", title: "项目列表页（列表行/卡片双形态）", revision: 2, updated: daysAgo(2) },
  { code: "UI-011", title: "项目概览页（统计/分布/修订/阻塞）", revision: 1, updated: minutesAgo(30) },
  { code: "UI-012", title: "条目按类型拆独立子页面", revision: 3, updated: minutesAgo(12) },
  { code: "UI-013", title: "条目标准行", revision: 1, updated: daysAgo(3) },
  { code: "UI-014", title: "条目页过滤工具条", revision: 2, updated: minutesAgo(12) },
  { code: "UI-015", title: "条目详情独立页", revision: 1, updated: daysAgo(4) },
  { code: "UI-016", title: "详情单栏滚动结构", revision: 1, updated: daysAgo(4) },
  { code: "UI-017", title: "修订时间线+版本切换", revision: 1, updated: daysAgo(4) },
  { code: "UI-018", title: "影响定位内嵌清单", revision: 1, updated: daysAgo(4) },
  { code: "UI-019", title: "任务面板（看板五列）", status: "in_review", revision: 2, updated: daysAgo(1) },
  { code: "UI-020", title: "任务卡片基础款", revision: 1, updated: daysAgo(3) },
  { code: "UI-021", title: "看板全局单过滤框", revision: 1, updated: daysAgo(3) },
  { code: "UI-022", title: "搜索独立页（暂缓）", status: "cancelled", revision: 1, updated: daysAgo(6) },
  { code: "UI-023", title: "导出卡片弹出框", revision: 2, updated: daysAgo(2) },
  { code: "UI-024", title: "设置单页分组卡片", revision: 1, updated: daysAgo(5) },
  { code: "UI-030", title: "状态徽章语义色映射", revision: 1, updated: daysAgo(2) },
  { code: "UI-031", title: "引导式空态", revision: 1, updated: daysAgo(2) },
  { code: "UI-032", title: "加载态（骨架屏/spinner）", revision: 2, updated: minutesAgo(40) },
  { code: "UI-033", title: "全部项目导出页（已移除）", status: "cancelled", revision: 1, updated: daysAgo(6) },
  { code: "UI-034", title: "设计文档浏览页", status: "draft", revision: 1, updated: minutesAgo(8) },

  // MOD（模块设计，2026-09-04 修订循环升格第 15 类型：模块职责/对外接口/内部结构）
  {
    code: "MOD-001",
    title: "模块设计：MCP 工具集与写入门面",
    status: "in_review",
    revision: 2,
    updated: daysAgo(2),
    body: [
      "## 模块职责",
      "",
      "MCP 工具集是 Agent 写入的唯一业务入口（CON-009）：工具参数经校验后转入领域服务，以 ChangeSet 单事务落库（ADR-002）。",
      "",
      "## 对外接口",
      "",
      "| 工具 | 读/写 | 说明 |",
      "| --- | --- | --- |",
      "| get_item | 读 | 按编号取条目当前修订 |",
      "| create_item / update_item | 写 | 创建与编辑，产生不可变修订（BR-004） |",
      "| set_project_doc | 写 | 维护项目级文档（DOM-009 / FR-019） |",
      "",
      "## 内部结构",
      "",
      "- 工具路由：参数解析与错误短码映射",
      "- 校验器：编号唯一、状态迁移、引用存在性（BR-001 / BR-005）",
      "- 事务装配：ChangeSet 收集与提交",
    ].join("\n"),
  },
  {
    code: "MOD-002",
    title: "模块设计：确定性导出器",
    revision: 1,
    updated: daysAgo(3),
    body: [
      "## 模块职责",
      "",
      "把项目内条目渲染为确定性 Markdown 文档集（FR-014）：同一数据库状态导出结果逐字节一致，便于 Git 审查。",
      "",
      "## 对外接口",
      "",
      "- `export_markdown(project_id, options)`：目录 / zip 两种形态，进度经事件上报（INT-006）",
      "",
      "## 内部结构",
      "",
      "- 装配视图：类型 → 文件布局（含 facilitator 装配视图，INT-006）",
      "- 渲染器：条目正文 + 元信息头 + 修订尾注",
      "- 写出器：临时目录 → 原子改名，目标已存在即拒绝覆盖",
    ].join("\n"),
  },
  { code: "MOD-003", title: "模块设计：条目浏览与详情模块", status: "draft", revision: 1, updated: daysAgo(1) },

  // ADR / RISK / OQ
  { code: "ADR-002", title: "意图级存储端口 + ChangeSet 单事务", revision: 2, updated: daysAgo(3) },
  { code: "ADR-006", title: "IPC 只读通道与事件失效", revision: 1, updated: daysAgo(4) },
  { code: "ADR-007", title: "React + Fluent UI v9 前端栈", revision: 1, updated: daysAgo(7) },
  { code: "RISK-004", title: "编码 Agent 越界写入", revision: 1, updated: daysAgo(5) },
  { code: "RISK-008", title: "LIKE 搜索规模性能", status: "in_review", revision: 2, updated: hoursAgo(4) },
  { code: "OQ-001", title: "数据库为唯一事实来源", revision: 1, updated: daysAgo(10) },

  // TASK（任务状态机）
  { code: "TASK-001", title: "搭建 Tauri 脚手架与 CI 三件套", status: "done", revision: 3, updated: daysAgo(2) },
  { code: "TASK-002", title: "实现 SQLite 存储与迁移", status: "done", revision: 2, updated: daysAgo(1) },
  // 工具数随 2026-09-04 修订循环 12→14（+get_project_doc / set_project_doc）
  { code: "TASK-003", title: "实现 MCP 工具集 14 个", status: "doing", revision: 2, updated: hoursAgo(2), metadata: { priority: "P0" } },
  { code: "TASK-004", title: "实现 IPC 只读命令面", status: "await_review", revision: 1, updated: hoursAgo(6) },
  { code: "TASK-005", title: "本地 HTTP API 鉴权与握手", status: "doing", revision: 2, updated: hoursAgo(3) },
  { code: "TASK-006", title: "关系图可视化（M2 预研）", status: "cancelled", revision: 1, updated: daysAgo(4) },
  { code: "TASK-007", title: "UI 全量实现（mock 数据）", status: "todo", revision: 1, updated: minutesAgo(15), metadata: { priority: "P0" } },
  { code: "TASK-008", title: "确定性导出目录结构", status: "todo", revision: 1, updated: hoursAgo(9) },
  { code: "TASK-009", title: "后端命令落地与前后端联调", status: "todo", revision: 1, updated: minutesAgo(5) },
  { code: "TASK-010", title: "基线确认流程（M2 回补编号）", status: "todo", revision: 1, updated: daysAgo(1) },
];

const relayRelations: MockProject["relations"] = [
  // 设计派生自需求（A derives B：A 派生自 B）
  { source: "CMP-001", target: "FR-008", type: "derives" },
  { source: "CMP-001", target: "FR-009", type: "derives" },
  { source: "INT-001", target: "FR-008", type: "derives" },
  { source: "INT-001", target: "CON-009", type: "derives" },
  { source: "CMP-003", target: "NFR-005", type: "derives" },
  { source: "CMP-007", target: "FR-014", type: "derives" },
  { source: "ADR-006", target: "CON-009", type: "derives" },
  { source: "SEQ-001", target: "ADR-002", type: "derives" },
  // 任务满足需求（A satisfies B）
  { source: "TASK-003", target: "FR-001", type: "satisfies" },
  { source: "TASK-004", target: "FR-008", type: "satisfies" },
  { source: "TASK-004", target: "INT-001", type: "satisfies" },
  { source: "TASK-005", target: "NFR-005", type: "satisfies" },
  { source: "TASK-007", target: "FR-009", type: "satisfies" },
  { source: "TASK-008", target: "FR-014", type: "satisfies" },
  { source: "TASK-009", target: "INT-001", type: "satisfies" },
  { source: "TASK-001", target: "CON-006", type: "satisfies" },
  // 任务依赖（A depends B：B 未完成则 A 阻塞）
  { source: "TASK-009", target: "TASK-004", type: "depends" },
  { source: "TASK-009", target: "TASK-005", type: "depends" },
  { source: "TASK-007", target: "TASK-003", type: "depends" },
  { source: "TASK-008", target: "TASK-002", type: "depends" },
  // 溯迹与松散关联
  { source: "ADR-007", target: "OQ-001", type: "traces" },
  { source: "RISK-008", target: "NFR-002", type: "traces" },
  { source: "FR-018", target: "UC-011", type: "relates" },
  { source: "FR-021", target: "FR-014", type: "relates" },
  // UI 规格派生自需求/界面相关（2026-09-01 UI 类型样本）
  { source: "UI-012", target: "FR-009", type: "derives" },
  { source: "UI-019", target: "FR-011", type: "derives" },
  { source: "UI-023", target: "FR-014", type: "derives" },
  { source: "UI-034", target: "FR-009", type: "relates" },
  // MOD 模块设计派生自所属组件（2026-09-04 第 15 类型样本）
  { source: "MOD-001", target: "CMP-003", type: "derives" },
  { source: "MOD-002", target: "CMP-007", type: "derives" },
  { source: "MOD-003", target: "CMP-001", type: "derives" },
];

function snapshotOf(item: ItemDetail, statusOverride?: AnyStatus, bodyMd?: string): Revision["snapshot"] {
  return {
    title: item.title,
    bodyMd: bodyMd ?? item.bodyMd,
    metadata: { ...item.metadata },
    status: statusOverride ?? item.status,
  };
}

function revisionsFor(projectId: string, items: ItemDetail[]): Revision[] {
  const out: Revision[] = [];
  for (const item of items) {
    // r1 一定是创建；多修订条目的 r2/r3 快照正文差异化（2026-09-03 修订
    // 对比走查：r2→r3 演示列表项删除 + 引用新增，r1→r2 演示小节新增）
    out.push({
      code: item.code,
      revisionNo: 1,
      title: "创建条目",
      summary: "",
      changedAt: item.createdAt,
      snapshot: snapshotOf(item, item.itemType === "TASK" ? "todo" : "draft"),
    });
    if (item.currentRevision >= 2) {
      out.push({
        code: item.code,
        revisionNo: 2,
        title: "修订正文与元数据",
        summary: `内容微调（${item.title}）`,
        changedAt: item.updatedAt + 3_600_000,
        snapshot: snapshotOf(
          item,
          item.itemType === "TASK" ? "doing" : "in_review",
          [
            // FR-001 的接入示例命令在 r2 改写（行级代码 diff 走查样本），
            // 验收依据中的外链在 r2 移除（删除块内链接去活化走查样本）
            item.bodyMd
              .replace("{ \"command\": \"create_item\"", "{ \"command\": \"get_item\"")
              .replace("（参见 [MCP 规范](https://modelcontextprotocol.io)）", ""),
            "",
            "## 评审记录",
            "",
            "- 2026-09-02 评审通过，验收口径见正文",
            "- 补充性能基线对比数据（已复核）",
          ].join("\n"),
        ),
      });
    }
    if (item.currentRevision >= 3) {
      out.push({
        code: item.code,
        revisionNo: 3,
        title: item.status === "in_review" || item.status === "draft" ? "补充验收依据" : "确认定稿",
        summary: "",
        changedAt: item.updatedAt,
        snapshot: snapshotOf(item, undefined, [
          item.bodyMd,
          "",
          "## 评审记录",
          "",
          "- 2026-09-02 评审通过，验收口径见正文",
          "",
          "> 跟进：性能基线已复核，无需追加任务",
        ].join("\n")),
      });
    }
  }
  return out.sort((a, b) => b.changedAt - a.changedAt);
}

function docRevision(
  no: number,
  title: string,
  summary: string,
  changedAt: number,
  doc: ProjectDoc,
): ProjectDocRevision {
  return { revisionNo: no, title, summary, changedAt, snapshot: { title: doc.title, bodyMd: doc.bodyMd } };
}

/** 项目级文档构建规格：bodies / revTitles / summaries / changedAt 按修订序号
    1..n 对齐，末位即当前版（DOM-009） */
interface DocSpec {
  key: ProjectDocKey;
  title: string;
  bodies: string[];
  revTitles: string[];
  summaries: string[];
  changedAt: number[];
}

function buildDocs(specs: DocSpec[]): Pick<MockProject, "docs" | "docRevisions"> {
  const docs: MockProject["docs"] = {};
  const docRevisions: MockProject["docRevisions"] = {};
  for (const spec of specs) {
    const latest = spec.bodies.length;
    const doc: ProjectDoc = {
      title: spec.title,
      bodyMd: spec.bodies[latest - 1] ?? "",
      revisionNo: latest,
      summary: spec.summaries[latest - 1] ?? "",
      changedAt: spec.changedAt[latest - 1] ?? 0,
    };
    docs[spec.key] = doc;
    docRevisions[spec.key] = spec.bodies.map((bodyMd, i) =>
      docRevision(i + 1, spec.revTitles[i] ?? "", spec.summaries[i] ?? "", spec.changedAt[i] ?? 0, { ...doc, bodyMd }),
    );
  }
  return { docs, docRevisions };
}

const relayProject: MockProject = (() => {
  const items = relayItems.map((s) => makeItem("p-relay", s));
  const taskCount = items.filter((i) => i.itemType === "TASK").length;
  const summary: ProjectSummary = {
    id: "p-relay",
    name: "relay-harbor 设计库",
    repoPath: "D:\\projects\\relay-harbor",
    itemCount: items.length - taskCount,
    taskCount,
    updatedAt: Math.max(...items.map((i) => i.updatedAt)),
  };
  // 项目级文档（get_project_doc(key)，DOM-009）：overview 浓缩自本项目
  // docs/design/00-overview/README.md（已确认基线），Agent 经 MCP 随基线演进
  // 维护；data_model / structure / tech_stack 为 2026-09-04 泛化新增样本。
  // 各版正文有实质差异，支撑版本切换走查
  const r1Body = [
    "## 定位",
    "",
    "RelayHarbor 是面向 AI 辅助开发流程的本地管理与追踪应用：把需求、设计、任务及其关系放入一个可校验、可查询、可视化的管理平面。",
    "",
    "## 重点解决的问题",
    "",
    "- 设计与任务散落在多个文档中，Agent 为定位单个条目需要加载过多上下文；",
    "- 模型直接编辑文件时难以统一保证编号、状态、引用和并发一致性；",
    "- 需求变更后，受影响的设计和任务缺少直观追踪；",
    "- Markdown 适合审查，但不适合稳定承担复杂查询、状态迁移和关系图；",
    "- 临时 MCP 进程退出后，可视化界面和本地管理能力随之消失。",
  ].join("\n");
  const r2Body = [
    r1Body,
    "",
    "## 当前已明确方向",
    "",
    "- 产品形态为 Tauri 桌面应用，单实例 + 系统托盘常驻",
    "- 业务写入唯一入口为 MCP，UI 只读并负责 Markdown 导出",
    "- 数据库为唯一运行时事实来源，导出的 Markdown/JSON 仅为确定性快照",
    "- UI 与 MCP 共用同一套领域规则、状态迁移和事务",
    "",
    "## 里程碑范围",
    "",
    "### M1 · Agent 写入平面 + 只读 UI",
    "",
    "- MCP 接入：本地受控 API（回环 + 令牌）与 mcp-bridge 连接器",
    "- Agent 写入：项目、条目、状态迁移、关系与任务的全部管理操作",
    "- 只读 UI：项目浏览、条目详情、关联展开、任务看板、影响定位",
    "- Markdown 文档集导出（与 dev-toolkit 文档体系格式兼容）",
    "- SQLite 存储、原子事务、乐观并发与不可变修订",
    "",
    "### M2 · 流程与交换",
    "",
    "- 基线确认流程与变更集预览界面",
    "- Markdown / JSON 确定性导入与基线快照",
    "- 依赖与追踪关系图可视化",
    "",
    "## 接入示例",
    "",
    "```json",
    '{ "command": "get_item" }',
    "```",
  ].join("\n");
  const r3Body = [
    r1Body,
    "",
    "## 当前已明确方向",
    "",
    "- Tauri 桌面应用，单实例 + 系统托盘常驻（CON-006）",
    "- 业务写入唯一入口为 MCP，UI 只读并负责 Markdown 导出（CON-009）",
    "- 数据库为唯一运行时事实来源，导出的 Markdown/JSON 仅为确定性快照（OQ-001）",
    "- UI 与 MCP 共用同一套领域规则、状态迁移和事务（ADR-002）",
    "- 稳定显示编号（DOM-008），模型按编号读取条目，如 get_item(\"FR-001\")",
    "- 首发 Windows 优先，代码保持跨平台边界（OQ-005）",
    "",
    "## 里程碑范围",
    "",
    "### M1 · Agent 写入平面 + 只读 UI",
    "",
    "- MCP 接入：本地受控 API（回环 + 令牌）与 mcp-bridge 连接器",
    "- Agent 写入：项目、条目、状态迁移、关系与任务的全部管理操作",
    "- 只读 UI：项目浏览、条目详情、关联展开、任务看板、影响定位",
    "- Markdown 文档集导出（与 dev-toolkit 文档体系格式兼容）",
    "- SQLite 存储、原子事务、乐观并发与不可变修订",
    "",
    "### M2 · 流程与交换",
    "",
    "- 基线确认流程与变更集预览界面",
    "- Markdown / JSON 确定性导入与基线快照",
    "- 依赖与追踪关系图可视化",
    "",
    "## 成功标准",
    "",
    "### M1 · 首版",
    "",
    "- Agent 可经 MCP 完成项目、条目、状态、关系与任务的全部管理写入",
    "- 非法状态迁移、重复编号、悬空引用和任务依赖环会被拒绝",
    "- 已确认条目不能被物理删除，只能取消、废弃或替代",
    "- 用户可经只读界面浏览全部内容并导出 Markdown 文档集",
    "- 关闭主窗口后应用仍在系统托盘运行，数据跨会话持久",
    "",
    "### M2 · 连接版追加",
    "",
    "- 基线确认流程与变更集预览界面可用",
    "- Markdown / JSON 确定性导入与快照可用，便于 Git 审查与恢复",
    "- 依赖与追踪关系图可视化可用",
    "",
    "## 主要风险",
    "",
    "| 风险 | 缓解 |",
    "| --- | --- |",
    "| 数据库取代 Markdown 后降低原生 Git 可读性 | 不可变修订 + 确定性快照 |",
    "| 桌面应用与 Plugin 版本漂移 | 能力协商与兼容版本检查 |",
    "| 本地接口被其他进程滥用 | 回环限制、随机端口、令牌与 Origin 校验 |",
    "| 业务写入唯一依赖 MCP 通道 | 托盘常驻、bridge 自动拉起应用与明确失败提示 |",
    "",
    "## 接入示例",
    "",
    "```json",
    '{ "command": "get_item", "params": { "code": "FR-001" } }',
    "// 本地受控 API：回环 + 令牌（CON-006）",
    "```",
  ].join("\n");
  const dataModelR1 = [
    "## 概念总览",
    "",
    "- 项目（project）：设计资产的顶层容器，绑定仓库路径",
    "- 条目（item）：15 种类型前缀的设计资产对象（DOM-002）",
    "- 修订（revision）：不可变追加的版本快照（BR-004）",
    "- 关系（relation）：derives / satisfies / depends / traces / relates 五类有向语义链接（DOM-003）",
    "- 任务（task）：五态状态机的 TASK 条目（DOM-006）",
    "",
    "## 编号与关系",
    "",
    "显示编号为「前缀-序号」（DOM-008），项目内唯一且永不复用（BR-001）；关系动者在前（A derives B：A 派生自 B）。",
  ].join("\n");
  const dataModelR2 = [
    dataModelR1,
    "",
    "## 项目级文档（DOM-009）",
    "",
    "project_docs 以受控 key（overview / data_model / structure / tech_stack）挂接项目级综述，独立于条目修订流；",
    "project_doc_revisions 同样不可变追加，Agent 经 MCP 工具 set_project_doc 修订（FR-019）。",
  ].join("\n");
  const structureBody = [
    "## 目录结构",
    "",
    "- `src/`：React 前端，app / features / components / api 分层，依赖单向",
    "- `src-tauri/`：Rust 壳与领域服务，interfaces → services → domain ← infra",
    "- `docs/design/`：设计文档基线（00 概览 → 06 验证）",
    "- `config/`：依赖白名单与 IPC 命令白名单等机器强制配置",
    "",
    "## 分层边界",
    "",
    "- 前端依赖单向 app → features → components/shared/api，feature 之间禁止互引；",
    "- invoke 只允许出现在 `src/api`，业务写前缀命令禁止（CON-009）。",
  ].join("\n");
  const techStackBody = [
    "## 技术选型",
    "",
    "- 桌面壳：Tauri 2（WebView 复用系统能力）",
    "- 前端：React 19 + Fluent UI v9（Griffel 样式）+ Vite 6 + TypeScript strict",
    "- 存储：SQLite（唯一运行时事实来源，OQ-001）",
    "- 图表：@ant-design/charts（classic / classicDark 随主题切换）",
    "",
    "## 决策留痕",
    "",
    "技术决策一律先落 ADR 条目（ADR-002 / ADR-006 / ADR-007），本综述只做现状汇总，不承载决策过程。",
  ].join("\n");
  const docData = buildDocs([
    {
      key: "overview",
      title: "RelayHarbor 项目概览",
      bodies: [r1Body, r2Body, r3Body],
      revTitles: ["创建项目概览", "补充方向与里程碑范围", "同步 00 基线"],
      summaries: ["定位与重点问题", "", "方向标注设计编号，补成功标准与主要风险"],
      changedAt: [daysAgo(12), daysAgo(5), hoursAgo(30)],
    },
    {
      key: "data_model",
      title: "RelayHarbor 数据模型综述",
      bodies: [dataModelR1, dataModelR2],
      revTitles: ["创建数据模型综述", "补充项目级文档概念"],
      summaries: ["五大概念与编号规则", "DOM-009 项目级文档"],
      changedAt: [daysAgo(4), hoursAgo(20)],
    },
    {
      key: "structure",
      title: "RelayHarbor 项目结构综述",
      bodies: [structureBody],
      revTitles: ["创建项目结构综述"],
      summaries: ["目录分层与边界规则"],
      changedAt: [daysAgo(2)],
    },
    {
      key: "tech_stack",
      title: "RelayHarbor 技术综述",
      bodies: [techStackBody],
      revTitles: ["创建技术综述"],
      summaries: ["选型现状与决策留痕约定"],
      changedAt: [daysAgo(2)],
    },
  ]);
  return {
    summary,
    items,
    relations: relayRelations,
    revisions: revisionsFor("p-relay", items),
    ...docData,
  };
})();

const zhsppyItems: ItemSpec[] = [
  { code: "FR-001", title: "识别项配置化管理", revision: 2, updated: hoursAgo(5) },
  { code: "FR-002", title: "审核规则入库", status: "in_review", revision: 1, updated: hoursAgo(2) },
  { code: "UC-001", title: "新增识别项", revision: 1, updated: daysAgo(3) },
  { code: "BR-001", title: "SBD_ 编号空间规则", revision: 1, updated: daysAgo(4) },
  { code: "TASK-001", title: "评分表覆盖度对比", status: "doing", revision: 1, updated: hoursAgo(1) },
  { code: "TASK-002", title: "规则端联调", status: "todo", revision: 1, updated: hoursAgo(8) },
];

const zhsppyProject: MockProject = (() => {
  const items = zhsppyItems.map((s) => makeItem("p-zhsppy", s));
  const taskCount = items.filter((i) => i.itemType === "TASK").length;
  const zr1Body = [
    "## 定位",
    "",
    "环评智能审核双项目之提取端：从环评报告书中提取识别项并维护审核规则数据，为规则端（zhspzs）评分提供结构化输入。",
    "",
    "## 重点解决的问题",
    "",
    "- 识别项散落在各项目评分表，口径不统一",
    "- 人工摘录效率低且易漏项",
    "- 审核规则与评分表覆盖度难以对照",
  ].join("\n");
  const zr2Body = [
    zr1Body,
    "",
    "## 当前已明确方向",
    "",
    "- 识别项配置化管理，统一入库（CG_RECO_PROJ）",
    "- SBD_/HJS_/DL_ 编号空间分治",
    "- 与规则端经结构化数据衔接，不做双向写入",
    "",
    "## 里程碑范围",
    "",
    "### M1 · 提取端入库",
    "",
    "- 识别项配置化管理",
    "- 审核规则入库",
    "",
    "### M2 · 规则端联调",
    "",
    "- 评分表覆盖度对比",
    "- 规则端联调",
    "",
    "## 成功标准",
    "",
    "### M1 · 首版",
    "",
    "- 识别项可配置化维护",
    "- 审核规则可入库检索",
    "",
    "## 主要风险",
    "",
    "| 风险 | 缓解 |",
    "| --- | --- |",
    "| 报告书格式差异导致提取遗漏 | 分项目维护识别词表并定期比对覆盖度 |",
  ].join("\n");
  // 仅维护 overview：其余受控 key 缺文档（get_project_doc 抛 DOC_NOT_FOUND 走查样本）
  const docData = buildDocs([
    {
      key: "overview",
      title: "zhsppy 提取端项目概览",
      bodies: [zr1Body, zr2Body],
      revTitles: ["创建项目概览", "补方向、范围与成功标准"],
      summaries: ["定位与重点问题", "明确成功标准与主要风险"],
      changedAt: [daysAgo(9), daysAgo(2)],
    },
  ]);
  return {
    summary: {
      id: "p-zhsppy",
      name: "zhsppy 提取端",
      repoPath: "D:\\projects\\zhsppy",
      itemCount: items.length - taskCount,
      taskCount,
      updatedAt: Math.max(...items.map((i) => i.updatedAt)),
    },
    items,
    relations: [
      { source: "TASK-001", target: "FR-001", type: "satisfies" },
      { source: "TASK-002", target: "FR-002", type: "satisfies" },
      { source: "TASK-002", target: "TASK-001", type: "depends" },
      { source: "UC-001", target: "BR-001", type: "traces" },
    ],
    revisions: revisionsFor("p-zhsppy", items),
    ...docData,
  };
})();

export const projects: MockProject[] = [relayProject, zhsppyProject];

export function findProject(projectId: string): MockProject | undefined {
  return projects.find((p) => p.summary.id === projectId);
}

export function findItem(projectId: string, code: string): ItemDetail | undefined {
  return findProject(projectId)?.items.find((i) => i.code === code);
}

/** 未完成 = 任务状态机非终态（阻塞派生前提，BR-010） */
export function isTaskActive(card: Pick<TaskCard, "status">): boolean {
  return card.status === "todo" || card.status === "doing" || card.status === "await_review";
}
