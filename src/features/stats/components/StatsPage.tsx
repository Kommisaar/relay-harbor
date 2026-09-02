// 项目统计页（UI-011/FR-018/UC-010；2026-09-02 用户指令自「项目概览页」
// 更名，index 落地页让位新增的项目概览页）：状态统计卡片 + 类型分布 +
// 活动图 + 最近修订时间线；全部只读，各模块可跳转。
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Card,
  Text,
  Title3,
  makeStyles,
  mergeClasses,
  tokens,
  Badge,
} from "@fluentui/react-components";
// 概览图表（2026-08-28 用户选型 @ant-design/charts，替代 Fluent charts；白名单已准入）
import { Column, Pie } from "@ant-design/charts";
import { useResolvedTheme } from "../../../components/useResolvedTheme";
import { useCardLiftStyles } from "../../../components/useCardLiftStyles";
import { History24Regular } from "@fluentui/react-icons";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { PageTitle } from "../../../components/PageTitle";
import { SkeletonRows } from "../../../components/Skeletons";
import { RelativeTime } from "../../../components/RelativeTime";
import { usePageContainerStyles } from "../../../components/usePageContainerStyles";
import { ITEM_STATUSES, TASK_STATUSES } from "../../../api/types";
import { useProjectStateQuery, useRecentRevisionsQuery } from "../queries";
import { ActivityChart } from "./ActivityChart";
import { tooltipRender } from "./ChartTooltip";

// AntV 默认色组（@antv/g2 classic / classicDark 主题的 category10）：图表默认取色即此，
// 下方图例徽章按同一顺序取色保持一致；明暗主题切换时整组自动更换（2026-08-28 用户选型）
const ANT_PALETTE: Record<"light" | "dark", string[]> = {
  light: ["#5B8FF9", "#5AD8A6", "#5D7092", "#F6BD16", "#6F5EF9", "#6DC8EC", "#945FB9", "#FF9845", "#1E9493", "#FF99C3"],
  dark: ["#1783FF", "#00C9C9", "#F0884D", "#D580FF", "#7863FF", "#60C42D", "#BD8F24", "#FF80CA", "#2491B3", "#17C76F"],
};

// 返回"切换 key 可见性"后的新集合（图例点击隐藏/显示用）
const toggled = (key: string, hidden: ReadonlySet<string>): ReadonlySet<string> => {
  const next = new Set(hidden);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
};

const useStyles = makeStyles({
  // 独占一栏的内容卡（最近修订时间线）
  sectionCard: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalL,
  },
  statRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  // 双卡行：两卡各占半栏（2026-09-02 用户指令：类型分布+活动图）
  chartRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  statCard: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  chartCard: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  statBody: { display: "flex", flexDirection: "column", alignItems: "center", gap: tokens.spacingVerticalS },
  chips: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: tokens.spacingHorizontalS, width: "100%" },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    background: "transparent",
    border: "none",
    padding: "0",
    cursor: "pointer",
    font: "inherit",
    color: "inherit",
  },
  chipHidden: { opacity: "0.38" },
  revision: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    columnGap: tokens.spacingHorizontalM,
    alignItems: "baseline",
    paddingBlock: tokens.spacingVerticalXS,
  },
  codeLink: { fontFamily: tokens.fontFamilyMonospace },
  revisionMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  link: { color: tokens.colorBrandForeground1 },
});

export function StatsPage() {
  const styles = useStyles();
  // 页面容器：workbench 族，内容宽上限 1080（patterns.md「页面容器与标题对齐」）
  const page = usePageContainerStyles("workbench");
  const lift = useCardLiftStyles();
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const resolvedTheme = useResolvedTheme();
  const chartTheme = resolvedTheme === "dark" ? "classicDark" : "classic";
  const palette = ANT_PALETTE[resolvedTheme];
  const state = useProjectStateQuery(projectId);
  const recent = useRecentRevisionsQuery(projectId);

  // 图例点击隐藏/显示（条目、任务各一组；切换项目时还原）
  const [hiddenItems, setHiddenItems] = useState<ReadonlySet<string>>(() => new Set());
  const [hiddenTasks, setHiddenTasks] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setHiddenItems(new Set());
    setHiddenTasks(new Set());
  }, [projectId]);

  if (state.isPending) {
    return (
      <div className={page}>
        <PageTitle>{t("stats.title")}</PageTitle>
        <SkeletonRows rows={8} />
      </div>
    );
  }
  if (state.error) {
    return (
      <div className={page}>
        <ErrorState error={state.error} onRetry={() => void state.refetch()} />
      </div>
    );
  }

  const data = state.data;
  const isEmpty = Object.values(data.byType).every((n) => (n ?? 0) === 0);

  if (isEmpty) {
    return (
      <div className={page}>
        <PageTitle>{t("stats.title")}</PageTitle>
        <EmptyState icon={<History24Regular />} title={t("stats.emptyTitle")} hint={t("stats.emptyHint")} />
      </div>
    );
  }

  // 环形图数据（AntV Pie + innerRadius）：图例即下方彩色计数清单，环心标注总量。
  // 点击图例隐藏/显示对应状态：隐藏项数值置 0（零角度扇区不可见）而非从数据中剔除——
  // 保留全量 color 域，其余扇区颜色不漂移，徽章取色始终一致；环心只汇总可见项
  const itemPieData = ITEM_STATUSES.map((s) => ({
    type: t(`status.${s}`),
    value: hiddenItems.has(s) ? 0 : data.itemByStatus[s],
  }));
  const itemVisibleTotal = ITEM_STATUSES.reduce((sum, s) => sum + (hiddenItems.has(s) ? 0 : data.itemByStatus[s]), 0);
  const taskPieData = TASK_STATUSES.map((s) => ({
    type: t(`status.${s}`),
    value: hiddenTasks.has(s) ? 0 : data.taskByStatus[s],
  }));
  const taskVisibleTotal = TASK_STATUSES.reduce((sum, s) => sum + (hiddenTasks.has(s) ? 0 : data.taskByStatus[s]), 0);

  // 类型分布柱状图：colorField 取中文名（name）——底部图例项显示中文名，x 轴保持类型代码；
  // 各类型按主题默认色组（category10）依次取色（无 colorField 时只有单色 colorDefault）；
  // 原生图例在底部，点击图例项可隐藏/显示对应柱（2026-08-28 用户要求添加图例）
  const typeColumnData = Object.entries(data.byType).map(([type, count]) => ({
    type,
    value: count ?? 0,
    name: t(`type.${type}`),
  }));
  const centerTotal = (total: number) => [
    {
      type: "text",
      style: {
        x: "50%",
        y: "50%",
        text: String(total),
        textAlign: "center",
        textBaseline: "middle",
        fontSize: 22,
        fontWeight: 600,
        fill: resolvedTheme === "dark" ? "#E0E0E0" : "#242424",
      },
    },
  ];

  return (
    <div className={page}>
      <PageTitle>{t("stats.title")}</PageTitle>

      {/* 状态统计卡片：环形图（环心总量）+ 下方状态图例（彩色计数清单） */}
      <div className={styles.statRow}>
        <Card className={mergeClasses(styles.statCard, lift.root)}>
          <Title3>{t("stats.statItems")}</Title3>
          <div className={styles.statBody}>
            <Pie
              data={itemPieData}
              angleField="value"
              colorField="type"
              innerRadius={0.62}
              height={150}
              theme={chartTheme}
              legend={false}
              label={false}
              tooltip={(d: { type: string; value: number }) => ({ name: d.type, value: d.value })}
              interaction={{ tooltip: { render: tooltipRender } }}
              annotations={centerTotal(itemVisibleTotal)}
            />
            <div className={styles.chips}>
              {ITEM_STATUSES.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={mergeClasses(styles.chip, hiddenItems.has(s) && styles.chipHidden)}
                  aria-pressed={!hiddenItems.has(s)}
                  onClick={() => setHiddenItems(toggled(s, hiddenItems))}
                >
                  <Badge appearance="ghost" color="subtle" style={{ backgroundColor: palette[i], color: "#fff" }}>
                    {data.itemByStatus[s]}
                  </Badge>
                  <Text size={200}>{t(`status.${s}`)}</Text>
                </button>
              ))}
            </div>
          </div>
        </Card>
        <Card className={mergeClasses(styles.statCard, lift.root)}>
          <Title3>{t("stats.statTasks")}</Title3>
          <div className={styles.statBody}>
            <Pie
              data={taskPieData}
              angleField="value"
              colorField="type"
              innerRadius={0.62}
              height={150}
              theme={chartTheme}
              legend={false}
              label={false}
              tooltip={(d: { type: string; value: number }) => ({ name: d.type, value: d.value })}
              interaction={{ tooltip: { render: tooltipRender } }}
              annotations={centerTotal(taskVisibleTotal)}
            />
            <div className={styles.chips}>
              {TASK_STATUSES.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={mergeClasses(styles.chip, hiddenTasks.has(s) && styles.chipHidden)}
                  aria-pressed={!hiddenTasks.has(s)}
                  onClick={() => setHiddenTasks(toggled(s, hiddenTasks))}
                >
                  <Badge appearance="ghost" color="subtle" style={{ backgroundColor: palette[i], color: "#fff" }}>
                    {data.taskByStatus[s]}
                  </Badge>
                  <Text size={200}>{t(`status.${s}`)}</Text>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* 图表卡片行（2026-09-02 用户指令：类型分布只占一半，另一栏活动图） */}
      <div className={styles.chartRow}>
        <Card className={mergeClasses(styles.chartCard, lift.root)}>
          <Title3>{t("stats.typeDistribution")}</Title3>
          <Column
            data={typeColumnData}
            xField="type"
            yField="value"
            colorField="name"
            height={280}
            theme={chartTheme}
            legend={{ position: "bottom" }}
            tooltip={(d: { name: string; value: number }) => ({ name: d.name, value: d.value })}
            interaction={{ tooltip: { render: tooltipRender } }}
          />
        </Card>
        <Card className={mergeClasses(styles.chartCard, lift.root)}>
          <Title3>{t("stats.activityChart")}</Title3>
          <ActivityChart days={data.revisionsByDay} />
        </Card>
      </div>

      {/* 最近修订时间线（跨条目，list_recent_revisions 支撑；2026-09-02
          用户指令：曾短暂与阻塞提醒并排双卡，随后阻塞卡片整个移除，
          恢复独占一栏） */}
      <Card className={mergeClasses(styles.sectionCard, lift.root)}>
        <Title3>{t("stats.recentRevisions")}</Title3>
        {recent.data?.map((r) => (
          <div key={`${r.code}-${r.revisionNo}`} className={styles.revision}>
            <Link to={`/projects/${projectId}/items/${r.code}`} className={mergeClasses(styles.codeLink, styles.link)}>
              {r.code}
            </Link>
            <span>
              <Text size={300}>{r.title}</Text>
              <span className={styles.revisionMeta}>
                {" "}
                r{r.revisionNo} · {r.actor} · {r.summary}
              </span>
            </span>
            <span className={styles.revisionMeta}>
              <RelativeTime timestamp={r.changedAt} />
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
