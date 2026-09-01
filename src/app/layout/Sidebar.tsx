// 第二层项目导航栏（UI-001/002，2026-08-29 用户指令确认恢复停靠版）：
// 内容=顶部「总览」全局位（全部项目列表页）+「项目」分组清单（各项目
// 名称+条目/任务概况，选中项目就地展开子导航 概览/13 类型固定清单/
// 任务——2026-09-01 用户指令：原「条目」聚合入口移除，类型块扁平拆分
// 常驻，无条目类型同样出现）；设置页不显示（无二级导航）。导出入口
// 2026-08-28 用户指令移除（卡片弹出框），搜索 2026-08-28 用户指令
// 暂缓移除。选中项品牌色 pill + 选中底色。
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { Library24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { listProjects } from "../../api/commands";
import { ITEM_TYPES } from "../../api/types";

const useStyles = makeStyles({
  root: {
    // border-box 口径（含 16px 内边距 + 1px 右边框），与 app-shell.md「约 232px」一致
    width: "232px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflowY: "auto",
  },
  item: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    // 等值迁移：44 = 原 content-box 口径 minHeight 36 + 垂直 padding 8
    minHeight: "44px",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    marginLeft: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1,
    textDecoration: "none",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Selected },
  },
  // NavigationView 选中 pill：左侧 3×16 品牌色竖条
  pill: {
    position: "absolute",
    left: "0",
    top: "50%",
    transform: "translateY(-50%)",
    width: "3px",
    height: "16px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorBrandForeground1,
  },
  itemIcon: {
    display: "flex",
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
  },
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  section: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXXS}`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  projectName: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    display: "block",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  // 选中项目展开的子导航（概览/条目/任务）：缩进二级项
  subItem: {
    // 等值迁移：40 = 原 content-box 口径 minHeight 32 + 垂直 padding 8
    minHeight: "40px",
    marginLeft: tokens.spacingHorizontalL,
    fontSize: tokens.fontSizeBase200,
  },
});

export function Sidebar({ projectId }: { projectId: string | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const onOverview = pathname === "/projects";
  // 条目详情（items/:code）按编号前缀（DOM-008 前缀-序号）高亮所属类型；
  // /items/type/:type 页走精确匹配；/items 聚合页已取消（重定向首个类型）
  const detailCode = /\/items\/([^/]+)$/.exec(pathname)?.[1];
  const activeDetailType =
    pathname.includes("/items/type/") ? null : (detailCode?.split("-")[0] ?? null);

  return (
    <aside className={styles.root} aria-label={t("nav.projects")}>
      <nav aria-label={t("nav.overviewAll")}>
        <Link to="/projects" className={mergeClasses(styles.item, onOverview && styles.itemActive)} aria-current={onOverview ? "page" : undefined}>
          {onOverview ? <span className={styles.pill} /> : null}
          <span className={styles.itemIcon}>
            <Library24Regular />
          </span>
          {t("nav.overviewAll")}
        </Link>
      </nav>

      <div className={styles.section}>{t("nav.projects")}</div>
      {(projects ?? []).map((p) => {
        const base = `/projects/${p.id}`;
        const inProject = p.id === projectId;
        return (
          <div key={p.id}>
            <Link
              to={base}
              className={mergeClasses(styles.item, inProject && styles.itemActive)}
              aria-current={inProject ? "page" : undefined}
            >
              {inProject ? <span className={styles.pill} /> : null}
              <span className={styles.label}>
                <span className={styles.projectName}>{p.name}</span>
                <span className={styles.meta}>
                  {t("common.itemsCount", { count: p.itemCount })} ·{" "}
                  {t("common.tasksCount", { count: p.taskCount })}
                </span>
              </span>
            </Link>
            {inProject ? (
              <div>
                <SubLink to={base} label={t("nav.overview")} active={pathname === base} />
                {ITEM_TYPES.map((type) => {
                  const to = `${base}/items/type/${type}`;
                  return (
                    <SubLink
                      key={type}
                      to={to}
                      label={`${type} ${t(`type.${type}`)}`}
                      active={pathname === to || activeDetailType === type}
                    />
                  );
                })}
                <SubLink
                  to={`${base}/tasks`}
                  label={t("nav.tasks")}
                  active={pathname.startsWith(`${base}/tasks`)}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}

function SubLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  const styles = useStyles();
  return (
    <Link
      to={to}
      className={mergeClasses(styles.item, styles.subItem, active && styles.itemActive)}
      aria-current={active ? "page" : undefined}
    >
      {active ? <span className={styles.pill} /> : null}
      {label}
    </Link>
  );
}
