// 相对时间格式化（分钟/小时/天，词典 time.*）。
import { useTranslation } from "react-i18next";

export function relativeTime(timestamp: number, now = Date.now()): { key: string; n?: number } {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return { key: "time.justNow" };
  if (minutes < 60) return { key: "time.minutesAgo", n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: "time.hoursAgo", n: hours };
  return { key: "time.daysAgo", n: Math.floor(hours / 24) };
}

export function RelativeTime({ timestamp }: { timestamp: number }) {
  const { t } = useTranslation();
  const { key, n } = relativeTime(timestamp);
  return <>{n === undefined ? t(key) : t(key, { n })}</>;
}
