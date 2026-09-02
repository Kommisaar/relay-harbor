// 第二层项目导航栏（UI-001/002，2026-08-29 用户指令确认恢复停靠版）：
// 2026-09-02 用户指令重构为进入式两级呈现——同一时刻只显示一个层级，
// 层级由路由派生（projectId 有无，不新增 UI 状态）：
// 根层级（/projects）=「总览」全局位 +「项目」分组清单（点击进入项目，
// 路由跳 /projects/:id 落地项目概览 index）；进入层级（/projects/:id/*）
// = 返回行（回 /projects，侧栏与路由同步落回根层级，维持「侧栏反映
// 路由」不变式）+ 项目题行（非交互，不承载指示条与选中态）+ 子导航
// （项目概览/项目统计/14 类型分组清单/任务面板——2026-09-02 用户指令：
// 原「概览」项拆分；2026-09-01 用户指令：类型块扁平拆分常驻、UI-xxx
// 升格第 14 类型；同日用户指令：类型清单按设计阶段加组头小字，TASK
// 与任务面板不入组置尾）。原「选中项目就地展开子导航」树形呈现废止
// （留痕 app-shell.md）。设置页不显示（无二级导航）。导出 2026-08-28
// 用户指令移除（卡片弹出框），搜索 2026-08-28 用户指令暂缓移除。
// 选中态为与第一层同款的共享指示条（位移动画，2026-09-01 用户指令）
// + 选中底色。
import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { ArrowLeft24Regular, Library24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useLayoutEffect, useRef } from "react";
import { listProjects } from "../../api/commands";
import type { ItemType } from "../../api/types";
import { moveIndicator } from "./indicatorMotion";

// 子导航分组词表（2026-09-02 用户指令）：按设计阶段划分，与 docs/design/
// 目录 00→06 同构；组头恒显示、不带计数。TASK 与任务面板不入组置尾。
// 工具级静态词表（随 INV-008 类型集合），非项目数据。
const TYPE_GROUPS: { key: string; types: readonly ItemType[] }[] = [
  { key: "requirements", types: ["FR", "NFR", "BR", "CON"] },
  { key: "useCases", types: ["UC"] },
  { key: "domainModel", types: ["DOM"] },
  { key: "architecture", types: ["CMP", "INT", "SEQ", "ADR"] },
  { key: "detailedDesign", types: ["UI"] },
  { key: "verification", types: ["RISK", "OQ"] },
];

const useStyles = makeStyles({
  root: {
    // 共享指示条的定位参照（absolute 包含块）
    position: "relative",
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
  // 共享选中指示条：与第一层同款（NavigationView 3×16 品牌色圆角竖条）。
  // 位置（translate）由 JS 写入——根层级「总览」与子导航缩进不同，需
  // X+Y 双轴位移；默认隐藏，定位后显示。绝对定位子项不参与 flex/gap
  // 布局。zIndex 提层：条目是定位元素时按 DOM 序会盖住先行声明的指示
  // 条（选中底色压住竖条），显式置顶（.item 已不再携带定位样式，此处
  // 仍保留作为防御）
  indicator: {
    position: "absolute",
    zIndex: 1,
    left: "0",
    top: "0px",
    width: "3px",
    height: "16px",
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    pointerEvents: "none",
    visibility: "hidden",
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
  // 进入层级的项目题行（2026-09-02 用户指令）：非交互展示——中和 .item
  // 的 hover 底色、默认光标，项目名加粗提层级；不承载指示条与选中态
  enteredHeader: {
    ":hover": { backgroundColor: "transparent" },
    cursor: "default",
  },
  enteredName: { fontWeight: tokens.fontWeightSemibold },
  // 子导航（概览/统计/类型/任务）：缩进二级项
  subItem: {
    // 等值迁移：40 = 原 content-box 口径 minHeight 32 + 垂直 padding 8
    minHeight: "40px",
    marginLeft: tokens.spacingHorizontalL,
    fontSize: tokens.fontSizeBase200,
  },
  // 类型分组组头（2026-09-02 用户指令）：非交互小字行，文字与二级项
  // 对齐（缩进 L + 内边距 M，文字距侧栏缘 36px）。组间分隔线（同日
  // 二次指令：先只加分隔线，不加粗不编号；三次指令收短）——组头行
  // 上方 1px hairline，线两端各缩进 L 与条目文字对齐、右侧对称留白，
  // TASK 尾部两行不加线
  groupLabel: {
    marginTop: tokens.spacingVerticalS,
    marginLeft: tokens.spacingHorizontalL,
    marginRight: tokens.spacingHorizontalL,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXXS}`,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
});

export function Sidebar({ projectId }: { projectId: string | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const asideRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // 进入层级的项目（projectId 命中清单时）；数据未就位或 id 无效时
  // 回落根层级（与原树形「不展开」行为一致，app-shell.md 层级路由派生）
  const enteredProject = (projects ?? []).find((p) => p.id === projectId);
  const base = enteredProject ? `/projects/${enteredProject.id}` : "";

  const onOverview = pathname === "/projects";
  // 条目详情（items/:code）按编号前缀（DOM-008 前缀-序号）高亮所属类型；
  // /items/type/:type 页走精确匹配
  const detailCode = /\/items\/([^/]+)$/.exec(pathname)?.[1];
  const activeDetailType =
    pathname.includes("/items/type/") ? null : (detailCode?.split("-")[0] ?? null);

  // 共享指示条定位与位移动画（app-shell.md 第二层选中态，2026-09-01
  // 用户指令：与第一层动画一致）。选中态只落在当前路由对应项——返回行
  // 与项目题行不呈现选中态，aria-current 仅出现在「总览」与子导航项上。
  // projects 数据就位后激活链接才出现，故入 deps。
  // 竖条纵向居中（(条目高-16)/2）、横向对齐条目左缘，根层级条目与子
  // 导航缩进不同，X+Y 双轴位移。
  useLayoutEffect(() => {
    const aside = asideRef.current;
    const indicator = indicatorRef.current;
    if (!aside || !indicator) return;
    const actives = aside.querySelectorAll<HTMLElement>('a[aria-current="page"]');
    const active = actives[actives.length - 1] ?? null;
    if (!active) {
      indicator.style.visibility = "hidden";
      return;
    }
    indicator.style.visibility = "visible";
    moveIndicator(indicator, {
      x: active.offsetLeft,
      y: active.offsetTop + (active.offsetHeight - 16) / 2,
    });
  }, [pathname, projects]);

  return (
    <aside ref={asideRef} className={styles.root} aria-label={t("nav.projects")}>
      <div ref={indicatorRef} className={styles.indicator} aria-hidden="true" />
      {enteredProject ? (
        <>
          {/* 返回行：路由回 /projects，侧栏随之落回根层级（不存独立层级态） */}
          <Link to="/projects" className={styles.item}>
            <span className={styles.itemIcon}>
              <ArrowLeft24Regular />
            </span>
            {t("common.backToList")}
          </Link>
          {/* 项目题行：非交互展示，不承载指示条与选中态（2026-09-02 用户指令） */}
          <div className={mergeClasses(styles.item, styles.enteredHeader)}>
            <span className={styles.label}>
              <span className={mergeClasses(styles.projectName, styles.enteredName)}>
                {enteredProject.name}
              </span>
              <span className={styles.meta}>
                {t("common.itemsCount", { count: enteredProject.itemCount })} ·{" "}
                {t("common.tasksCount", { count: enteredProject.taskCount })}
              </span>
            </span>
          </div>
          <SubLink to={base} label={t("nav.overview")} active={pathname === base} />
          <SubLink to={`${base}/stats`} label={t("nav.stats")} active={pathname === `${base}/stats`} />
          {TYPE_GROUPS.map((group) => (
            <Fragment key={group.key}>
              <div className={styles.groupLabel} aria-hidden="true">
                {t(`nav.group_${group.key}`)}
              </div>
              {group.types.map((type) => {
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
            </Fragment>
          ))}
          <SubLink
            to={`${base}/items/type/TASK`}
            label={`TASK ${t("type.TASK")}`}
            active={pathname === `${base}/items/type/TASK` || activeDetailType === "TASK"}
          />
          <SubLink
            to={`${base}/tasks`}
            label={t("nav.tasks")}
            active={pathname.startsWith(`${base}/tasks`)}
          />
        </>
      ) : (
        <>
          <nav aria-label={t("nav.overviewAll")}>
            <Link
              to="/projects"
              className={mergeClasses(styles.item, onOverview && styles.itemActive)}
              aria-current={onOverview ? "page" : undefined}
            >
              <span className={styles.itemIcon}>
                <Library24Regular />
              </span>
              {t("nav.overviewAll")}
            </Link>
          </nav>
          <div className={styles.section}>{t("nav.projects")}</div>
          {(projects ?? []).map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className={styles.item}>
              <span className={styles.label}>
                <span className={styles.projectName}>{p.name}</span>
                <span className={styles.meta}>
                  {t("common.itemsCount", { count: p.itemCount })} ·{" "}
                  {t("common.tasksCount", { count: p.taskCount })}
                </span>
              </span>
            </Link>
          ))}
        </>
      )}
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
      {label}
    </Link>
  );
}
