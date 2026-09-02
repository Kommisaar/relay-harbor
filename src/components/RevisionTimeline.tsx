// 修订时间线共享组件（patterns.md「修订时间线」；2026-09-02 自条目详情
// UI-017 抽出，同日用户指令由文末内联区块改版为右上角浮动胶囊——原型
// 参照 ZCode「更改」胶囊，内部排版不照搬、以交互逻辑为准）：
// 收起态胶囊 sticky 悬于文档容器顶部右侧（height-0 wrapper 不占文档流，
// 消费方作为 article 首子元素挂载），与页顶保持设定的最小距离、滚动时
// 钉在固定高度不随内容移动（2026-09-02 用户三次指令：top 由 8px 加大至
// XXL 32）；点击开合展开面板（absolute 悬于胶囊下方，行布局沿用原
// 网格）；点外/Esc 关闭、选中修订后收起。版本切换状态由页面持有
// （viewedRevision 本地 state，null=当前，刷新回当前），组件只做开合
// 与回调。自绘点外关闭：Fluent Popover 锚定与滚动行为不合需求（留痕），
// 不为此引依赖。
import { useEffect, useRef, useState } from "react";
import { Button, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { ArrowExpand24Regular, ArrowMinimize24Regular, History24Regular } from "@fluentui/react-icons";
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
  // 浮动位：height-0 sticky 悬浮，胶囊与页顶保持**最小距离**（top XXL 32，
  // 2026-09-02 用户三次指令纠正语义：既非初版 8px 贴顶、也非锚定文档
  // 随页滚离——滚动时胶囊恒不低于此线，视觉上钉在固定高度）
  floatWrap: {
    position: "sticky",
    top: tokens.spacingVerticalXXL,
    zIndex: 10,
    height: "0",
    display: "flex",
    justifyContent: "flex-end",
  },
  // 面板的定位参照（面板 absolute 悬于胶囊下方）
  anchor: { position: "relative" },
  capsule: {
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground1,
    // medium Button 默认水平内边距 M(12) 偏紧，胶囊放宽到 L；高度由
    // minHeight 撑出（2026-09-02 用户指令加高 32→40，令牌外值留痕）
    minHeight: "40px",
    padding: `0 ${tokens.spacingHorizontalL}`,
    boxShadow: tokens.shadow8,
    // outline Button 自带边框，选中查看历史版时提底色提示不在当前版；
    // hover 置 --icon-hover 驱动图标交叉渐变（iconHistory/iconExpand 层
    // 经 calc(var) 派生透明度与旋转，避免 Griffel 后代选择器限制）
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      "--icon-hover": "1",
    },
  },
  capsuleViewing: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Selected },
  },
  // 计数徽标：查看历史版时展示版本号 rN
  count: {
    minWidth: "20px",
    padding: `0 ${tokens.spacingHorizontalXS}`,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    lineHeight: "16px",
    textAlign: "center",
    marginLeft: tokens.spacingHorizontalXXS,
  },
  // 图标交叉渐变（2026-09-02 用户指令）：双层图标叠放，hover 经
  // --icon-hover 门控——历史图标淡出旋出、展开图标旋入淡入，200ms
  // 减速曲线；transform 派生值走 calc(var)，过渡落在 opacity/transform
  // 上。未随「减弱动态」降级（动效轻量，同活动图 canvas 动画留痕策略）
  iconSwap: {
    position: "relative",
    width: "24px",
    height: "24px",
    display: "inline-flex",
  },
  iconLayer: {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transitionProperty: "opacity, transform",
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: tokens.curveDecelerateMid,
  },
  iconHistory: {
    opacity: "calc(1 - var(--icon-hover, 0))",
    transform: "rotate(calc((1 - var(--icon-hover, 0)) * 90deg)) scale(calc(1 - 0.4 * var(--icon-hover, 0)))",
  },
  iconExpand: {
    opacity: "var(--icon-hover, 0)",
    transform: "rotate(calc((var(--icon-hover, 0) - 1) * 90deg)) scale(calc(0.6 + 0.4 * var(--icon-hover, 0)))",
  },
  panel: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: "0",
    zIndex: 11,
    minWidth: "440px",
    maxWidth: "560px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: `0 0 ${tokens.spacingVerticalM}`,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    // 圆角 12px：对齐样例「Git 工具」面板的疏朗大圆角（Fluent 令牌最大
    // XLarge 8px 不够，令牌外值留痕）
    borderRadius: "12px",
    boxShadow: tokens.shadow8,
    overflow: "hidden",
  },
  // 面板 header（2026-09-02 用户指令，样例 ZCode「Git 工具」面板）：
  // 标题居左 + 缩小按钮居右，下缘 hairline 与行清单分隔；样例比例
  // 疏朗——标题 base400(16px)、按钮 32px 命中区、左右留白加足
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalS} ${tokens.spacingVerticalS} ${tokens.spacingHorizontalXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: tokens.spacingVerticalXXS,
  },
  panelTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  collapseBtn: { minWidth: "32px", minHeight: "32px" },
  row: {
    // 行高亮内缩：左右 margin 8 + 圆角，选中底色不再通栏顶到面板边缘
    //（对齐样例/Fluent MenuList 的行形态）；行距加足呼吸感
    margin: `0 ${tokens.spacingHorizontalS}`,
    display: "grid",
    // 修订号列自适应（「rN · 当前」不折行；面板窄于原内联区块，定宽 56px 会折）
    gridTemplateColumns: "auto 1fr auto",
    columnGap: tokens.spacingHorizontalM,
    alignItems: "baseline",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
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
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  // 展开期间监听点外关闭与 Esc（collapse on select 于行回调内处理）
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const viewingHistory = viewedRevisionNo != null;

  return (
    <div className={styles.floatWrap}>
      <div ref={anchorRef} className={styles.anchor}>
        <Button
          appearance="outline"
          className={mergeClasses(styles.capsule, viewingHistory && styles.capsuleViewing)}
          icon={
            <span className={styles.iconSwap} aria-hidden="true">
              <span className={mergeClasses(styles.iconLayer, styles.iconHistory)}>
                <History24Regular />
              </span>
              <span className={mergeClasses(styles.iconLayer, styles.iconExpand)}>
                <ArrowExpand24Regular />
              </span>
            </span>
          }
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t("common.revisionHistory")}
          <span className={styles.count}>
            {viewingHistory ? `r${viewedRevisionNo}` : entries.length}
          </span>
        </Button>
        {open ? (
          <div className={styles.panel} aria-label={t("common.revisionHistory")}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>{t("common.revisionHistory")}</span>
              <Button
                appearance="subtle"
                size="small"
                className={styles.collapseBtn}
                icon={<ArrowMinimize24Regular />}
                aria-label={t("common.collapsePanel")}
                onClick={() => setOpen(false)}
              />
            </div>
            {entries.map((revision) => {
              const isCurrent = revision.revisionNo === currentRevisionNo;
              const isViewing = viewedRevisionNo === revision.revisionNo || (viewedRevisionNo == null && isCurrent);
              return (
                <Button
                  key={revision.revisionNo}
                  appearance="subtle"
                  className={mergeClasses(styles.row, isViewing && styles.active)}
                  onClick={() => {
                    onSelect(isCurrent ? null : revision.revisionNo);
                    // 选中即收起：正文换装与提示条反馈已足够，面板不遮挡阅读
                    setOpen(false);
                  }}
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
