// 导出面板页（UI-023，FR-014/UC-016）：表单式单页——范围（整项目/按类型多选）+ 形式（目录/zip）
// + 目标路径 + 导出按钮；异步进度（mock 以回调模拟，联调时换进度事件）+ 结果条（打开目录）。
// 失败路径遵循 UC-016：原因明确、不留误导性成功产物。
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  Checkbox,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  ProgressBar,
  Radio,
  RadioGroup,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { FolderOpen24Regular, ArrowExportLtr24Regular } from "@fluentui/react-icons";
import { exportMarkdown } from "../../../api/commands";
import { ITEM_TYPES, type ExportResult, type ItemType } from "../../../api/types";
import { PageTitle } from "../../../components/PageTitle";

const useStyles = makeStyles({
  page: { padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL}`, maxWidth: "720px", margin: "0 auto" },
  form: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  fieldLabel: { display: "block", marginBottom: tokens.spacingVerticalXS },
  typeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: tokens.spacingVerticalXS },
  pathRow: { display: "flex", gap: tokens.spacingHorizontalS, alignItems: "center" },
  hint: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  result: { marginTop: tokens.spacingVerticalM },
});

type Phase = "idle" | "running" | "done" | "error";

export function ExportPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { projectId = "" } = useParams();

  const [scope, setScope] = useState<"all" | "byType">("all");
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>([...ITEM_TYPES]);
  const [form, setForm] = useState<"directory" | "zip">("directory");
  const [targetPath, setTargetPath] = useState("D:\\exports\\relay-harbor");
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const toggleType = (type: ItemType, checked: boolean) => {
    setSelectedTypes((prev) => (checked ? [...new Set([...prev, type])] : prev.filter((tp) => tp !== type)));
  };

  const submit = async () => {
    setPhase("running");
    setPercent(0);
    setResult(null);
    setErrorKey(null);
    try {
      const res = await exportMarkdown(
        projectId,
        { scope: scope === "all" ? "all" : { types: selectedTypes }, form, targetPath },
        (p) => setPercent(p),
      );
      setResult(res);
      setPhase("done");
    } catch (e) {
      setErrorKey(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  return (
    <div className={styles.page}>
      <PageTitle>{t("exportPage.title")}</PageTitle>
      <Card className={styles.form}>
        {/* 范围（UC-016 主流程：整项目 / 按类型筛选） */}
        <div>
          <Text className={styles.fieldLabel} weight="semibold">
            {t("exportPage.scopeLabel")}
          </Text>
          <RadioGroup value={scope} onChange={(_, d) => setScope(d.value as "all" | "byType")} layout="horizontal">
            <Radio value="all" label={t("exportPage.scopeAll")} />
            <Radio value="byType" label={t("exportPage.scopeByType")} />
          </RadioGroup>
          {scope === "byType" ? (
            <div className={styles.typeGrid}>
              {ITEM_TYPES.map((type) => (
                <Checkbox
                  key={type}
                  label={`${type} · ${t(`type.${type}`)}`}
                  checked={selectedTypes.includes(type)}
                  onChange={(_, d) => toggleType(type, Boolean(d.checked))}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* 形式：目录 / zip */}
        <div>
          <Text className={styles.fieldLabel} weight="semibold">
            {t("exportPage.formLabel")}
          </Text>
          <RadioGroup value={form} onChange={(_, d) => setForm(d.value as "directory" | "zip")} layout="horizontal">
            <Radio value="directory" label={t("exportPage.formDirectory")} />
            <Radio value="zip" label={t("exportPage.formZip")} />
          </RadioGroup>
        </div>

        {/* 目标路径（系统目录选择器：联调时接 Tauri dialog；mock 预填演示路径） */}
        <div>
          <Text className={styles.fieldLabel} weight="semibold">
            {t("exportPage.pathLabel")}
          </Text>
          <div className={styles.pathRow}>
            <Input
              style={{ flex: 1 }}
              placeholder={t("exportPage.pathPlaceholder")}
              value={targetPath}
              onChange={(_, e) => setTargetPath(e.value)}
            />
            <Button
              icon={<FolderOpen24Regular />}
              onClick={() => setTargetPath(`D:\\exports\\relay-harbor-${Date.now() % 1000}`)}
            >
              …
            </Button>
          </div>
          <Text className={styles.hint}>⚠ {t("exportPage.pathExistsHint")}</Text>
        </div>

        <div>
          <Button
            appearance="primary"
            icon={<ArrowExportLtr24Regular />}
            disabled={phase === "running"}
            onClick={() => void submit()}
          >
            {phase === "running" ? t("exportPage.exporting") : t("exportPage.submit")}
          </Button>
        </div>

        {/* 异步进度（NFR-002 不阻塞界面；mock 回调模拟，联调换 INT-006 进度事件） */}
        {phase === "running" ? <ProgressBar value={percent / 100} /> : null}

        {phase === "done" && result ? (
          <MessageBar intent="success" className={styles.result}>
            <MessageBarBody>{t("exportPage.done", { count: result.fileCount })} · {result.path}</MessageBarBody>
            <MessageBarActions>
              <Button icon={<FolderOpen24Regular />} size="small">
                {t("exportPage.openFolder")}
              </Button>
            </MessageBarActions>
          </MessageBar>
        ) : null}

        {phase === "error" && errorKey ? (
          <MessageBar intent="error" className={styles.result}>
            <MessageBarBody>{t(`errors.${errorKey}`, { defaultValue: errorKey })}</MessageBarBody>
          </MessageBar>
        ) : null}
      </Card>
    </div>
  );
}
