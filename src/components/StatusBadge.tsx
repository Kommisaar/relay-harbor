// 状态徽章（UI-030 语义色映射）：Fluent v9 Badge 以 appearance(形态)+color(语义色) 双轴表达；
// 同屏带文字，不单靠颜色区分（无障碍）。
import { Badge, type BadgeProps } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import type { AnyStatus } from "../api/types";

type BadgeColor = NonNullable<BadgeProps["color"]>;

const COLOR: Record<AnyStatus, BadgeColor> = {
  draft: "subtle",
  in_review: "warning",
  confirmed: "success",
  cancelled: "danger",
  superseded: "important",
  deprecated: "severe",
  todo: "subtle",
  doing: "brand",
  await_review: "warning",
  done: "success",
};

export function StatusBadge({ status, size = "small" }: { status: AnyStatus; size?: BadgeProps["size"] }) {
  const { t } = useTranslation();
  return (
    <Badge appearance="tint" color={COLOR[status]} size={size}>
      {t(`status.${status}`)}
    </Badge>
  );
}
