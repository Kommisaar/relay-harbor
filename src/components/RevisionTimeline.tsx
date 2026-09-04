// 修订时间线内容组件（patterns.md「浮动胶囊面板」的修订历史分区）。
// 2026-09-02 自条目详情 UI-017 抽为共享组件、同日用户指令改右上角浮动
// 胶囊；2026-09-03 壳层（sticky 悬浮/胶囊按钮/同位变形面板/点外 Esc
// 关闭）上收共享 CapsulePanel，本组件只保留 RadioGroup 版本清单内容，
// 由消费方（条目详情/项目概览）包入 CapsulePanel 使用。
// 原生单选圆点表达查看中版本（选中=品牌色），方向键在版本间移动
// （roving tabindex）；选中不自动收起。版本切换状态由页面持有
// （viewedRevision 本地 state，null=当前，刷新回当前），组件只做回调。
import { Radio, RadioGroup, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { RelativeTime } from "./RelativeTime";

/** 时间线条目最小形态（Revision / ProjectDocRevision 结构均满足）。
    title 为修订标题（2026-09-03 用户指令替代 actor，操作者审计在操作日志） */
export interface RevisionTimelineEntry {
  revisionNo: number;
  title: string;
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

/** 全局样式钩子（styles.css「修订历史时间线行」）：label flex-grow 补丁
    的作用域限定类 */
const RADIO_HOOK_CLASS = "rev-timeline-radio";

const useStyles = makeStyles({
  // 行外壳：轨道的锚定与承载层（2026-09-03 断线二修）。轨道挂在
  // wrapper 上而非 Radio 内——Radio 会把越出自身边界的子元素裁掉，
  // 轨道延伸段在行交界处不可见即断线；wrapper 透明无边框不裁剪。
  // alignSelf stretch：RadioGroup 纵向 flex 不拉伸子项，行会按内容
  // 收缩、内部网格无从撑满行宽（时间右对齐失效）。上下对称 padding
  // 4px 放大条目间距（2026-09-03 用户指令）——对称 padding 不改变
  // 「行高 50% = 圆点圆心」的轨道锚点
  rowWrap: {
    position: "relative",
    alignSelf: "stretch",
    // 水平 margin 0 S 已移除（2026-09-03 用户指令「板块标题和内容要
    // 对齐」）：圆点左缘随分区内容边距（16 + indicator 自带 8）落在
    // 小节标题同缘 24px；轨道相对几何不变（随行整体平移）
    padding: "4px 0",
  },
  // Radio 行（2026-09-03 用户指令改 RadioGroup 形态）：原生单选圆点
  // 表达查看中状态（替代三态彩点），方向键可在版本间移动。root
  // alignItems flex-start（2026-09-03 用户指令：圆点与**标题首行**
  // 对齐，不再行内垂直居中——多行条目里居中圆点会悬在两行之间）。
  // indicator 默认 margin-top 8px 恰使圆心落在 label 净偏移（padding
  // 8 + margin -2）下的 20px 标题首行中心线上，无需覆盖
  radio: {
    width: "100%",
    paddingLeft: "0",
    paddingRight: "0",
    alignItems: "flex-start",
  },
  // Radio label 内容网格：修订号 + 两行主列 + 相对时间（2026-09-03
  // 用户指令改两行结构：标题第一行、摘要第二行弱化，不再「·」内联；
  // 时间顶线右对齐统一）；行文字常规字重 400（覆盖 Fluent 默认
  // SemiBold，与胶囊/面板标题统一）
  rowContent: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    columnGap: tokens.spacingHorizontalM,
    alignItems: "start",
    width: "100%",
    paddingRight: tokens.spacingHorizontalM,
    textAlign: "left",
    fontWeight: tokens.fontWeightRegular,
  },
  // 主列：标题/摘要纵向排列；minWidth 0 允许长摘要换行收缩
  rowMain: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: "0",
  },
  // 时间列右缘对齐（auto 列宽取最宽时间，窄时间默认左缘对齐会参差）；
  // 20px 行盒与标题首行同高，首行中心线三格重合
  rowTime: { justifySelf: "end", lineHeight: "20px" },
  // 竖向轨道：stroke2 2px，对准 Radio 原生圆点圆心。圆心为常量距行顶
  // 20px（wrapper padding 4 + indicator margin 8 + 半径 8，与标题首行
  // 20px 行盒中心线重合——2026-09-03 用户指令圆点对齐标题行）。轨段
  // 止于圆点上下切点（上切点 y=12、下切点 y=28）、不穿孔——空心圆点
  // 内芯透明，轨线穿孔即从内芯露出；railDown 止于下行上切点高度上方
  // （+8 < +12），与下行 railUp 重叠衔接且不压圆环
  rail: {
    position: "absolute",
    zIndex: 1,
    left: "15px",
    width: "2px",
    backgroundColor: tokens.colorNeutralStroke2,
  },
  railDown: { top: "28px", height: "calc(100% - 20px)" },
  // 上段：自行上方 8px 延伸至圆点上切点（-8 + 20 = 12）
  railUp: { top: "-8px", height: "20px" },
  // 修订号与时间钉在 20px 首行行盒（与标题行盒同高，首行中心线三格
  // 重合、并与圆点圆心 y=20 对齐）
  mono: { fontFamily: tokens.fontFamilyMonospace, lineHeight: "20px" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export function RevisionTimeline({ entries, currentRevisionNo, viewedRevisionNo, onSelect }: RevisionTimelineProps) {
  const styles = useStyles();
  const { t } = useTranslation();

  return (
    // RadioGroup 形态（2026-09-03 用户指令）：原生单选圆点表达查看中
    // 状态，方向键在版本间移动；选中不自动收起，便于连续浏览版本
    // （点外/Esc/收起按钮照常关闭）。value 以当前查看版为受控值，
    // 选当前版回传 null
    <RadioGroup
      value={String(viewedRevisionNo ?? currentRevisionNo)}
      onChange={(_, data) => {
        const v = Number(data.value);
        onSelect(v === currentRevisionNo ? null : v);
      }}
      aria-label={t("common.revisionHistory")}
    >
      {entries.map((revision, index) => {
        // 轨道挂 wrapper 层（Radio 会裁剪越界子元素）；非首行有上段、
        // 非末行有下段，段止于圆点切点、行交界 ±8px 重叠衔接；单行
        // 条目无轨道
        const showUp = entries.length > 1 && index > 0;
        const showDown = entries.length > 1 && index < entries.length - 1;
        return (
          <div key={revision.revisionNo} className={styles.rowWrap}>
            {showUp ? <span className={mergeClasses(styles.rail, styles.railUp)} aria-hidden="true" /> : null}
            {showDown ? <span className={mergeClasses(styles.rail, styles.railDown)} aria-hidden="true" /> : null}
            <Radio
              value={String(revision.revisionNo)}
              className={mergeClasses(styles.radio, RADIO_HOOK_CLASS)}
              label={
                <span className={styles.rowContent}>
                  <span className={styles.mono}>v{revision.revisionNo}</span>
                  <span className={styles.rowMain}>
                    <Text size={300}>{revision.title}</Text>
                    {revision.summary ? <span className={styles.muted}>{revision.summary}</span> : null}
                  </span>
                  <span className={mergeClasses(styles.muted, styles.rowTime)}>
                    <RelativeTime timestamp={revision.changedAt} />
                  </span>
                </span>
              }
            />
          </div>
        );
      })}
    </RadioGroup>
  );
}
