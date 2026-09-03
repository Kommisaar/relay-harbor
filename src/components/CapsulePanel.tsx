// 浮动胶囊面板共享壳层（patterns.md「浮动胶囊面板」；2026-09-03 用户指令
// 自 RevisionTimeline 升格抽出——视口 fixed 悬浮 wrapper、胶囊按钮、同位变形
// 面板、点外/Esc 关闭全部上收，内容以 children 注入）。同日二改：面板
// 名称标题行废除（样例展开面板无名称），收起按钮并入首分区小节标题行
// （CapsulePanelCollapseButton 由调用方置于 CapsulePanelSection 的
// action）。既定交互逐条继承：胶囊与面板同位原位变形（200ms 渐变缩放 +
// visibility 延迟翻转、常挂载）、展开时胶囊 visibility hidden、点外/
// Esc/收起按钮关闭、面板内容超高内部滚动（min(60vh, 520px)，2026-09-03
// 新增）。自绘不引依赖：Fluent Popover 的锚定与滚动行为不合页顶锚定
// 需求（留痕）。
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, Divider, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { ArrowMinimize16Regular, ChevronRight16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

export interface CapsulePanelProps {
  /** 胶囊文字（兼面板 aria 标签；面板无名称标题行） */
  label: string;
  /** 收起态图标（与 expandIcon 叠放做 hover 渐入渐出） */
  icon: ReactNode;
  /** 展开态图标（hover 时渐入）；缺省与 icon 相同（渐变不可见） */
  expandIcon?: ReactNode;
  /** 胶囊计数徽标（如修订数 / 查看历史版时的 rN） */
  badge?: ReactNode;
  /** 非默认态选中底色（如正在查看历史版） */
  active?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 面板内容：多分区纵向堆叠，分区用 CapsulePanelSection 分隔 */
  children: ReactNode;
}

// 小节标题行与行内收起按钮的统一高度（2026-09-03 用户指令：各分区
// 标题行同高，标题到内容间隙一致）
const CAPTION_ROW_HEIGHT = "28px";

const useStyles = makeStyles({
  // 悬浮位：视口右上角 fixed 锚定（2026-09-03 用户指令，随图指认宽窗口
  // 死区问题：原 sticky 参照页面容器（文字列）右缘，宽窗口下容器
  // maxWidth 之外的留白使胶囊远离窗口缘——改 top XXL(24px) + right 24px
  // 恒贴窗口右上，面板同位随锚定；**永不随内容滚走**，原 2026-09-02
  // sticky「与页顶保持最小距离」语义沿革留痕 patterns.md）。right 24px
  // 为令牌外值留痕；另查证 spacingVerticalXXL 令牌实值 24px，历史文档
  // 误标 32px 已订正
  floatWrap: {
    position: "fixed",
    top: tokens.spacingVerticalXXL,
    right: "24px",
    zIndex: 10,
  },
  // 面板的定位参照（面板 absolute 与胶囊同位覆盖）兼点外关闭判定边界
  anchor: { position: "relative" },
  capsule: {
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground1,
    // 文字常规字重 400（2026-09-03 用户指令，覆盖 Fluent Button 默认
    // SemiBold 600；计数徽标在按钮内随之继承）
    fontWeight: tokens.fontWeightRegular,
    // medium Button 默认水平内边距 M(12) 偏紧，胶囊放宽到 L；高度由
    // minHeight 撑出（2026-09-02 用户指令加高 32→40，令牌外值留痕）
    minHeight: "40px",
    padding: `0 ${tokens.spacingHorizontalL}`,
    boxShadow: tokens.shadow8,
    // outline Button 自带边框，active（如查看历史版）时提底色提示非默认态；
    // hover 置 --icon-hover 驱动图标渐入渐出（icon/expandIcon 层
    // 经 calc(var) 派生透明度，避免 Griffel 后代选择器限制）
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      "--icon-hover": "1",
    },
  },
  capsuleActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Selected },
  },
  // 展开时胶囊直接隐藏（2026-09-03 用户指令追加）：不再仅靠面板覆盖，
  // visibility hidden 使其彻底移出命中测试与 AT 树；收起瞬间恢复，
  // 参与反向变形落回
  capsuleHidden: { visibility: "hidden" },
  // 计数徽标
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
  // 图标渐入渐出（2026-09-03 用户指令，由 2026-09-02 的「交叉渐变
  // 旋出」简化为纯透明度过渡）：双层图标叠放，hover 经 --icon-hover
  // 门控——收起态图标渐出、展开态图标渐入，200ms 减速曲线；CSS
  // transition 双向对称，移出时反向渐变恢复。未随「减弱动态」降级
  // （动效轻量，同活动图 canvas 动画留痕策略）
  iconSwap: {
    position: "relative",
    // 图标 16×16（2026-09-03 用户指令「有点大了」：胶囊双层与面板收起
    // 按钮统一换 16 系列字形（List/History/ArrowExpand/ArrowMinimize
    // 16Regular，按 16px 专门设计优于缩放 24 字形），两态维持同尺寸）。
    // 槽 20×20 对 16×16 无挤压；flexShrink 0 为防御保留——若未来换回
    // 更大图标，避免重回「子层全 absolute → min-content 0 被压扁」老路
    width: "16px",
    height: "16px",
    display: "inline-flex",
    flexShrink: "0",
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
    transitionProperty: "opacity",
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: tokens.curveDecelerateMid,
  },
  iconHistory: {
    opacity: "calc(1 - var(--icon-hover, 0))",
  },
  iconExpand: {
    opacity: "var(--icon-hover, 0)",
  },
  // 面板与胶囊同位（2026-09-03 用户指令：展开时经动画变形为面板、
  // 胶囊被覆盖即隐藏，收起时变形回胶囊）：top 与胶囊顶边同线、右对齐，
  // 不再悬于下方。开合走 CSS transition 双向渐变（opacity + scale，
  // top-right origin 自胶囊位放大/缩回），组件常挂载，收起的
  // visibility 延迟翻转保证离场渐出播完才移出可交互树。未随
  // 「减弱动态」降级（动效轻量，同前图标渐变留痕策略）
  panel: {
    position: "absolute",
    top: "0",
    right: "0",
    zIndex: 11,
    // 面板宽度 360–480（2026-09-03 用户指令收窄，原 440–560）：内容
    // 不宽时停在下限，长摘要由行内换行消化
    minWidth: "360px",
    maxWidth: "480px",
    display: "flex",
    flexDirection: "column",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    // 圆角 12px：对齐样例「Git 工具」面板的疏朗大圆角（Fluent 令牌最大
    // XLarge 8px 不够，令牌外值留痕）
    borderRadius: "12px",
    boxShadow: tokens.shadow8,
    overflow: "hidden",
    transformOrigin: "top right",
    transitionProperty: "opacity, transform, visibility",
    // visibility 时长 0：延迟点一到立即移出可交互树，不给隐形面板留
    // 拦截点击的窗口（opacity/transform 正常 200ms 过渡）
    transitionDuration: `${tokens.durationNormal}, ${tokens.durationNormal}, 0ms`,
    // 收起方向用加速曲线；展开方向由 panelOpen 覆盖为减速
    transitionTimingFunction: tokens.curveAccelerateMid,
    transitionDelay: `0ms, 0ms, ${tokens.durationNormal}`,
  },
  panelOpen: {
    opacity: "1",
    transform: "scale(1)",
    visibility: "visible",
    transitionTimingFunction: tokens.curveDecelerateMid,
    transitionDelay: "0ms, 0ms, 0ms",
  },
  panelClosed: {
    opacity: "0",
    transform: "scale(0.9)",
    visibility: "hidden",
  },
  // 面板名称标题行已废除（2026-09-03 用户指令：样例展开面板无名称，
  // 原 2026-09-02 header 沿革见 patterns.md「浮动胶囊面板」）；收起
  // 按钮改由 CapsulePanelCollapseButton 置于首分区小节标题行右侧
  // 收起按钮：subtle 外观的 hover/按下默认把前景切到品牌色（图标变蓝）
  // ——用户指令保持中性灰、仅浅色 hover 底（2026-09-03）。根上三处钉
  // Foreground2 仍拦不住图标槽：Fluent 另有后代规则
  // （.hash:hover .fui-Button__icon → colorNeutralForeground2BrandHover，
  // 特异性 (0,3,0) 高于根上的 (0,2,0)），故经根上 CSS 变量给图标
  // subtree 供墨（同胶囊 --icon-hover 手法，避 Griffel 后代选择器限制）
  collapseBtn: {
    minWidth: CAPTION_ROW_HEIGHT,
    minHeight: CAPTION_ROW_HEIGHT,
    color: tokens.colorNeutralForeground2,
    ":hover": {
      color: tokens.colorNeutralForeground2,
      "--collapse-icon-ink": tokens.colorNeutralForeground2,
    },
    ":active": {
      color: tokens.colorNeutralForeground2,
      "--collapse-icon-ink": tokens.colorNeutralForeground2,
    },
  },
  // 图标墨色随变量：hover/按下钉中性灰，静止回退 currentColor（继承
  // 根上的 Foreground2）
  collapseIcon: {
    color: "var(--collapse-icon-ink, currentColor)",
  },
  // 内容滚动区（2026-09-03 新增：多分区叠加可能超一屏，超出内部滚动）
  panelBody: {
    overflowY: "auto",
    maxHeight: "min(60vh, 520px)",
    paddingBottom: tokens.spacingVerticalM,
  },
  // 分区分隔（2026-09-03 用户指令改样，参照样例 ZCode「Git 工具」面板）：
  // 上缘 hairline（无字 Divider）+ 左对齐弱化小节标题——弃居中夹字
  // Divider；首分区不另画线（上方即面板顶缘；separated=false——原「复用
  // header 下缘线」随同日标题行废除失效）
  sectionRule: { marginTop: tokens.spacingVerticalM },
  // 小节标题行（flex：标题居左、action 居右——首分区放收起按钮）。
  // 左缘 24px 与各分区内容最左元素对齐（2026-09-03 用户指令「板块标题
  // 和内容要对齐」：= sectionBody 内边距 L(16) + 修订圆点自带 8px
  // 外边距；关联/影响定位内容在各自组件内补同一 8px 内缩）
  sectionCaption: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
    // 各分区标题行统一 28px 高（与行内收起按钮同高、文字垂直居中）：
    // 首分区行此前被按钮撑高致「标题→内容」间隙 6px、其余分区 2px
    // 不一致（2026-09-03 用户指令统一）
    minHeight: CAPTION_ROW_HEIGHT,
    marginTop: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalXXS,
    paddingLeft: `calc(${tokens.spacingHorizontalL} + ${tokens.spacingHorizontalS})`,
    paddingRight: tokens.spacingHorizontalL,
    color: tokens.colorNeutralForeground3,
    lineHeight: "16px",
  },
  sectionBody: {
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalS,
  },
  // 分区标题切换按钮（2026-09-03 用户指令：点击展开/折叠分区；同日
  // 再指令 chevron 移至标题后）：标题区独立 disclosure 按钮，hover
  // 浅色底不改前景（同收起按钮手法）；标题文字起于 24px 对齐线，
  // chevron 跟随其后不占前导位置
  captionToggleBtn: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    // 覆盖原生 button 的 UA 默认 padding-left(6px)——否则标题被推出
    // 24px 对齐线（实测恰 +6px）
    paddingLeft: 0,
    paddingRight: tokens.spacingHorizontalXS,
    border: "none",
    background: "transparent",
    color: "inherit",
    textAlign: "left",
    // 不设手型（2026-09-03 用户指令「分区标题先不添加手型」）：
    // 原生 button 在 cursor:auto 下本就是箭头，维持默认
    borderRadius: tokens.borderRadiusSmall,
    // hover/键盘聚焦置变量驱动 chevron 渐显（2026-09-03 用户指令三改：
    // 默认隐藏箭头、hover 才显示，并移除 hover 底色）——同胶囊
    // --icon-hover 的 var 门控手法（避 Griffel 后代选择器限制）
    ":hover": { "--chevron-hover": "1" },
    ":focus-visible": { "--chevron-hover": "1" },
  },
  // chevron 旋转指示：折叠朝右、展开右转 90° 朝下；默认透明，随标题
  // hover/聚焦渐显（opacity + transform 过渡同图标渐变曲线体系；未随
  // 「减弱动态」降级——同前留痕策略）
  chevron: {
    opacity: "var(--chevron-hover, 0)",
    transitionProperty: "transform, opacity",
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: tokens.curveDecelerateMid,
  },
  chevronExpanded: {
    transform: "rotate(90deg)",
  },
  // 分区 body 折叠容器：grid rows 1fr→0fr 高度过渡 + 内层内容随
  // --body-veil 渐隐/渐现（2026-09-03 用户指令加渐入渐出）；0fr 时内层
  // overflow hidden + min-height 0 连同 sectionBody 内边距完全收干。
  // 两向统一减速曲线（同日用户指令反馈原收起方向的加速曲线观感过急）；
  // 时长 300ms = durationSlow（2026-09-03 用户指令按令牌；沿革
  // durationNormal 200ms → 字面 200ms → durationSlow；注意本版令牌
  // durationNormal 实为 200ms、durationSlow 实为 300ms，非文档常写的
  // 150/250）
  bodyCollapse: {
    display: "grid",
    gridTemplateRows: "1fr",
    "--body-veil": "1",
    transitionProperty: "grid-template-rows",
    transitionDuration: tokens.durationSlow,
    transitionTimingFunction: tokens.curveDecelerateMid,
  },
  bodyCollapsed: {
    gridTemplateRows: "0fr",
    "--body-veil": "0",
    transitionTimingFunction: tokens.curveDecelerateMid,
  },
  bodyCollapseInner: {
    overflow: "hidden",
    minHeight: 0,
    opacity: "var(--body-veil, 1)",
    transitionProperty: "opacity",
    transitionDuration: tokens.durationSlow,
    transitionTimingFunction: tokens.curveDecelerateMid,
  },
});

export function CapsulePanel({ label, icon, expandIcon, badge, active, open, onOpenChange, children }: CapsulePanelProps) {
  const styles = useStyles();
  const anchorRef = useRef<HTMLDivElement>(null);

  // 展开期间监听点外关闭与 Esc
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div className={styles.floatWrap}>
      <div ref={anchorRef} className={styles.anchor}>
        <Button
          appearance="outline"
          className={mergeClasses(styles.capsule, active && styles.capsuleActive, open && styles.capsuleHidden)}
          icon={
            <span className={styles.iconSwap} aria-hidden="true">
              <span className={mergeClasses(styles.iconLayer, styles.iconHistory)}>{icon}</span>
              <span className={mergeClasses(styles.iconLayer, styles.iconExpand)}>{expandIcon ?? icon}</span>
            </span>
          }
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          {label}
          {badge != null ? <span className={styles.count}>{badge}</span> : null}
        </Button>
        {/* 常挂载：开合仅切换状态类，收起时离场渐出动画才可播放 */}
        <div
          className={mergeClasses(styles.panel, open ? styles.panelOpen : styles.panelClosed)}
          aria-label={label}
          aria-hidden={!open}
        >
          <div className={styles.panelBody}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/** 面板收起按钮（2026-09-03 用户指令：面板名称标题行废除后，收起控件
    并入首分区小节标题行右侧；点击与点外/Esc 等效） */
export function CapsulePanelCollapseButton({ onCollapse }: { onCollapse: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Button
      appearance="subtle"
      size="small"
      className={styles.collapseBtn}
      icon={
        <span className={styles.collapseIcon}>
          <ArrowMinimize16Regular />
        </span>
      }
      aria-label={t("common.collapsePanel")}
      onClick={onCollapse}
    />
  );
}

/** 面板内分区（上缘 hairline + 左对齐弱化小节标题；patterns.md
    「浮动胶囊面板」）。多分区面板由调用方逐分区包一层；首分区传
    separated={false} 不另画分隔线，并经 action 放置收起按钮
    （CapsulePanelCollapseButton）——2026-09-03 用户指令：小节标题与
    内容最左元素对齐、收起控件并入首分区标题行右缘。同日追加：标题区
    为 disclosure 按钮，点击折叠/展开本分区（chevron 旋转 + grid 高度
    过渡，aria-expanded/aria-controls；折叠分区 ≠ 收起面板——右侧
    action 独立不嵌套；状态分区本地默认展开、不持久化，UI 只读边界
    不变） */
export function CapsulePanelSection({
  title,
  children,
  separated = true,
  action,
}: {
  title: string;
  children: ReactNode;
  separated?: boolean;
  /** 标题行右侧控件（首分区传 CapsulePanelCollapseButton） */
  action?: ReactNode;
}) {
  const styles = useStyles();
  const bodyId = useId();
  const [expanded, setExpanded] = useState(true);
  return (
    <section>
      {separated ? <Divider className={styles.sectionRule} /> : null}
      <div className={styles.sectionCaption}>
        <button
          type="button"
          className={styles.captionToggleBtn}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((v) => !v)}
        >
          <Text size={300}>{title}</Text>
          <ChevronRight16Regular
            aria-hidden="true"
            className={mergeClasses(styles.chevron, expanded && styles.chevronExpanded)}
          />
        </button>
        {action ?? null}
      </div>
      <div id={bodyId} className={mergeClasses(styles.bodyCollapse, !expanded && styles.bodyCollapsed)}>
        <div className={styles.bodyCollapseInner}>
          <div className={styles.sectionBody}>{children}</div>
        </div>
      </div>
    </section>
  );
}
