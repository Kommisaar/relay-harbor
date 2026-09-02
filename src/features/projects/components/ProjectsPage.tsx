// 项目列表页（UI-010/FR-008/UC-010）：列表行/卡片双形态可切换 + 本地关键词过滤；
// 卡片/行内嵌统计区块（get_project_state，见 project-list.md「项目卡片统计」）；
// 无创建/删除入口（CON-009），空态引导"项目由 Agent 经 MCP 创建"（UI-031）。
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Card,
  Input,
  Text,
  Title2,
  ToggleButton,
  makeStyles,
  mergeClasses,
  tokens,
  Button,
} from "@fluentui/react-components";
import { Grid24Regular, List24Regular, Search24Regular } from "@fluentui/react-icons";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { ExportPopover } from "../../../components/ExportPopover";
import { PageTitle } from "../../../components/PageTitle";
import { SkeletonRows } from "../../../components/Skeletons";
import { RelativeTime } from "../../../components/RelativeTime";
import { useCardLiftStyles } from "../../../components/useCardLiftStyles";
import { usePageContainerStyles } from "../../../components/usePageContainerStyles";
import { useUiStore } from "../../../stores/ui";
import { useProjectsQuery } from "../queries";
import { ProjectStats } from "./ProjectStats";

const useStyles = makeStyles({
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  toolbarSpacer: { flex: 1 },
  // 见 patterns.md「工具条」：标题不收缩、过滤控件 120px 下限
  toolbarTitle: { flexShrink: 0 },
  toolbarControl: { minWidth: "120px" },
  rows: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  row: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    textAlign: "left",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
  },
  rowMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  repoPath: {
    color: tokens.colorNeutralForeground3,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    wordBreak: "break-all",
  },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: tokens.spacingHorizontalM },
  card: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, cursor: "pointer" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: tokens.spacingHorizontalS },
  cardActions: { display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalS },
});

export function ProjectsPage() {
  const styles = useStyles();
  // 页面容器：list 族，内容宽上限 960（patterns.md「页面容器与标题对齐」）
  const page = usePageContainerStyles("list");
  const lift = useCardLiftStyles();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useProjectsQuery();
  const viewMode = useUiStore((s) => s.projectViewMode);
  const setViewMode = useUiStore((s) => s.setProjectViewMode);
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = keyword.trim().toLowerCase();
    if (!needle) return data;
    return data.filter(
      (p) => p.name.toLowerCase().includes(needle) || (p.repoPath ?? "").toLowerCase().includes(needle),
    );
  }, [data, keyword]);

  if (isPending) {
    return (
      <div className={page}>
        <PageTitle>{t("projects.title")}</PageTitle>
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div className={page}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const empty = data.length === 0;

  return (
    <div className={page}>
      <div className={styles.toolbar}>
        <Title2 className={styles.toolbarTitle}>{t("projects.title")}</Title2>
        <div className={styles.toolbarSpacer} />
        {!empty ? (
          <>
            <Input
              className={styles.toolbarControl}
              contentBefore={<Search24Regular />}
              placeholder={t("common.keyword")}
              value={keyword}
              onChange={(_, e) => setKeyword(e.value)}
            />
            <ToggleButton
              icon={<List24Regular />}
              checked={viewMode === "rows"}
              onClick={() => setViewMode("rows")}
              title={t("common.viewRows")}
            />
            <ToggleButton
              icon={<Grid24Regular />}
              checked={viewMode === "cards"}
              onClick={() => setViewMode("cards")}
              title={t("common.viewCards")}
            />
          </>
        ) : null}
      </div>

      {empty ? (
        <EmptyState icon={<Search24Regular />} title={t("projects.emptyTitle")} hint={t("projects.emptyHint")} />
      ) : viewMode === "rows" ? (
        <div className={styles.rows}>
          {filtered.map((p) => (
            <Button key={p.id} appearance="subtle" className={styles.row} onClick={() => navigate(`/projects/${p.id}`)}>
              <Text size={400} weight="semibold">
                {p.name}
              </Text>
              {p.repoPath ? (
                <span className={styles.repoPath}>{p.repoPath}</span>
              ) : (
                <span className={styles.rowMeta}>{t("common.noRepoPath")}</span>
              )}
              <span className={styles.rowMeta}>
                {t("common.itemsCount", { count: p.itemCount })} · {t("common.tasksCount", { count: p.taskCount })} ·{" "}
                <RelativeTime timestamp={p.updatedAt} />
              </span>
              <ProjectStats projectId={p.id} compact />
            </Button>
          ))}
        </div>
      ) : (
        <div className={styles.cards}>
          {filtered.map((p) => (
            <Card key={p.id} className={mergeClasses(styles.card, lift.root)} onClick={() => navigate(`/projects/${p.id}`)} focusMode="no-tab">
              <div className={styles.cardHead}>
                <Text weight="semibold" size={400}>
                  {p.name}
                </Text>
                <span className={styles.cardActions}>
                  {/* 导出弹出框（UI-023 修订）：内部已 stopPropagation，不会触发卡片跳转 */}
                  <ExportPopover projectId={p.id} projectName={p.name} />
                  <span className={styles.rowMeta}>
                    <RelativeTime timestamp={p.updatedAt} />
                  </span>
                </span>
              </div>
              <span className={styles.repoPath}>{p.repoPath ?? t("common.noRepoPath")}</span>
              <span className={styles.rowMeta}>
                {t("common.itemsCount", { count: p.itemCount })} · {t("common.tasksCount", { count: p.taskCount })}
              </span>
              <ProjectStats projectId={p.id} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
