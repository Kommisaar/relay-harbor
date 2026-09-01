// 条目类型页（UI-012/013/014，FR-009/UC-011）：13 类型各一独立子页面
// （2026-09-01 用户指令拆分，原手风琴聚合页取消，见 ui/pages/items.md）；
// /projects/:id/items 重定向首个类型。单类型平铺标准行 + 过滤工具条，
// 类型过滤走 IPC list_items 的 type 参数。
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dropdown,
  Input,
  Option,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Search24Regular } from "@fluentui/react-icons";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { ItemRow } from "../../../components/ItemRow";
import { SkeletonRows } from "../../../components/Skeletons";
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  TASK_STATUSES,
  type AnyStatus,
  type ItemListFilter,
  type ItemType,
} from "../../../api/types";
import { useItemsQuery } from "../queries";

const useStyles = makeStyles({
  // border-box 迁移：maxWidth 含左右 padding 48，内容宽维持原 1080 口径
  page: { padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL}`, maxWidth: "1128px", margin: "0 auto" },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  toolbarSpacer: { flex: 1 },
  // 标题不收缩：CJK min-content 仅一字宽，任由弹性分配会把标题压成竖排；
  // 空间不足由过滤控件收缩让宽（下限 120px，须覆盖 Fluent Dropdown 默认
  // min-width 250px），见 patterns.md「工具条」
  toolbarTitle: { flexShrink: 0 },
  toolbarControl: { minWidth: "120px" },
  typeCode: { fontFamily: tokens.fontFamilyMonospace, marginRight: tokens.spacingHorizontalS },
  list: { display: "flex", flexDirection: "column" },
});

const ALL = "all";

export function ItemsTypePage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { projectId = "", type = "" } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>(ALL);
  const [keyword, setKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"code" | "updated">("code");

  const knownType = (ITEM_TYPES as readonly string[]).includes(type);
  // 服务端过滤（IPC list_items 的 type/status 参数），关键词与排序为前端行为（UI-014）
  const itemsQuery = useItemsQuery(projectId, buildFilter(type, status));

  const items = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return (itemsQuery.data ?? [])
      .filter((item) => !needle || item.code.toLowerCase().includes(needle) || item.title.toLowerCase().includes(needle))
      .sort((a, b) => (sortBy === "code" ? a.code.localeCompare(b.code) : b.updatedAt - a.updatedAt));
  }, [itemsQuery.data, keyword, sortBy]);

  const title = (
    <>
      <span className={styles.typeCode}>{type}</span>
      {t(`type.${type}`)}
    </>
  );

  if (!knownType) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Search24Regular />} title={t("items.emptyTitle")} hint={t("items.emptyHint")} />
      </div>
    );
  }

  // 工具条常驻（2026-09-01 用户指令）：加载/错误/空态只替换列表区
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Title2 className={styles.toolbarTitle}>{title}</Title2>
        <div className={styles.toolbarSpacer} />
        <Dropdown
          className={styles.toolbarControl}
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
          className={styles.toolbarControl}
          contentBefore={<Search24Regular />}
          placeholder={t("common.keyword")}
          value={keyword}
          onChange={(_, e) => setKeyword(e.value)}
        />
        <Dropdown
          className={styles.toolbarControl}
          aria-label={t("common.sort")}
          value={sortBy === "code" ? t("common.sortByCode") : t("common.sortByUpdated")}
          selectedOptions={[sortBy]}
          onOptionSelect={(_, d) => setSortBy(d.optionValue === "updated" ? "updated" : "code")}
        >
          <Option value="code">{t("common.sortByCode")}</Option>
          <Option value="updated">{t("common.sortByUpdated")}</Option>
        </Dropdown>
      </div>

      {itemsQuery.isPending ? (
        <SkeletonRows rows={8} />
      ) : itemsQuery.error ? (
        <ErrorState error={itemsQuery.error} onRetry={() => void itemsQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Search24Regular />} title={t("items.emptyTitle")} hint={t("items.emptyHint")} />
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <ItemRow key={item.code} item={item} onClick={() => navigate(`/projects/${projectId}/items/${item.code}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** /projects/:id/items → 首个类型页（静态跳转，items.md「交互」） */
export function ItemsIndexRedirect() {
  const { projectId = "" } = useParams();
  return <Navigate to={`/projects/${projectId}/items/type/${ITEM_TYPES[0]}`} replace />;
}

/** exactOptionalPropertyTypes：可选 status 仅在有值时写入过滤对象 */
function buildFilter(type: string, status: string): ItemListFilter {
  const filter: ItemListFilter = { type: type as ItemType };
  if (status !== ALL) {
    filter.status = status as AnyStatus;
  }
  return filter;
}
