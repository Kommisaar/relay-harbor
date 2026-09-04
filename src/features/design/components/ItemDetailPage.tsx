// 条目详情页（UI-015～018，FR-009/010/013，UC-011/012/015）：独立全宽、单栏滚动。
// 详情面板浮动胶囊（sticky 右上，单胶囊三分区：修订历史/关联/影响定位——
// 2026-09-03 用户指令将关联、影响自正文迁入，正文收窄为 头部 + 正文）。
// 与上一版的单栏 diff 由修订历史分区标题行的「与上一版对比」手动开关控制
// （2026-09-03 同日第八次设计修订：废止自动 diff 与版本提示条 MessageBar；
// 默认关显快照、开显 diff，当前版同样适用；回到当前 = 点时间线当前版）。
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Link as FluentLink, Title2, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowExpand16Regular, ArrowLeft24Regular, List16Regular } from "@fluentui/react-icons";
import { StatusBadge } from "../../../components/StatusBadge";
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
import { RelationsPanelSection } from "./RelationsPanelSection";
import { ImpactPanelSection } from "./ImpactPanelSection";
import { useImpactQuery, useItemDetailQuery, useItemRevisionsQuery, useRelationsQuery } from "../queries";

const useStyles = makeStyles({
  back: { marginBottom: tokens.spacingVerticalS, display: "inline-flex", alignItems: "center", gap: "6px" },
  header: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, marginBottom: tokens.spacingVerticalL },
  titleRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap" },
  code: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground2 },
  metaRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap", color: tokens.colorNeutralForeground3 },
  link: { color: tokens.colorBrandForeground1 },
});

export function ItemDetailPage() {
  const styles = useStyles();
  // 页面容器：workbench 族，内容宽上限 1080（patterns.md「页面容器与标题对齐」）。
  // 承载 fixed 详情面板胶囊 → 容器不参与渐入动画（enter=false），内容层
  // PageFadeIn 包裹（patterns.md「页面内容渐入」）
  const page = usePageContainerStyles("workbench", false);
  const { t } = useTranslation();
  const { projectId = "", code = "" } = useParams();
  const navigate = useNavigate();
  const detail = useItemDetailQuery(projectId, code);
  const revisions = useItemRevisionsQuery(projectId, code);
  const relations = useRelationsQuery(projectId, code);
  const impact = useImpactQuery(projectId, code);
  /** null = 当前版本；数字 = 查看该历史版本快照（UI-017） */
  const [viewedRevision, setViewedRevision] = useState<number | null>(null);
  // 修订对比开关（patterns.md「修订对比」，2026-09-03 手动开关口径）：
  // 页面本地 state——默认关（快照）、跨修订切换保持、离开页面即重置
  const [diffOn, setDiffOn] = useState(false);
  // 详情面板开合（壳层 CapsulePanel 受控；点外/Esc/收起按钮均回 false）
  const [panelOpen, setPanelOpen] = useState(false);
  // React Router 在仅 :projectId/:code 改变时会复用同一页面实例；显式
  // 清理实体级查看态，避免把 A 条目的历史版本/diff 带到 B 条目。
  useEffect(() => {
    setViewedRevision(null);
    setDiffOn(false);
    setPanelOpen(false);
  }, [projectId, code]);
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

  if (detail.isPending) {
    return (
      <div className={page}>
        <SkeletonRows rows={10} />
      </div>
    );
  }
  if (detail.error) {
    return (
      <div className={page}>
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      </div>
    );
  }

  const item = detail.data;
  const viewed =
    viewedRevision != null
      ? sortedRevisions.find((revision) => revision.revisionNo === viewedRevision)
      : undefined;
  // diff 基准 = 紧邻上一版（不假设编号连续）：查看历史版取排序前一项；
  // 查看当前版按 currentRevision 找最大较小修订，不能假定修订列表最后
  // 一项已与详情查询同步（否则正文先到 r4、列表仍 r1~r3 时会误取 r2）。
  const targetRevisionNo = viewed?.revisionNo ?? item.currentRevision;
  const beforeSnapshot = findPreviousRevision(sortedRevisions, targetRevisionNo);
  const bodyMd = viewed ? viewed.snapshot.bodyMd : item.bodyMd;

  return (
    <article className={page}>
      {/* 详情面板浮动胶囊（2026-09-03 用户指令由「修订历史」胶囊扩为三分区，
          patterns.md「浮动胶囊面板」）：sticky 右上、不占文档流；徽标查看
          历史版时显 vN、否则修订数；查看历史版时选中底色 */}
      <CapsulePanel
        label={t("common.detailPanel")}
        icon={<List16Regular />}
        expandIcon={<ArrowExpand16Regular />}
        badge={viewedRevision != null ? `v${viewedRevision}` : (revisions.data?.length ?? 0)}
        active={viewedRevision != null}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      >
        {/* 首分区 separated=false：上方即面板顶缘，不另画分隔线；
            标题行右缘 = 对比开关（收起按钮左侧，patterns.md「修订对比」）
            + 收起按钮（2026-09-03 用户指令：面板无名称标题行） */}
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
              currentRevisionNo={item.currentRevision}
              viewedRevisionNo={viewedRevision}
              onSelect={setViewedRevision}
            />
          )}
        </CapsulePanelSection>
        <CapsulePanelSection title={t("itemDetail.relations")}>
          <RelationsPanelSection projectId={projectId} relations={relations.data} />
        </CapsulePanelSection>
        <CapsulePanelSection title={t("itemDetail.impact")}>
          <ImpactPanelSection projectId={projectId} impact={impact.data} />
        </CapsulePanelSection>
      </CapsulePanel>

      {/* 内容层分块错落渐入（patterns.md「页面内容渐入」三改）：
          返回链接+头部层 0ms 先入、正文层 +80ms 随后；胶囊在外不入动画 */}
      <PageFadeIn>
        {/* 面包屑返回（UI-015）→ 所属类型页（2026-09-01 类型页拆分） */}
        <FluentLink
          as="a"
          onClick={() => navigate(`/projects/${projectId}/items/type/${item.itemType}`)}
          className={styles.back}
        >
          <ArrowLeft24Regular /> {t("common.backToList")}
        </FluentLink>

        {/* 头部：编号/标题/状态/元数据（UI-016）；元数据与修订元信息统一
            chip 形态（patterns.md「头部元信息 chip」，2026-09-04 二改） */}
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <Title2 className={styles.code}>{item.code}</Title2>
            <Title2>{item.title}</Title2>
            <StatusBadge status={item.status} size="large" />
          </div>
          <div className={styles.metaRow}>
            {Object.entries(item.metadata).map(([key, value]) => (
              <MetaChip key={key}>
                {key}: {value}
              </MetaChip>
            ))}
            {/* 修订元信息两枚 chip（patterns.md「头部元信息 chip」2026-09-04
                二改）：版本身份随查看态切换；时间随查看版（历史版显该版
                修订时间） */}
            <MetaChip>
              {viewed
                ? t("common.oldRevisionChip", { rev: viewed.revisionNo })
                : t("common.currentRevisionChip", { rev: item.currentRevision })}
            </MetaChip>
            <MetaChip>
              <RelativeTime timestamp={viewed ? viewed.changedAt : item.updatedAt} />
            </MetaChip>
            {item.supersededBy ? (
              <Link to={`/projects/${projectId}/items/${item.supersededBy}`} className={styles.link}>
                {t("itemDetail.supersededBy", { code: item.supersededBy })}
              </Link>
            ) : null}
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
