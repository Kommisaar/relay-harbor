// 页面容器统一边距与限宽（patterns.md「页面容器与标题对齐」为唯一权威口径）。
// 标题起点锚定整窗 1/4（25vw 绝对位，随窗口等比）——固定像素口径只在调参
// 窗口成立（六改终版左 200 = 1920 整窗 1/4 的 480 减左栏 280，2026-09-02
// 用户七改指令「按整个页面的 1/4 处开始」改为比例锚定）。
// 左 padding = max(24px, 25vw - 280px)：280 = 活动栏收起 48 + 侧栏 232，
// 窗口 < 1216 时钳制下限 24px（最小窗 1024）；设置页无侧栏，左栏仅 48，
// 最小窗下即 25% 无需钳制。右 padding 固定 64（非对称）。
// maxWidth 随 25vw 联动 = 25vw - 左栏 + 内容宽上限 + 64，内容宽上限不随窗变
// （工作台 1080 / 列表 960 / 设置 640 / 看板不限宽）。
// 已知偏差（留痕）：活动栏展开（+152）时标题右移，锚定以默认收起态为基准；
// 25vw 含滚动条宽，标题实际起点右偏约 4px，实览不可辨。
import { makeStyles, tokens } from "@fluentui/react-components";

/** 页面族：决定限宽档位与左栏偏移（设置页无侧栏） */
export type PageContainerFamily = "workbench" | "list" | "settings" | "board";

const useStyles = makeStyles({
  // 工作台族：条目类型 / 项目统计 / 项目概览 / 条目详情（内容宽上限 1080）
  workbench: {
    padding: `${tokens.spacingVerticalXL} 64px ${tokens.spacingVerticalXL} max(24px, calc(25vw - 280px))`,
    maxWidth: "calc(25vw + 864px)",
  },
  // 项目列表（内容宽上限 960）
  list: {
    padding: `${tokens.spacingVerticalXL} 64px ${tokens.spacingVerticalXL} max(24px, calc(25vw - 280px))`,
    maxWidth: "calc(25vw + 744px)",
  },
  // 设置（内容宽上限 640；无侧栏，左栏仅活动栏 48）
  settings: {
    padding: `${tokens.spacingVerticalXL} 64px ${tokens.spacingVerticalXL} calc(25vw - 48px)`,
    maxWidth: "calc(25vw + 656px)",
  },
  // 任务看板（不限宽；height: 100% 纵向 flex 等布局由页面自持）
  board: {
    padding: `${tokens.spacingVerticalXL} 64px ${tokens.spacingVerticalXL} max(24px, calc(25vw - 280px))`,
  },
});

export function usePageContainerStyles(family: PageContainerFamily): string {
  const styles = useStyles();
  return styles[family];
}
