// 条目标准行（UI-013）：编号 + 标题 + 状态徽章 + 修订号 + 更新时间。
// 条目类型页与搜索结果共用（跨 feature 共享上提 components/，dep-cruiser 规则）。
import { makeStyles, tokens, Button } from "@fluentui/react-components";
import type { ItemSummary, SearchMatchedIn } from "../api/types";
import { useTranslation } from "react-i18next";
import { RelativeTime } from "./RelativeTime";
import { StatusBadge } from "./StatusBadge";

const useStyles = makeStyles({
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(72px, auto) 1fr auto",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalM,
    width: "100%",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    textAlign: "left",
    borderRadius: tokens.borderRadiusMedium,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  code: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground2, whiteSpace: "nowrap" },
  title: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
});

export function ItemRow({
  item,
  matchedIn,
  onClick,
}: {
  item: ItemSummary;
  matchedIn?: SearchMatchedIn;
  onClick: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Button appearance="subtle" className={styles.row} onClick={onClick}>
      <span className={styles.code}>{item.code}</span>
      <span className={styles.title}>
        {item.title}
        {matchedIn ? <span style={{ color: tokens.colorNeutralForeground3 }}> · {t(`search.matchedIn${matchedIn === "code" ? "Code" : matchedIn === "title" ? "Title" : "Body"}`)}</span> : null}
      </span>
      <span className={styles.meta}>
        <StatusBadge status={item.status} />
        <span>
          r{item.currentRevision} · <RelativeTime timestamp={item.updatedAt} />
        </span>
      </span>
    </Button>
  );
}
