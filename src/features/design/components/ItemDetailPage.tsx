// 条目详情页（UI-015～018，FR-009/010/013，UC-011/012/015）：独立全宽、单栏滚动。
// 详情面板浮动胶囊（sticky 右上，单胶囊三分区：修订历史/关联/影响定位——
// 2026-09-03 用户指令将关联、影响自正文迁入，正文收窄为 头部 + 正文）。
// 历史版正文自动显示与紧邻上一版的单栏 diff（同日用户指令，patterns.md
// 「修订对比」；最旧版无上一版显示纯快照）。
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Link as FluentLink,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowExpand16Regular, ArrowLeft24Regular, List16Regular } from "@fluentui/react-icons";
import { StatusBadge } from "../../../components/StatusBadge";
import { ErrorState } from "../../../components/ErrorState";
import { SkeletonRows } from "../../../components/Skeletons";
import { RelativeTime } from "../../../components/RelativeTime";
import { MarkdownBody } from "../../../components/MarkdownBody";
import { MarkdownDiffBody } from "../../../components/markdown-diff/MarkdownDiffBody";
import { CapsulePanel, CapsulePanelCollapseButton, CapsulePanelSection } from "../../../components/CapsulePanel";
import { RevisionTimeline } from "../../../components/RevisionTimeline";
import { usePageContainerStyles } from "../../../components/usePageContainerStyles";
import { RelationsPanelSection } from "./RelationsPanelSection";
import { ImpactPanelSection } from "./ImpactPanelSection";
import { useImpactQuery, useItemDetailQuery, useItemRevisionsQuery, useRelationsQuery } from "../queries";

const useStyles = makeStyles({
  back: { marginBottom: tokens.spacingVerticalS, display: "inline-flex", alignItems: "center", gap: "6px" },
  header: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, marginBottom: tokens.spacingVerticalL },
  titleRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap" },
  code: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground2 },
  metaRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap", color: tokens.colorNeutralForeground3 },
  metaChip: {
    padding: `2px ${tokens.spacingHorizontalS}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusSmall,
    fontSize: tokens.fontSizeBase200,
  },
  link: { color: tokens.colorBrandForeground1 },
});

export function ItemDetailPage() {
  const styles = useStyles();
  // 页面容器：workbench 族，内容宽上限 1080（patterns.md「页面容器与标题对齐」）
  const page = usePageContainerStyles("workbench");
  const { t } = useTranslation();
  const { projectId = "", code = "" } = useParams();
  const navigate = useNavigate();
  const detail = useItemDetailQuery(projectId, code);
  const revisions = useItemRevisionsQuery(projectId, code);
  const relations = useRelationsQuery(projectId, code);
  const impact = useImpactQuery(projectId, code);
  /** null = 当前版本；数字 = 查看该历史版本快照（UI-017） */
  const [viewedRevision, setViewedRevision] = useState<number | null>(null);
  // 详情面板开合（壳层 CapsulePanel 受控；点外/Esc/收起按钮均回 false）
  const [panelOpen, setPanelOpen] = useState(false);
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
  const viewedIndex =
    viewedRevision != null ? sortedRevisions.findIndex((r) => r.revisionNo === viewedRevision) : -1;
  const viewed = viewedIndex >= 0 ? sortedRevisions[viewedIndex] : undefined;
  const previousRevision = viewedIndex > 0 ? sortedRevisions[viewedIndex - 1] : undefined;
  const bodyMd = viewed ? viewed.snapshot.bodyMd : item.bodyMd;

  return (
    <article className={page}>
      {/* 详情面板浮动胶囊（2026-09-03 用户指令由「修订历史」胶囊扩为三分区，
          patterns.md「浮动胶囊面板」）：sticky 右上、不占文档流；徽标查看
          历史版时显 rN、否则修订数；查看历史版时选中底色 */}
      <CapsulePanel
        label={t("common.detailPanel")}
        icon={<List16Regular />}
        expandIcon={<ArrowExpand16Regular />}
        badge={viewedRevision != null ? `r${viewedRevision}` : (revisions.data?.length ?? 0)}
        active={viewedRevision != null}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      >
        {/* 首分区 separated=false：上方即面板顶缘，不另画分隔线；
            收起按钮居标题行右缘（2026-09-03 用户指令：面板无名称标题行） */}
        <CapsulePanelSection
          title={t("common.revisionHistory")}
          separated={false}
          action={<CapsulePanelCollapseButton onCollapse={() => setPanelOpen(false)} />}
        >
          <RevisionTimeline
            entries={revisions.data ?? []}
            currentRevisionNo={item.currentRevision}
            viewedRevisionNo={viewedRevision}
            onSelect={setViewedRevision}
          />
        </CapsulePanelSection>
        <CapsulePanelSection title={t("itemDetail.relations")}>
          <RelationsPanelSection projectId={projectId} relations={relations.data} />
        </CapsulePanelSection>
        <CapsulePanelSection title={t("itemDetail.impact")}>
          <ImpactPanelSection projectId={projectId} impact={impact.data} />
        </CapsulePanelSection>
      </CapsulePanel>

      {/* 面包屑返回（UI-015）→ 所属类型页（2026-09-01 类型页拆分） */}
      <FluentLink
        as="a"
        onClick={() => navigate(`/projects/${projectId}/items/type/${item.itemType}`)}
        className={styles.back}
      >
        <ArrowLeft24Regular /> {t("common.backToList")}
      </FluentLink>

      {/* 头部：编号/标题/状态/元数据（UI-016） */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Title2 className={styles.code}>{item.code}</Title2>
          <Title2>{item.title}</Title2>
          <StatusBadge status={item.status} size="large" />
        </div>
        <div className={styles.metaRow}>
          {Object.entries(item.metadata).map(([key, value]) => (
            <span key={key} className={styles.metaChip}>
              {key}: {value}
            </span>
          ))}
          <span>
            r{item.currentRevision} · <RelativeTime timestamp={item.updatedAt} />
          </span>
          {item.supersededBy ? (
            <Link to={`/projects/${projectId}/items/${item.supersededBy}`} className={styles.link}>
              {t("itemDetail.supersededBy", { code: item.supersededBy })}
            </Link>
          ) : null}
        </div>
      </header>

      {/* 历史版本查看提示条（UI-017；有上一版时注明对比对象） */}
      {viewed ? (
        <MessageBar intent="info" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>
            {previousRevision
              ? t("common.viewingHistoryDiff", { rev: viewed.revisionNo, prev: previousRevision.revisionNo })
              : t("common.viewingHistory", { rev: viewed.revisionNo })}
          </MessageBarBody>
          <MessageBarActions>
            <Button appearance="primary" size="small" onClick={() => setViewedRevision(null)}>
              {t("common.backToCurrent")}
            </Button>
          </MessageBarActions>
        </MessageBar>
      ) : null}

      {/* 正文：当前版/最旧历史版 Markdown 只读渲染（CON-009）；其余历史版
          自动显示与紧邻上一版的单栏 diff（patterns.md「修订对比」） */}
      {viewed && previousRevision ? (
        <MarkdownDiffBody before={previousRevision.snapshot.bodyMd} after={viewed.snapshot.bodyMd} />
      ) : (
        <MarkdownBody>{bodyMd}</MarkdownBody>
      )}
    </article>
  );
}
