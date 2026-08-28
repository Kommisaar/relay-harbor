// 条目浏览页（UI-012/013/014，FR-009/UC-011）：13 类型手风琴分组 + 标准行 + 页内过滤工具条。
// 折叠态存 Zustand（UI-012）；零计数类型不出现在列表（与概览页类型分布互补）。
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dropdown,
  Input,
  Option,
  Text,
  Title2,
  Button,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { ChevronRight16Regular, Search24Regular } from "@fluentui/react-icons";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { ItemRow } from "../../../components/ItemRow";
import { PageTitle } from "../../../components/PageTitle";
import { SkeletonRows } from "../../../components/Skeletons";
import { ITEM_STATUSES, TASK_STATUSES, type AnyStatus, type ItemSummary } from "../../../api/types";
import { useUiStore } from "../../../stores/ui";
import { useItemsQuery } from "../queries";

const useStyles = makeStyles({
  page: { padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL}`, maxWidth: "1080px", margin: "0 auto" },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  toolbarSpacer: { flex: 1 },
  group: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    marginBottom: tokens.spacingVerticalS,
    overflow: "hidden",
  },
  groupHeader: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    textAlign: "left",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  chevron: { transition: "transform .15s", display: "flex", alignItems: "center" },
  chevronOpen: { transform: "rotate(90deg)" },
  count: { color: tokens.colorNeutralForeground3 },
  groupBody: { display: "flex", flexDirection: "column" },
});

const ALL = "all";

export function DesignPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const collapsedGroups = useUiStore((s) => s.collapsedGroups);
  const toggleGroup = useUiStore((s) => s.toggleGroup);
  const [status, setStatus] = useState<string>(ALL);
  const [keyword, setKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"code" | "updated">("code");

  // 服务端状态过滤（IPC list_items 过滤参数），关键词与排序为前端行为（UI-014）
  const itemsQuery = useItemsQuery(projectId, status === ALL ? {} : { status: status as AnyStatus });

  const groups = useMemo(() => {
    const map = new Map<string, ItemSummary[]>();
    const needle = keyword.trim().toLowerCase();
    for (const item of itemsQuery.data ?? []) {
      if (needle && !item.code.toLowerCase().includes(needle) && !item.title.toLowerCase().includes(needle)) {
        continue;
      }
      const list = map.get(item.itemType) ?? [];
      list.push(item);
      map.set(item.itemType, list);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, list]) => {
        list.sort((a, b) => (sortBy === "code" ? a.code.localeCompare(b.code) : b.updatedAt - a.updatedAt));
        return { type, list };
      });
  }, [itemsQuery.data, keyword, sortBy]);

  if (itemsQuery.isPending) {
    return (
      <div className={styles.page}>
        <PageTitle>{t("items.title")}</PageTitle>
        <SkeletonRows rows={8} />
      </div>
    );
  }
  if (itemsQuery.error) {
    return (
      <div className={styles.page}>
        <ErrorState error={itemsQuery.error} onRetry={() => void itemsQuery.refetch()} />
      </div>
    );
  }

  const hasAnyItem = (itemsQuery.data?.length ?? 0) > 0;
  const openDetail = (code: string) => navigate(`/projects/${projectId}/items/${code}`);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Title2>{t("items.title")}</Title2>
        <div className={styles.toolbarSpacer} />
        <Dropdown
          aria-label={t("items.statusFilter")}
          value={status === ALL ? t("common.all") : t(`status.${status}`)}
          selectedOptions={[status]}
          onOptionSelect={(_, d) => setStatus(String(d.optionValue))}
        >
          <Option value={ALL}>{t("common.all")}</Option>
          {[...ITEM_STATUSES, ...TASK_STATUSES].map((s) => (
            <Option key={s} value={s}>
              {t(`status.${s}`)}
            </Option>
          ))}
        </Dropdown>
        <Input
          contentBefore={<Search24Regular />}
          placeholder={t("common.keyword")}
          value={keyword}
          onChange={(_, e) => setKeyword(e.value)}
        />
        <Dropdown
          aria-label={t("common.sort")}
          value={sortBy === "code" ? t("common.sortByCode") : t("common.sortByUpdated")}
          selectedOptions={[sortBy]}
          onOptionSelect={(_, d) => setSortBy(d.optionValue === "updated" ? "updated" : "code")}
        >
          <Option value="code">{t("common.sortByCode")}</Option>
          <Option value="updated">{t("common.sortByUpdated")}</Option>
        </Dropdown>
      </div>

      {!hasAnyItem ? (
        <EmptyState icon={<Search24Regular />} title={t("items.emptyTitle")} hint={t("items.emptyHint")} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Search24Regular />} title={t("items.emptyTitle")} hint={t("items.emptyHint")} />
      ) : (
        groups.map(({ type, list }) => {
          const collapsed = collapsedGroups.includes(`${projectId}:${type}`);
          return (
            <section key={type} className={styles.group}>
              <Button appearance="subtle" className={styles.groupHeader} onClick={() => toggleGroup(projectId, type)}>
                <span className={mergeClasses(styles.chevron, !collapsed && styles.chevronOpen)}>
                  <ChevronRight16Regular />
                </span>
                <Text weight="semibold" style={{ fontFamily: tokens.fontFamilyMonospace }}>
                  {type}
                </Text>
                <Text size={300}>{t(`type.${type}`)}</Text>
                <span className={styles.count}>
                  ({list.length} / {itemsQuery.data?.filter((i) => i.itemType === type).length ?? 0})
                </span>
              </Button>
              {!collapsed ? (
                <div className={styles.groupBody}>
                  {list.map((item) => (
                    <ItemRow key={item.code} item={item} onClick={() => openDetail(item.code)} />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
