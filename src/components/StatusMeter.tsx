// 状态分段条（UI-030 语义色的令牌化实现）：段宽 = 计数占比，title/aria 报读各段计数。
// 卡片粒度的统计不用 @ant-design/charts——状态语义色必须走主题令牌（与 StatusBadge
// 徽章档位一一对应），且避免每卡挂一个 canvas；页面级完整图表保留在概览页（UI-011）。
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { AnyStatus } from "../api/types";

/** 状态 → 主题令牌色（与 StatusBadge 的 Badge color 档位对应，随明暗主题自动切换） */
export const STATUS_METER_COLOR: Record<AnyStatus, string> = {
  draft: tokens.colorNeutralForeground3,
  in_review: tokens.colorPaletteMarigoldForeground2,
  confirmed: tokens.colorPaletteGreenForeground1,
  cancelled: tokens.colorPaletteRedForeground1,
  superseded: tokens.colorPalettePurpleForeground2,
  deprecated: tokens.colorPaletteDarkOrangeForeground1,
  todo: tokens.colorNeutralForeground3,
  doing: tokens.colorBrandForeground1,
  await_review: tokens.colorPaletteMarigoldForeground2,
  done: tokens.colorPaletteGreenForeground1,
};

export interface StatusMeterSegment {
  key: string;
  label: string;
  count: number;
  color: string;
}

const useStyles = makeStyles({
  bar: {
    display: "flex",
    gap: "2px",
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
    background: tokens.colorNeutralBackground3,
  },
  segment: { minWidth: "3px", flexBasis: 0 },
});

export function StatusMeter({
  segments,
  height = 6,
  ariaLabel,
  className,
}: {
  segments: StatusMeterSegment[];
  height?: number;
  ariaLabel: string;
  className?: string;
}) {
  const styles = useStyles();
  const visible = segments.filter((s) => s.count > 0);
  return (
    <div className={mergeClasses(styles.bar, className)} style={{ height }} role="img" aria-label={ariaLabel}>
      {visible.map((s) => (
        <div
          key={s.key}
          className={styles.segment}
          style={{ flexGrow: s.count, background: s.color }}
          title={`${s.label} ${s.count}`}
        />
      ))}
    </div>
  );
}
