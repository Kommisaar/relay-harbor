// 第一层活动栏（UI-001/002）：项目工作台 + 设置两个入口，底部侧栏开合。
import { Link, useLocation } from "react-router-dom";
import { Tooltip, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { Library24Regular, PanelLeft24Regular, Settings24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../stores/ui";

const useStyles = makeStyles({
  rail: {
    width: "48px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalS} 0`,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  button: {
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2,
    textDecoration: "none",
    fontSize: "20px",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  active: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    ":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
  },
  spacer: { flex: 1 },
});

export function ActivityBar() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const inProjects = pathname.startsWith("/projects");
  const inSettings = pathname.startsWith("/settings");

  return (
    <nav className={styles.rail} aria-label={t("common.appName")}>
      <Tooltip content={t("nav.projects")} relationship="label" positioning="after">
        <Link to="/projects" className={mergeClasses(styles.button, inProjects && styles.active)}>
          <Library24Regular />
        </Link>
      </Tooltip>
      <Tooltip content={t("nav.settings")} relationship="label" positioning="after">
        <Link to="/settings" className={mergeClasses(styles.button, inSettings && styles.active)}>
          <Settings24Regular />
        </Link>
      </Tooltip>
      <div className={styles.spacer} />
      <Tooltip content={t("nav.projects")} relationship="label" positioning="after">
        <button type="button" className={styles.button} onClick={toggleSidebar} aria-label="toggle sidebar">
          <PanelLeft24Regular />
        </button>
      </Tooltip>
    </nav>
  );
}
