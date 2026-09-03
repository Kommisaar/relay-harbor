// 条目详情面板「影响定位」分区内容（FR-013/UI-018；2026-09-03 用户指令
// 自正文区块迁入浮动胶囊面板——patterns.md「浮动胶囊面板」，功能与数据
// 不变、仅呈现容器变更）：受影响条目按类型分组清单，逐项可跳转；遍历
// 语义由 get_impact 承载，UI 只呈现；无受影响条目显示「无」而非隐藏
// （UI-031）。数据恒为当前状态（不随修订快照变化）。
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { StatusBadge } from "../../../components/StatusBadge";
import type { ImpactEntry, ImpactResult, ItemType } from "../../../api/types";

interface ImpactPanelSectionProps {
  projectId: string;
  /** 未加载时按空清单处理（展示「无受影响条目」空态，与迁移前一致） */
  impact: ImpactResult | undefined;
}

const useStyles = makeStyles({
  entryRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    columnGap: tokens.spacingHorizontalM,
    alignItems: "baseline",
    paddingBlock: tokens.spacingVerticalXXS,
  },
  mono: { fontFamily: tokens.fontFamilyMonospace },
  link: { color: tokens.colorBrandForeground1 },
  empty: { color: tokens.colorNeutralForeground3 },
  // 内容内缩 8px：与小节标题同缘（分区 body 边距 L(16) + 本内缩 S(8)
  // = 24px；2026-09-03 用户指令「板块标题和内容要对齐」）
  inset: { paddingLeft: tokens.spacingHorizontalS },
});

export function ImpactPanelSection({ projectId, impact }: ImpactPanelSectionProps) {
  const styles = useStyles();
  const { t } = useTranslation();

  const impactByType = useMemo(() => {
    const map = new Map<ItemType, ImpactEntry[]>();
    for (const entry of impact?.entries ?? []) {
      const list = map.get(entry.item.itemType) ?? [];
      list.push(entry);
      map.set(entry.item.itemType, list);
    }
    return [...map.entries()];
  }, [impact]);

  if (impactByType.length === 0) {
    return (
      <div className={styles.inset}>
        <Text className={styles.empty}>{t("common.noImpact")}</Text>
      </div>
    );
  }

  return (
    <div className={styles.inset}>
      {impactByType.map(([type, entries]) => (
        <div key={type}>
          <Text weight="semibold" size={300}>
            {type} · {t(`type.${type}`)}
          </Text>
          {entries.map((entry) => (
            <div key={entry.item.code} className={styles.entryRow}>
              <Badge appearance="ghost" size="small">
                {t("itemDetail.affectedDepth", { depth: entry.depth })}
              </Badge>
              <span>
                <Link to={`/projects/${projectId}/items/${entry.item.code}`} className={mergeClasses(styles.mono, styles.link)}>
                  {entry.item.code}
                </Link>{" "}
                <Text size={300}>{entry.item.title}</Text>
              </span>
              <StatusBadge status={entry.item.status} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
