// 项目概览页（UI-035，2026-09-02 用户指令新增，同日改版 article 文档形态）：
// 每项目一篇可维护文档——头部（标题 + rN·操作者·相对时间）+ Markdown 正文
// + 修订时间线版本切换（UI-017 同款共享件）；进入项目默认落地页。
// 数据 get_project_overview / list_project_overview_revisions（INT-001
// 白名单 15→16），Agent 经 MCP 维护，UI 只读渲染；文档内容不参与 i18n
// （与条目正文同策略）。
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Divider,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Title2,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ErrorState } from "../../../components/ErrorState";
import { SkeletonRows } from "../../../components/Skeletons";
import { RelativeTime } from "../../../components/RelativeTime";
import { MarkdownBody } from "../../../components/MarkdownBody";
import { RevisionTimeline } from "../../../components/RevisionTimeline";
import { usePageContainerStyles } from "../../../components/usePageContainerStyles";
import { useProjectOverviewQuery, useProjectOverviewRevisionsQuery } from "../queries";

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
  section: { marginTop: tokens.spacingVerticalXXL },
});

export function OverviewPage() {
  const styles = useStyles();
  // 页面容器：workbench 族，内容宽上限 1080（patterns.md「页面容器与标题对齐」；
  // article 形态与条目详情页同口径）
  const page = usePageContainerStyles("workbench");
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const doc = useProjectOverviewQuery(projectId);
  const revisions = useProjectOverviewRevisionsQuery(projectId);
  /** null = 当前版本；数字 = 查看该历史版本快照（UI-017 同款，本地 state 不入 URL） */
  const [viewedRevision, setViewedRevision] = useState<number | null>(null);

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
  const viewed = viewedRevision != null ? revisions.data?.find((r) => r.revisionNo === viewedRevision) : undefined;
  const bodyMd = viewed ? viewed.snapshot.bodyMd : data.bodyMd;

  return (
    <article className={page}>
      {/* 头部：文档标题 + rN·操作者·相对时间（形态对齐条目详情 UI-016） */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Title2>{data.title}</Title2>
        </div>
        <div className={styles.metaRow}>
          <span>
            r{data.revisionNo} · {data.actor} · <RelativeTime timestamp={data.changedAt} />
          </span>
        </div>
      </header>

      {/* 历史版本查看提示条（UI-017 同款） */}
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

      {/* 正文：查看历史版时换装快照正文，其余只读渲染（CON-009） */}
      <MarkdownBody>{bodyMd}</MarkdownBody>

      {/* 修订历史：时间线 + 版本切换（BR-004 不可变追加，无 diff） */}
      <section className={styles.section}>
        <Divider>
          <Title3>{t("overview.revisions")}</Title3>
        </Divider>
        <RevisionTimeline
          entries={revisions.data ?? []}
          currentRevisionNo={data.revisionNo}
          viewedRevisionNo={viewedRevision}
          onSelect={setViewedRevision}
        />
      </section>
    </article>
  );
}
