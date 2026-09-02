// 修订时间线共享组件（patterns.md「修订时间线」，2026-09-02 自条目详情
// UI-017 抽出；消费方：条目详情、项目概览 UI-035）。
// 自绘 subtle Button 列表（Fluent v9 无现成 Timeline，不为此引依赖）；
// 版本切换状态由页面持有（viewedRevision 本地 state，null=当前，
// 刷新回当前），组件只做呈现与回调。
import { Button, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { RelativeTime } from "./RelativeTime";

/** 时间线条目最小形态（Revision / OverviewRevision 结构均满足） */
export interface RevisionTimelineEntry {
  revisionNo: number;
  actor: string;
  summary: string;
  changedAt: number;
}

interface RevisionTimelineProps {
  entries: RevisionTimelineEntry[];
  currentRevisionNo: number;
  /** null = 当前版本（UI-017 约定） */
  viewedRevisionNo: number | null;
  /** 点历史版回调该版本号；点当前版回调 null（即回到当前） */
  onSelect: (revisionNo: number | null) => void;
}

const useStyles = makeStyles({
  row: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "56px 1fr auto",
    columnGap: tokens.spacingHorizontalM,
    alignItems: "baseline",
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    textAlign: "left",
    borderRadius: tokens.borderRadiusMedium,
  },
  active: { backgroundColor: tokens.colorNeutralBackground1Selected },
  mono: { fontFamily: tokens.fontFamilyMonospace },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export function RevisionTimeline({ entries, currentRevisionNo, viewedRevisionNo, onSelect }: RevisionTimelineProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <>
      {entries.map((revision) => {
        const isCurrent = revision.revisionNo === currentRevisionNo;
        const isViewing = viewedRevisionNo === revision.revisionNo || (viewedRevisionNo == null && isCurrent);
        return (
          <Button
            key={revision.revisionNo}
            appearance="subtle"
            className={mergeClasses(styles.row, isViewing && styles.active)}
            onClick={() => onSelect(isCurrent ? null : revision.revisionNo)}
          >
            <span className={styles.mono}>
              r{revision.revisionNo}
              {isCurrent ? ` · ${t("common.current")}` : ""}
            </span>
            <span>
              <Text size={300}>{revision.summary}</Text>
              <span className={styles.muted}> · {revision.actor}</span>
            </span>
            <span className={styles.muted}>
              <RelativeTime timestamp={revision.changedAt} />
            </span>
          </Button>
        );
      })}
    </>
  );
}
