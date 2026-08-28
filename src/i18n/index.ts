// i18n 初始化（FR-016/UI-004，i18next + react-i18next，2026-08-28 准入）。
// 语言选择由设置驱动（跟随系统/中文/英文），不在检测器内自动猜测——
// AppProviders 按 settings.language 解析后显式 changeLanguage。
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en";
import zh from "./zh";

export type AppLanguage = "zh" | "en";

/** 系统语言 → 应用语言（跟随系统档位的解析规则） */
export function resolveSystemLanguage(): AppLanguage {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: "zh",
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18n };
