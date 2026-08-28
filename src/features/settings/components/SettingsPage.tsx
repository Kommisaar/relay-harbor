// 设置页（UI-024，FR-016/017/UC-018）：单页两张分组卡片——外观（主题/语言）+ 行为（关闭行为）。
// 每项即时生效并持久化（无「保存」按钮）；设置页无任何业务数据入口（CON-009）。
import { useTranslation } from "react-i18next";
import {
  Card,
  Dropdown,
  Option,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { AppSettings, LanguageSetting, ThemeSetting } from "../../../api/types";
import { PageTitle } from "../../../components/PageTitle";
import { useSettingsQuery, useUpdateSettings } from "../queries";

const useStyles = makeStyles({
  page: { padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL}`, maxWidth: "640px", margin: "0 auto" },
  card: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, marginBottom: tokens.spacingVerticalL },
  field: { display: "grid", gridTemplateColumns: "160px 220px", alignItems: "center", gap: tokens.spacingHorizontalM },
});

export function SettingsPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { data: settings } = useSettingsQuery();
  const update = useUpdateSettings();

  if (!settings) return null;

  const themeOptions: [ThemeSetting, string][] = [
    ["system", t("settings.themeSystem")],
    ["light", t("settings.themeLight")],
    ["dark", t("settings.themeDark")],
  ];
  const languageOptions: [LanguageSetting, string][] = [
    ["system", t("settings.languageSystem")],
    ["zh", t("settings.languageZh")],
    ["en", t("settings.languageEn")],
  ];
  const closeOptions: [AppSettings["closeBehavior"], string][] = [
    ["tray", t("settings.closeTray")],
    ["quit", t("settings.closeQuit")],
  ];

  return (
    <div className={styles.page}>
      <PageTitle>{t("settings.title")}</PageTitle>

      <Card className={styles.card}>
        <Text weight="semibold">{t("settings.appearance")}</Text>
        <div className={styles.field}>
          <Text>{t("settings.theme")}</Text>
          <Dropdown
            value={themeOptions.find(([v]) => v === settings.theme)?.[1] ?? ""}
            selectedOptions={[settings.theme]}
            onOptionSelect={(_, d) => update.mutate({ theme: d.optionValue as ThemeSetting })}
          >
            {themeOptions.map(([value, label]) => (
              <Option key={value} value={value}>
                {label}
              </Option>
            ))}
          </Dropdown>
        </div>
        <div className={styles.field}>
          <Text>{t("settings.language")}</Text>
          <Dropdown
            value={languageOptions.find(([v]) => v === settings.language)?.[1] ?? ""}
            selectedOptions={[settings.language]}
            onOptionSelect={(_, d) => update.mutate({ language: d.optionValue as LanguageSetting })}
          >
            {languageOptions.map(([value, label]) => (
              <Option key={value} value={value}>
                {label}
              </Option>
            ))}
          </Dropdown>
        </div>
      </Card>

      <Card className={styles.card}>
        <Text weight="semibold">{t("settings.behavior")}</Text>
        <div className={styles.field}>
          <Text>{t("settings.closeBehavior")}</Text>
          <Dropdown
            value={closeOptions.find(([v]) => v === settings.closeBehavior)?.[1] ?? ""}
            selectedOptions={[settings.closeBehavior]}
            onOptionSelect={(_, d) => update.mutate({ closeBehavior: d.optionValue as AppSettings["closeBehavior"] })}
          >
            {closeOptions.map(([value, label]) => (
              <Option key={value} value={value}>
                {label}
              </Option>
            ))}
          </Dropdown>
        </div>
      </Card>
    </div>
  );
}
