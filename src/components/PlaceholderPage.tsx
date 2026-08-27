// 共享占位页：脚手架阶段的各 feature 出口，功能随实现任务落地后替换。
import { Title3, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    padding: `${tokens.spacingVerticalXXXL} ${tokens.spacingHorizontalXXXL}`,
  },
});

export function PlaceholderPage({ title }: { title: string }) {
  const styles = useStyles();
  return (
    <section className={styles.root}>
      <Title3>{title}</Title3>
    </section>
  );
}
