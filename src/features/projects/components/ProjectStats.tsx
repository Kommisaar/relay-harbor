// 项目统计区块（project-list.md「项目卡片统计」，数据源 get_project_state，与概览页
// 同 query key 共享缓存）：条目/任务状态分段条 + 比率 + 类型分布 chips。
// full = 卡片形态；compact = 列表行的紧凑双比率条。
// 统计查询失败降级为占位文案，不阻塞进入项目（卡片点击不受影响）。
import { Skeleton, SkeletonItem, Text, makeStyles, tokens } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { ITEM_STATUSES, TASK_STATUSES, type ProjectState } from "../../../api/types";
import { STATUS_METER_COLOR, StatusMeter, type StatusMeterSegment } from "../../../components/StatusMeter";
import { useProjectStateQuery } from "../queries";

const useStyles = makeStyles({
  statsBlock: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  meterHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  meterLabel: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  meterMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  chips: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  chip: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: tokens.spacingHorizontalXXS,
    padding: `1px ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorNeutralBackground3,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  chipCount: { color: tokens.colorNeutralForeground3 },
  compactRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalXS,
  },
  compactItem: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  compactBar: { width: "64px" },
  compactMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  skeletonFull: { height: "52px" },
  skeletonCompact: { height: "16px", width: "100%" },
  degraded: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

// 0 总数不计算比率（不除零），显示「暂无」提示
const percentOf = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 100));

export function ProjectStats({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { data, isPending, isError } = useProjectStateQuery(projectId);

  if (isPending) {
    return (
      <div aria-busy="true">
        <Skeleton className={compact ? styles.skeletonCompact : styles.skeletonFull}>
          <SkeletonItem />
        </Skeleton>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Text size={200} className={styles.degraded}>
        {t("projects.statsUnavailable")}
      </Text>
    );
  }
  return compact ? <CompactStats data={data} /> : <FullStats data={data} />;
}

function useSegments(data: ProjectState) {
  const { t } = useTranslation();
  const itemSegments: StatusMeterSegment[] = ITEM_STATUSES.map((s) => ({
    key: s,
    label: t(`status.${s}`),
    count: data.itemByStatus[s],
    color: STATUS_METER_COLOR[s],
  }));
  const taskSegments: StatusMeterSegment[] = TASK_STATUSES.map((s) => ({
    key: s,
    label: t(`status.${s}`),
    count: data.taskByStatus[s],
    color: STATUS_METER_COLOR[s],
  }));
  return { itemSegments, taskSegments };
}

function itemCounts(data: ProjectState) {
  const items = ITEM_STATUSES.reduce((sum, s) => sum + data.itemByStatus[s], 0);
  const tasks = TASK_STATUSES.reduce((sum, s) => sum + data.taskByStatus[s], 0);
  return { items, tasks, confirmed: data.itemByStatus.confirmed, done: data.taskByStatus.done };
}

function FullStats({ data }: { data: ProjectState }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { itemSegments, taskSegments } = useSegments(data);
  const { items, tasks, confirmed, done } = itemCounts(data);

  // 类型分布：按计数取前 4，余量合并为「+N」（UI-030 同屏文字表达，chip 带类型全称 title）
  const typeEntries = Object.entries(data.byType)
    .map(([type, count]) => ({ type, count: count ?? 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const topTypes = typeEntries.slice(0, 4);
  const restCount = typeEntries.length - topTypes.length;

  return (
    <div className={styles.statsBlock}>
      <div>
        <div className={styles.meterHead}>
          <Text className={styles.meterLabel}>{t("projects.itemsMeter")}</Text>
          <span className={styles.meterMeta}>
            {items === 0 ? t("projects.noItems") : t("projects.confirmedRate", { percent: percentOf(confirmed, items) })}
          </span>
        </div>
        <StatusMeter
          segments={itemSegments}
          ariaLabel={ITEM_STATUSES.map((s) => `${t(`status.${s}`)} ${data.itemByStatus[s]}`).join("，")}
        />
      </div>
      <div>
        <div className={styles.meterHead}>
          <Text className={styles.meterLabel}>{t("projects.tasksMeter")}</Text>
          <span className={styles.meterMeta}>
            {tasks === 0 ? t("projects.noTasks") : t("projects.doneRate", { percent: percentOf(done, tasks) })}
          </span>
        </div>
        <StatusMeter
          segments={taskSegments}
          ariaLabel={TASK_STATUSES.map((s) => `${t(`status.${s}`)} ${data.taskByStatus[s]}`).join("，")}
        />
      </div>
      {topTypes.length > 0 && (
        <div className={styles.chips}>
          {topTypes.map(({ type, count }) => (
            <span key={type} className={styles.chip} title={t(`type.${type}`)}>
              {type}
              <span className={styles.chipCount}>{count}</span>
            </span>
          ))}
          {restCount > 0 && (
            <span className={styles.chip} title={t("projects.moreTypesTitle")}>
              {t("projects.moreTypes", { count: restCount })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CompactStats({ data }: { data: ProjectState }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { itemSegments, taskSegments } = useSegments(data);
  const { items, tasks, confirmed, done } = itemCounts(data);

  return (
    <div className={styles.compactRow}>
      <span className={styles.compactItem}>
        <span className={styles.compactMeta}>{t("projects.itemsMeter")}</span>
        <StatusMeter
          className={styles.compactBar}
          height={4}
          segments={itemSegments}
          ariaLabel={ITEM_STATUSES.map((s) => `${t(`status.${s}`)} ${data.itemByStatus[s]}`).join("，")}
        />
        <span className={styles.compactMeta}>
          {items === 0 ? t("projects.noItems") : t("projects.confirmedRate", { percent: percentOf(confirmed, items) })}
        </span>
      </span>
      <span className={styles.compactItem}>
        <span className={styles.compactMeta}>{t("projects.tasksMeter")}</span>
        <StatusMeter
          className={styles.compactBar}
          height={4}
          segments={taskSegments}
          ariaLabel={TASK_STATUSES.map((s) => `${t(`status.${s}`)} ${data.taskByStatus[s]}`).join("，")}
        />
        <span className={styles.compactMeta}>
          {tasks === 0 ? t("projects.noTasks") : t("projects.doneRate", { percent: percentOf(done, tasks) })}
        </span>
      </span>
    </div>
  );
}
