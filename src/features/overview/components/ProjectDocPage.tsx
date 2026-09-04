// 项目级文档页（UI-035，2026-09-02 用户指令新增，同日改版 article 文档形态；
// 2026-09-04 修订循环 DOM-009 泛化 + 同日用户指令补浏览入口）：按受控 key
// 渲染任意项目级文档——index（无 key 参数）= 概览实例，进入项目默认落地
// 页；docs/:key 直达其余三篇（数据模型/项目结构/技术综述）。渲染机制四
// key 同构：头部（标题 + 修订元信息 chips）+ Markdown 正文 + 修订时间线
// 版本切换。
// 与上一版的单栏 diff 由修订历史分区标题行的「与上一版对比」手动开关控制
// （2026-09-03 同日第八次设计修订：废止自动 diff 与版本提示条 MessageBar；
// 默认关显快照、开显 diff，当前版同样适用；回到当前 = 点时间线当前版）。
// 数据 get_project_doc(key) / list_project_doc_revisions(key)（INT-001
// 白名单 16 条），Agent 经 MCP 维护，UI 只读渲染；文档内容不参与 i18n
// （与条目正文同策略）。词表外 key（伪造 URL）Navigate 回落概览（静态
// 词表无 404 页）。
import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Title2, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowExpand16Regular, History16Regular } from "@fluentui/react-icons";
import { PROJECT_DOC_KEYS, type ProjectDocKey } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { SkeletonRows } from "../../../components/Skeletons";
import { RelativeTime } from "../../../components/RelativeTime";
import { MarkdownBody } from "../../../components/MarkdownBody";
import { MarkdownDiffBody } from "../../../components/markdown-diff/MarkdownDiffBody";
import { CapsulePanel, CapsulePanelCollapseButton, CapsulePanelSection } from "../../../components/CapsulePanel";
import { RevisionTimeline } from "../../../components/RevisionTimeline";
import { RevisionDiffToggle } from "../../../components/RevisionDiffToggle";
import { MetaChip } from "../../../components/MetaChip";
import { PageFadeIn } from "../../../components/PageFadeIn";
import { usePageContainerStyles } from "../../../components/usePageContainerStyles";
import { findPreviousRevision } from "../../../components/findPreviousRevision";
import { useProjectDocQuery, useProjectDocRevisionsQuery } from "../queries";

const useStyles = makeStyles({
  header: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, marginBottom: tokens.spacingVerticalL },
  titleRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap" },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    color: tokens.colorNeutralForeground3,
  },
});

export function ProjectDocPage() {
  const styles = useStyles();
  // 页面容器：workbench 族，内容宽上限 1080（patterns.md「页面容器与标题对齐」；
  // article 形态与条目详情页同口径）。承载 fixed 胶囊 → 容器不参与渐入
  // 动画（enter=false），内容层 PageFadeIn 包裹（patterns.md「页面内容渐入」）
  const page = usePageContainerStyles("workbench", false);
  const { t } = useTranslation();
  const { projectId = "", key: keyParam } = useParams();
  // 受控词表校验（DOM-009）：词表内 key 直达；词表外 key 重定向回落概览。
  // 校验判定放在全部 hooks 之后（hooks 以兜底 overview 取数，同项目缓存
  // 去重、重定向即弃，无害）
  const keyValid = keyParam !== undefined && (PROJECT_DOC_KEYS as readonly string[]).includes(keyParam);
  const docKey: ProjectDocKey = keyValid ? (keyParam as ProjectDocKey) : "overview";
  const doc = useProjectDocQuery(projectId, docKey);
  const revisions = useProjectDocRevisionsQuery(projectId, docKey);
  /** null = 当前版本；数字 = 查看该历史版本快照（UI-017 同款，本地 state 不入 URL） */
  const [viewedRevision, setViewedRevision] = useState<number | null>(null);
  // 修订对比开关（patterns.md「修订对比」，2026-09-03 手动开关口径）：
  // 页面本地 state——默认关（快照）、跨修订切换保持、离开页面即重置
  const [diffOn, setDiffOn] = useState(false);
  // 修订面板开合（壳层 CapsulePanel 受控；单分区面板，label 沿用「修订历史」）
  const [panelOpen, setPanelOpen] = useState(false);
  // 同一路由元素切换 :projectId / :key 时 React Router 会复用组件实例；
  // 项目级查看态不可泄漏到下一个项目或下一篇文档。
  useEffect(() => {
    setViewedRevision(null);
    setDiffOn(false);
    setPanelOpen(false);
  }, [projectId, docKey]);
  useEffect(() => {
    if (viewedRevision == null || revisions.data === undefined) {
      return;
    }
    if (!revisions.data.some((revision) => revision.revisionNo === viewedRevision)) {
      setViewedRevision(null);
    }
  }, [viewedRevision, revisions.data]);
  // 修订按号排序（紧邻上一版据此取前一项，不假设编号连续）；
  // hooks 置于提前 return 之前（patterns.md「修订对比」）
  const sortedRevisions = useMemo(
    () => [...(revisions.data ?? [])].sort((a, b) => a.revisionNo - b.revisionNo),
    [revisions.data],
  );

  if (keyParam !== undefined && !keyValid) {
    return <Navigate to={`/projects/${projectId}`} replace />;
  }
  if (doc.isPending) {
    return (
      <div className={page}>
        <SkeletonRows rows={10} />
      </div>
    );
  }
  if (doc.error) {
    return (
      <div className={page}>
        <ErrorState error={doc.error} onRetry={() => void doc.refetch()} />
      </div>
    );
  }

  const data = doc.data;
  const viewed =
    viewedRevision != null
      ? sortedRevisions.find((revision) => revision.revisionNo === viewedRevision)
      : undefined;
  // diff 基准 = 紧邻上一版（不假设编号连续）：查看历史版取排序前一项；
  // 当前版按 revisionNo 找最大较小修订，兼容两条独立查询先后刷新。
  const targetRevisionNo = viewed?.revisionNo ?? data.revisionNo;
  const beforeSnapshot = findPreviousRevision(sortedRevisions, targetRevisionNo);
  const bodyMd = viewed ? viewed.snapshot.bodyMd : data.bodyMd;

  return (
    <article className={page}>
      {/* 修订历史浮动胶囊（2026-09-02 用户指令；2026-09-03 壳层上收共享
          CapsulePanel，概览为单分区面板）：sticky 右上、不占文档流
          （BR-004 不可变追加；patterns.md「浮动胶囊面板」） */}
      <CapsulePanel
        label={t("common.revisionHistory")}
        icon={<History16Regular />}
        expandIcon={<ArrowExpand16Regular />}
        badge={viewedRevision != null ? `v${viewedRevision}` : (revisions.data?.length ?? 0)}
        active={viewedRevision != null}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      >
        {/* 单分区（2026-09-03 用户指令：统一条目详情面板样式——首分区
            小节标题行 + 行内收起按钮；separated=false，上方即面板顶缘）；
            标题行右缘 = 对比开关（收起按钮左侧，patterns.md「修订对比」）
            + 收起按钮 */}
        <CapsulePanelSection
          title={t("common.revisionHistory")}
          separated={false}
          action={
            <>
              <RevisionDiffToggle checked={diffOn} disabled={beforeSnapshot === undefined} onChange={setDiffOn} />
              <CapsulePanelCollapseButton onCollapse={() => setPanelOpen(false)} />
            </>
          }
        >
          {revisions.error ? (
            <ErrorState error={revisions.error} onRetry={() => void revisions.refetch()} />
          ) : (
            <RevisionTimeline
              entries={revisions.data ?? []}
              currentRevisionNo={data.revisionNo}
              viewedRevisionNo={viewedRevision}
              onSelect={setViewedRevision}
            />
          )}
        </CapsulePanelSection>
      </CapsulePanel>

      {/* 内容层分块错落渐入（patterns.md「页面内容渐入」三改）：
          头部层 0ms 先入、正文层 +80ms 随后；胶囊在外不入动画 */}
      <PageFadeIn>
        {/* 头部：文档标题（数据字段，各 key 文档自带）+ 修订元信息双 chip
            （形态对齐条目详情 UI-016；actor 元信息 2026-09-03 用户指令随
            修订模型移除） */}
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <Title2>{data.title}</Title2>
          </div>
          <div className={styles.metaRow}>
            {/* 修订元信息两枚 chip（patterns.md「头部元信息 chip」2026-09-04
                二改，与条目详情统一）：版本身份随查看态切换；时间随查看版
                （历史版显该版修订时间） */}
            <MetaChip>
              {viewed
                ? t("common.oldRevisionChip", { rev: viewed.revisionNo })
                : t("common.currentRevisionChip", { rev: data.revisionNo })}
            </MetaChip>
            <MetaChip>
              <RelativeTime timestamp={viewed ? viewed.changedAt : data.changedAt} />
            </MetaChip>
          </div>
        </header>
      </PageFadeIn>
      <PageFadeIn delay={140}>
        {/* 正文：开关关/无上一版 → Markdown 只读渲染（CON-009）；开关开且有
            上一版 → 与其单栏 diff（patterns.md「修订对比」；当前版开着 =
            最新修订与上一版对比）。版本提示条 MessageBar 已随手动开关口径
            废除（2026-09-03），回到当前 = 点时间线当前版 */}
        {diffOn && beforeSnapshot ? (
          <MarkdownDiffBody before={beforeSnapshot.snapshot.bodyMd} after={bodyMd} />
        ) : (
          <MarkdownBody>{bodyMd}</MarkdownBody>
        )}
      </PageFadeIn>
    </article>
  );
}
