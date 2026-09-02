// 条目详情页（UI-015～018，FR-009/010/013，UC-011/012/015）：独立全宽、单栏滚动
// 修订历史浮动胶囊（sticky 右上）→ 头部 → 正文（Markdown 只读渲染）→ 关联 → 影响定位内嵌清单。
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Divider,
  Link as FluentLink,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  Button,
  Text,
  Title2,
  Title3,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { ArrowLeft24Regular } from "@fluentui/react-icons";
import { StatusBadge } from "../../../components/StatusBadge";
import { ErrorState } from "../../../components/ErrorState";
import { SkeletonRows } from "../../../components/Skeletons";
import { RelativeTime } from "../../../components/RelativeTime";
import { MarkdownBody } from "../../../components/MarkdownBody";
import { RevisionTimeline } from "../../../components/RevisionTimeline";
import { usePageContainerStyles } from "../../../components/usePageContainerStyles";
import type { ImpactEntry, ItemType, RelationEntry, RelationType } from "../../../api/types";
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
  section: { marginTop: tokens.spacingVerticalXXL },
  sectionTitle: { marginBottom: tokens.spacingVerticalS },
  entryRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    columnGap: tokens.spacingHorizontalM,
    alignItems: "baseline",
    paddingBlock: tokens.spacingVerticalXXS,
  },
  mono: { fontFamily: tokens.fontFamilyMonospace },
  link: { color: tokens.colorBrandForeground1 },
  empty: { color: tokens.colorNeutralForeground3 },
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

  const relationsByType = useMemo(() => {
    const map = new Map<RelationType, RelationEntry[]>();
    for (const entry of relations.data ?? []) {
      const list = map.get(entry.relationType) ?? [];
      list.push(entry);
      map.set(entry.relationType, list);
    }
    return [...map.entries()];
  }, [relations.data]);

  const impactByType = useMemo(() => {
    const map = new Map<ItemType, ImpactEntry[]>();
    for (const entry of impact.data?.entries ?? []) {
      const list = map.get(entry.item.itemType) ?? [];
      list.push(entry);
      map.set(entry.item.itemType, list);
    }
    return [...map.entries()];
  }, [impact.data]);

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
  const viewed = viewedRevision != null ? revisions.data?.find((r) => r.revisionNo === viewedRevision) : undefined;
  const bodyMd = viewed ? viewed.snapshot.bodyMd : item.bodyMd;

  return (
    <article className={page}>
      {/* 修订历史浮动胶囊（2026-09-02 用户指令改浮动胶囊）：sticky 右上、
          不占文档流（FR-009/UI-017，无 diff；patterns.md「修订时间线」） */}
      <RevisionTimeline
        entries={revisions.data ?? []}
        currentRevisionNo={item.currentRevision}
        viewedRevisionNo={viewedRevision}
        onSelect={setViewedRevision}
      />

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

      {/* 历史版本查看提示条（UI-017） */}
      {viewed ? (
        <MessageBar intent="info" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>{t("common.viewingHistory", { rev: viewed.revisionNo })}</MessageBarBody>
          <MessageBarActions>
            <Button appearance="primary" size="small" onClick={() => setViewedRevision(null)}>
              {t("common.backToCurrent")}
            </Button>
          </MessageBarActions>
        </MessageBar>
      ) : null}

      {/* 正文：Markdown 只读渲染（CON-009，无编辑形态；共享件 patterns.md） */}
      <MarkdownBody>{bodyMd}</MarkdownBody>

      {/* 关联区：按关系类型分组、上下游、可跳转（FR-010/UI-016） */}
      <section className={styles.section}>
        <Divider>
          <Title3>{t("itemDetail.relations")}</Title3>
        </Divider>
        {relationsByType.length === 0 ? (
          <Text className={styles.empty}>{t("common.noRelations")}</Text>
        ) : (
          relationsByType.map(([relationType, entries]) => (
            <div key={relationType}>
              <Text weight="semibold" size={300}>
                {t(`relation.${relationType}`)}
              </Text>
              {entries.map((entry) => (
                <div key={`${entry.relationType}-${entry.direction}-${entry.peer.code}`} className={styles.entryRow}>
                  <Badge appearance="ghost" size="small">
                    {t(`itemDetail.direction${entry.direction === "out" ? "Out" : "In"}`)}
                  </Badge>
                  <span>
                    <Link to={`/projects/${projectId}/items/${entry.peer.code}`} className={mergeClasses(styles.mono, styles.link)}>
                      {entry.peer.code}
                    </Link>{" "}
                    <Text size={300}>{entry.peer.title}</Text>
                  </span>
                  <StatusBadge status={entry.peer.status} />
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      {/* 影响定位：内嵌清单，按类型分组、逐项可跳转（FR-013/UI-018） */}
      <section className={styles.section}>
        <Divider>
          <Title3>{t("itemDetail.impact")}</Title3>
        </Divider>
        {impactByType.length === 0 ? (
          <Text className={styles.empty}>{t("common.noImpact")}</Text>
        ) : (
          impactByType.map(([type, entries]) => (
            <div key={type}>
              <Text weight="semibold" size={300}>
                {type} · {t(`type.${type}`)}
              </Text>
              {entries.map((entry) => (
                <div key={entry.item.code} className={styles.entryRow}>
                  <Badge appearance="ghost" size="small">
                    {t("itemDetail.affectedDepth", { depth: entry.depth })}
                  </Badge>
                  <span>
                    <Link to={`/projects/${projectId}/items/${entry.item.code}`} className={mergeClasses(styles.mono, styles.link)}>
                      {entry.item.code}
                    </Link>{" "}
                    <Text size={300}>{entry.item.title}</Text>
                  </span>
                  <StatusBadge status={entry.item.status} />
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </article>
  );
}
