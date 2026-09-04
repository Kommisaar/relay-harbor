// 头部元信息 chip（patterns.md「头部元信息 chip」，2026-09-03 同日九改：
// 条目详情 metadata 键值对与「rN · 相对时间」、项目概览「rN · 相对时间」
// 统一 chip 形态——1px 中性细边 + 小圆角 + 12px，弱化灰继承 meta 行；
// 自条目详情页本地 metaChip 样式上收共享）。替代者跳转等链接不 chip。
import { type ReactNode } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  chip: {
    display: "inline-block",
    padding: `2px ${tokens.spacingHorizontalS}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusSmall,
    fontSize: tokens.fontSizeBase200,
    lineHeight: "16px",
  },
});

export function MetaChip({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <span className={styles.chip}>{children}</span>;
}
