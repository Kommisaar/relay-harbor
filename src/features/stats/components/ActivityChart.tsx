// 活动图（UI-011，2026-09-02 用户指令新增；同日命名定为「活动图」）：逐日修订
// 计数日历网格。AntV Heatmap 实现（mark="cell" + threshold 色阶），与项目统计页
// 其余图表同一管线（2026-09-02 由 Griffel 手绘改 AntV，用户确认，偏差消除；
// 同日页面自「项目概览页」更名「项目统计页」，规格见 pages/project-stats.md）。
// G2 v5 无现成日历布局变换——整周对齐与周/星期分列在数据侧预计算（留痕见
// pages/project-overview.md）。自适应（2026-09-02 用户指令）：格 28px 固定，
// 显示周数由容器宽度实时计算（ResizeObserver 随窗口缩放重算，上限 26 周 =
// API 全量 182 天）。canvas 无 CSS 变量，色阶取 Fluent 品牌色具体值随明暗
// 主题切换。进场动画 zoomIn（2026-09-02 用户指定）。
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Heatmap } from "@ant-design/charts";
import {
  makeStyles,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import { useResolvedTheme } from "../../../components/useResolvedTheme";
import { tooltipRender } from "./ChartTooltip";
import type { DayCount } from "../../../api/types";

const CELL = 28;
const GAP = 3;
// 一列的节距（格 + 缝），n 列网格宽 = n × PITCH − GAP
const PITCH = CELL + GAP;
// 显示周数钳制：下限保证可读；上限 = API 全量 182 天（26 周）
const MIN_WEEKS = 4;
const MAX_WEEKS = 26;
// 档位阈值（修订数）：0 档为空；1-2/3-4/5-7/8+ 分四档品牌色透明度递增
const THRESHOLDS = [0.5, 2.5, 4.5, 7.5];
// 8 位 hex 透明度后缀（0x40≈25%、0x73≈45%、0xB3≈70%，与原 Griffel 版一致）
const BRAND_ALPHAS = ["40", "73", "B3", ""];

// 本地零点解析 YYYY-MM-DD（避开 UTC 偏移导致的日期漂移）
const parseDay = (date: string): Date => new Date(`${date}T00:00:00`);

const useStyles = makeStyles({
  // 卡内吃满剩余高度并垂直居中（图表行两卡等高拉伸，空白上下均摊而非
  // 全堆底部）；alignItems flex-start 防画布被拉伸
  wrap: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    flex: 1,
    minWidth: 0,
  },
});

export function ActivityChart({ days }: { days: DayCount[] }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const resolvedTheme = useResolvedTheme();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);

  // 测量容器可用宽度：格 22px 不变，可容几列显几周，窗口缩放实时重算
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setAvailableWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 可容纳的整列数：n×22 + (n−1)×3 ≤ 宽度 → n = floor((宽+3)/25)；
  // 钳到 [4, 26]（26 周 = 数据全量），测量前不渲染画布
  const weeks =
    availableWidth === null
      ? null
      : Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, Math.floor((availableWidth + GAP) / PITCH)));
  const gridW = weeks === null ? 0 : weeks * PITCH - GAP;

  // 整周对齐：以末日所在周的周一为末列起点回推 weeks 列，窗口头部的
  // 跨周散日舍弃——首日经周一补位后恒为整数列，未来日不产生数据点
  const tail = days.slice(-MAX_WEEKS * 7);
  const last = tail[tail.length - 1];
  let chartData: { week: number; weekday: number; count: number; date: string }[] = [];
  let total = 0;
  if (weeks !== null && last) {
    const endLead = (parseDay(last.date).getDay() + 6) % 7;
    const startIdx = tail.length - 1 - endLead - (weeks - 1) * 7;
    const shown = tail.slice(Math.max(0, startIdx));
    const firstDay = shown[0];
    if (firstDay) {
      // 数据侧日历布局：slot = 首日按周一补位后的格位，week = 列、
      // weekday = 行（周一=0；getDay(): 日=0…六=6）
      const lead = (parseDay(firstDay.date).getDay() + 6) % 7;
      chartData = shown.map((d, i) => {
        const slot = i + lead;
        return { week: Math.floor(slot / 7), weekday: slot % 7, count: d.count, date: d.date };
      });
      total = shown.reduce((sum, d) => sum + d.count, 0);
    }
  }

  // 五档色阶：0 档中性浅底，1~4 档品牌色透明度递增
  const themeObj = resolvedTheme === "dark" ? webDarkTheme : webLightTheme;
  const brand = themeObj.colorBrandBackground;
  const bandColors = [themeObj.colorNeutralBackground3, ...BRAND_ALPHAS.map((a) => `${brand}${a}`)];

  const config = {
    data: chartData,
    // Heatmap 默认 point mark，mark="cell" 切为 band 网格色块
    mark: "cell" as const,
    xField: "week",
    yField: "weekday",
    colorField: "count",
    theme: resolvedTheme === "dark" ? "classicDark" : "classic",
    // 画布 = 实测可容的整列网格宽（撑满卡片宽直至下一个整列），高 7 行
    autoFit: false,
    width: gridW,
    height: 7 * PITCH,
    // plots 容器默认 flex:1 + height:inherit 会撑满 wrap（画布只有 175px，
    // 空白全堆底部）；关掉拉伸让 wrap 的 justifyContent 真正垂直居中
    containerStyle: { flex: "0 0 auto", position: "relative" },
    axis: false as const,
    legend: false as const,
    // 进场动画：逐格 zoomIn（2026-09-02 用户指令）；update/exit 走默认
    animate: { enter: { type: "zoomIn" as const } },
    scale: { color: { type: "threshold" as const, domain: THRESHOLDS, range: bandColors } },
    // inset 为格间留缝（每侧 GAP/2，节距 CELL+GAP → 格 CELL px），radius 圆角
    style: { inset: GAP / 2, radius: 2 },
    // tooltip：与其他图表共用 tooltipRender（色点+名称+加粗值，2026-09-02
    // 用户指令统一）；名称=日期，加粗值=N 修订；色点缺省取格子档位色
    // （G2 heatmapItem 的 itemColorOf 兜底）
    tooltip: (d: { date: string; count: number }) => ({
      name: d.date,
      value: t("stats.revisionCount", { count: d.count }),
    }),
    interaction: {
      tooltip: {
        render: tooltipRender,
      },
    },
  };

  return (
    <div ref={wrapRef} className={styles.wrap} role="group" aria-label={`${t("stats.activityChart")} · ${total}`}>
      {chartData.length > 0 && <Heatmap {...config} />}
    </div>
  );
}
