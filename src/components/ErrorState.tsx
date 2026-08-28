// 统一错误态（modules/frontend.md 既有约定）：说明 + 重试。
// mock 命令以短码抛错（Error.message），此处经 i18n 映射，未知名回落原文。
import { Button } from "@fluentui/react-components";
import { ErrorCircle24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 48 }}>
      <ErrorCircle24Regular style={{ fontSize: 40 }} aria-hidden />
      <div>{t(`errors.${message}`, { defaultValue: "", message }) || t("errors.fallback", { message })}</div>
      {onRetry ? <Button appearance="primary" onClick={onRetry}>{t("common.retry")}</Button> : null}
    </div>
  );
}
