// 第二层侧栏（UI-001/002，2026-08-28 用户指令重构）：顶部全局位——「总览」
// （全部项目列表页）与「导出」（全部项目导出）；下段「项目」分组清单
// （原下拉切换器的就地形态，行内展示条目/任务概况）；选中项目在其行下
// 就地展开子导航 概览/条目/任务/搜索/导出。设置页无侧栏。
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowExportLtr24Regular, Library24Regular } from "@fluentui/react-icons";
import { listProjects } from "../../api/commands";

const useStyles = makeStyles({
  root: {
    width: "232px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflowY: "auto",
  },
  nav: { display: "flex", flexDirection: "column", gap: "2px", padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}` },
  section: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXXS}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2,
    textDecoration: "none",
    fontSize: tokens.fontSizeBase300,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  active: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    ":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
  },
  projectItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "1px",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2,
    textDecoration: "none",
    fontSize: tokens.fontSizeBase300,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemName: { overflowWrap: "anywhere" },
  itemMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  subnav: { display: "flex", flexDirection: "column", gap: "2px", paddingBottom: tokens.spacingVerticalXS },
  subItem: {
    display: "block",
    marginLeft: "20px",
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2,
    textDecoration: "none",
    fontSize: tokens.fontSizeBase300,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
});

function NavItem({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  const styles = useStyles();
  return (
    <Link to={to} className={mergeClasses(styles.navItem, active && styles.active)}>
      {icon}
      {label}
    </Link>
  );
}

function SubNavItem({ to, label, active }: { to: string; label: string; active: boolean }) {
  const styles = useStyles();
  return (
    <Link to={to} className={mergeClasses(styles.subItem, active && styles.active)}>
      {label}
    </Link>
  );
}

export function Sidebar({ projectId }: { projectId: string | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  return (
    <aside className={styles.root}>
      <nav className={styles.nav}>
        <NavItem
          to="/projects"
          icon={<Library24Regular />}
          label={t("nav.overviewAll")}
          active={pathname === "/projects"}
        />
        <NavItem
          to="/export"
          icon={<ArrowExportLtr24Regular />}
          label={t("nav.export")}
          active={pathname.startsWith("/export")}
        />
      </nav>

      <div className={styles.section}>{t("nav.projects")}</div>
      <nav className={styles.nav}>
        {(projects ?? []).map((p) => {
          const base = `/projects/${p.id}`;
          const inProject = p.id === projectId;
          return (
            <div key={p.id}>
              <Link
                to={base}
                className={mergeClasses(styles.projectItem, inProject && pathname === base && styles.active)}
              >
                <span className={styles.itemName}>{p.name}</span>
                <span className={styles.itemMeta}>
                  {t("common.itemsCount", { count: p.itemCount })} · {t("common.tasksCount", { count: p.taskCount })}
                </span>
              </Link>
              {inProject ? (
                <div className={styles.subnav}>
                  <SubNavItem to={base} label={t("nav.overview")} active={pathname === base} />
                  <SubNavItem
                    to={`${base}/items`}
                    label={t("nav.items")}
                    active={pathname.startsWith(`${base}/items`)}
                  />
                  <SubNavItem
                    to={`${base}/tasks`}
                    label={t("nav.tasks")}
                    active={pathname.startsWith(`${base}/tasks`)}
                  />
                  <SubNavItem
                    to={`${base}/search`}
                    label={t("nav.search")}
                    active={pathname.startsWith(`${base}/search`)}
                  />
                  <SubNavItem
                    to={`${base}/export`}
                    label={t("nav.export")}
                    active={pathname.startsWith(`${base}/export`)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
