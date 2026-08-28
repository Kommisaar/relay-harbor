// 搜索页（UI-022，FR-012/UC-014）：仅独立页，回车触发查询；结果按类型分组（与条目浏览一致），
// 命中信息标注（编号/标题/正文）；空结果明确提示（FR-012 验收要求）。
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Input, Text, makeStyles, tokens } from "@fluentui/react-components";
import { Search24Regular } from "@fluentui/react-icons";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { ItemRow } from "../../../components/ItemRow";
import { PageTitle } from "../../../components/PageTitle";
import { SkeletonRows } from "../../../components/Skeletons";
import type { SearchHit } from "../../../api/types";
import { useSearchQuery } from "../queries";

const useStyles = makeStyles({
  page: { padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL}`, maxWidth: "1080px", margin: "0 auto" },
  input: { marginBottom: tokens.spacingVerticalL, maxWidth: "560px" },
  group: { marginBottom: tokens.spacingVerticalM },
  groupTitle: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, marginBottom: tokens.spacingVerticalXS },
  code: { fontFamily: tokens.fontFamilyMonospace },
});

export function SearchPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");

  const query = useSearchQuery(projectId, submitted, submitted.trim().length > 0);

  const groups: [string, SearchHit[]][] = (() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of query.data ?? []) {
      const list = map.get(hit.item.itemType) ?? [];
      list.push(hit);
      map.set(hit.item.itemType, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();

  return (
    <div className={styles.page}>
      <PageTitle>{t("search.title")}</PageTitle>
      <div className={styles.input}>
        <Input
          autoFocus
          contentBefore={<Search24Regular />}
          placeholder={t("search.placeholder")}
          value={draft}
          onChange={(_, e) => setDraft(e.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setSubmitted(draft);
          }}
        />
      </div>

      {submitted.trim() === "" ? (
        <EmptyState icon={<Search24Regular />} title={t("search.title")} hint={t("search.emptyKeyword")} />
      ) : query.isPending ? (
        <SkeletonRows rows={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Search24Regular />}
          title={t("search.noResultTitle", { q: submitted })}
          hint={t("search.noResultHint")}
        />
      ) : (
        groups.map(([type, hits]) => (
          <section key={type} className={styles.group}>
            <div className={styles.groupTitle}>
              <Text weight="semibold" className={styles.code}>
                {type}
              </Text>
              <Text size={300}>{t(`type.${type}`)}</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                ({hits.length})
              </Text>
            </div>
            {hits.map((hit) => (
              <ItemRow
                key={hit.item.code}
                item={hit.item}
                matchedIn={hit.matchedIn}
                onClick={() => navigate(`/projects/${projectId}/items/${hit.item.code}`)}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
