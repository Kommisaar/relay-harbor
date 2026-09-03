// 条目详情面板「关联」分区内容（FR-010；2026-09-03 用户指令自正文区块
// 迁入浮动胶囊面板——patterns.md「浮动胶囊面板」，功能与数据不变、仅
// 呈现容器变更）：按关系类型分组，每项 = 方向 + 编号链接 + 标题 + 状态
// 徽章；无关联显示「无」而非隐藏（UI-031 结构稳定约定）。数据恒为当前
// 状态（关系不随修订快照变化）。
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { StatusBadge } from "../../../components/StatusBadge";
import type { RelationEntry, RelationType } from "../../../api/types";

interface RelationsPanelSectionProps {
  projectId: string;
  /** 未加载时按空清单处理（展示「无关联」空态，与迁移前一致） */
  relations: RelationEntry[] | undefined;
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
  // 内容内缩：左 8px 与小节标题同缘（分区 body 边距 L(16) + 本内缩 S(8)
  // = 24px）；顶 8px 对齐修订时间线首行文字的视觉位置（首行为单选行，
  // 行内 padding + label 几何使文字落在标题下 ~16px，分组标签原仅 ~8px
  // 偏挤——2026-09-03 用户指令「其他两个模块的间距更近」）
  inset: { paddingTop: tokens.spacingVerticalS, paddingLeft: tokens.spacingHorizontalS },
});

export function RelationsPanelSection({ projectId, relations }: RelationsPanelSectionProps) {
  const styles = useStyles();
  const { t } = useTranslation();

  const relationsByType = useMemo(() => {
    const map = new Map<RelationType, RelationEntry[]>();
    for (const entry of relations ?? []) {
      const list = map.get(entry.relationType) ?? [];
      list.push(entry);
      map.set(entry.relationType, list);
    }
    return [...map.entries()];
  }, [relations]);

  if (relationsByType.length === 0) {
    return (
      <div className={styles.inset}>
        <Text className={styles.empty}>{t("common.noRelations")}</Text>
      </div>
    );
  }

  return (
    <div className={styles.inset}>
      {relationsByType.map(([relationType, entries]) => (
        <div key={relationType}>
          <Text weight="semibold" size={300}>
            {t(`relation.${relationType}`)}
          </Text>
          {entries.map((entry) => (
            <div key={`${entry.relationType}-${entry.direction}-${entry.peer.code}`} className={styles.entryRow}>
              <Badge appearance="ghost" size="small">
                {t(`itemDetail.direction${entry.direction === "out" ? "Out" : "In"}`)}
              </Badge>
              <span>
                <Link to={`/projects/${projectId}/items/${entry.peer.code}`} className={mergeClasses(styles.mono, styles.link)}>
                  {entry.peer.code}
                </Link>{" "}
                <Text size={300}>{entry.peer.title}</Text>
              </span>
              <StatusBadge status={entry.peer.status} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
