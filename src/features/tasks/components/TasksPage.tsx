// 任务看板页（UI-019/020/021，FR-011/UC-013）：五列横排横向滚动、基础卡片 + 阻塞标记可跳源、
// 看板级全局单过滤框（FR-011「列内过滤」实用化解读，UI-021）；只读无拖拽（ADR-007）。
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Card,
  Input,
  Text,
  Title2,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { Search24Regular } from "@fluentui/react-icons";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { PageTitle } from "../../../components/PageTitle";
import { SkeletonBoard } from "../../../components/Skeletons";
import { RelativeTime } from "../../../components/RelativeTime";
import { StatusBadge } from "../../../components/StatusBadge";
import { useCardLiftStyles } from "../../../components/useCardLiftStyles";
import type { TaskCard } from "../../../api/types";
import { useTaskBoardQuery } from "../queries";

const useStyles = makeStyles({
  // 左 200 与各页统一（patterns.md「页面容器与标题对齐」，2026-09-02）
  page: {
    padding: `${tokens.spacingVerticalXL} 64px ${tokens.spacingVerticalXL} 200px`,
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  toolbar: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, marginBottom: tokens.spacingVerticalL },
  toolbarSpacer: { flex: 1 },
  // 见 patterns.md「工具条」：标题不收缩、过滤控件 120px 下限
  toolbarTitle: { flexShrink: 0 },
  toolbarControl: { minWidth: "120px" },
  board: { display: "flex", gap: tokens.spacingHorizontalM, overflowX: "auto", paddingBottom: tokens.spacingVerticalL, alignItems: "flex-start" },
  column: { flex: "1 0 224px", display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  columnHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  card: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, cursor: "pointer" },
  cardTitle: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  code: { fontFamily: tokens.fontFamilyMonospace },
  blocked: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorStatusDangerForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  blockedLink: { color: tokens.colorStatusDangerForeground1, fontFamily: tokens.fontFamilyMonospace },
  meta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

function BoardCard({ task, projectId }: { task: TaskCard; projectId: string }) {
  const styles = useStyles();
  const lift = useCardLiftStyles();
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Card
      className={mergeClasses(styles.card, lift.root)}
      onClick={() => navigate(`/projects/${projectId}/items/${task.code}`)}
      focusMode="no-tab"
      size="small"
    >
      <span className={styles.cardTitle}>
        <span className={styles.code}>{task.code}</span>
        <StatusBadge status={task.status} />
      </span>
      <Text size={300}>{task.title}</Text>
      {task.blockedBy.map((blocker) => (
        <span key={blocker.code} className={styles.blocked}>
          ⛔{" "}
          <Link to={`/projects/${projectId}/items/${blocker.code}`} className={styles.blockedLink}>
            {t("tasks.blockedBy", { code: blocker.code })}
          </Link>
        </span>
      ))}
      <span className={styles.meta}>
        <RelativeTime timestamp={task.updatedAt} />
      </span>
    </Card>
  );
}

export function TasksPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const { data, isPending, error, refetch } = useTaskBoardQuery(projectId);
  const [keyword, setKeyword] = useState("");

  if (isPending) {
    return (
      <div className={styles.page}>
        <PageTitle>{t("tasks.title")}</PageTitle>
        <SkeletonBoard />
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.page}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const board = data;
  const total = board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
  const needle = keyword.trim().toLowerCase();
  const match = (task: TaskCard) =>
    !needle || task.code.toLowerCase().includes(needle) || task.title.toLowerCase().includes(needle);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Title2 className={styles.toolbarTitle}>{t("tasks.title")}</Title2>
        <div className={styles.toolbarSpacer} />
        <Input
          className={styles.toolbarControl}
          contentBefore={<Search24Regular />}
          placeholder={t("tasks.filterPlaceholder")}
          value={keyword}
          onChange={(_, e) => setKeyword(e.value)}
        />
      </div>

      {total === 0 ? (
        <EmptyState icon={<Search24Regular />} title={t("tasks.emptyTitle")} hint={t("tasks.emptyHint")} />
      ) : (
        <div className={styles.board}>
          {board.columns.map((col) => {
            const visible = col.tasks.filter(match);
            return (
              <section key={col.status} className={styles.column} aria-label={t(`status.${col.status}`)}>
                <div className={styles.columnHeader}>
                  <Text weight="semibold" size={300}>
                    {t(`status.${col.status}`)}
                  </Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {visible.length}
                  </Text>
                </div>
                {visible.map((task) => (
                  <BoardCard key={task.code} task={task} projectId={projectId} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
