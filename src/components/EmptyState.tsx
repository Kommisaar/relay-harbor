// 引导式空态（UI-031）：图标 + 一句话 + 指引。
import type { ReactNode } from "react";
import { makeStyles, tokens, Title3, Body1 } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalXXXL} ${tokens.spacingHorizontalL}`,
    textAlign: "center",
  },
  icon: { fontSize: "40px", color: tokens.colorNeutralForeground3 },
  hint: { color: tokens.colorNeutralForeground3 },
});

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden>
        {icon}
      </div>
      <Title3>{title}</Title3>
      {hint ? <Body1 className={styles.hint}>{hint}</Body1> : null}
    </div>
  );
}
