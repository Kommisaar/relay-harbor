// 页面标题（统一「标题 ↔ 内容」间距）：Fluent Title2 默认渲染为 inline 元素，
// 垂直 margin 不生效，直接跟内容会完全贴合。这里强制块级并留出一行间距。
// 注意：只用于独立成行的页标题；工具栏内与控件同行对齐的标题、详情页头部
// 行内标题组合不适用（会破坏 flex 居中/行内布局）。
import type { ReactNode } from "react";
import { Title2, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: { display: "block", marginBottom: tokens.spacingVerticalL },
});

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  const styles = useStyles();
  return (
    <Title2 className={mergeClasses(styles.root, className)}>{children}</Title2>
  );
}
