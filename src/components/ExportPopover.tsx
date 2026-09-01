// 导出弹出框（UI-023 修订 / FR-014 / UC-016；2026-08-28 用户指令：导出页面
// `/projects/:id/export` 与 `/export` 移除，迁移为项目列表卡片「导出」按钮
// Popover，表单内容沿用原单页）。位于共享层——feature 之间禁止互相引用，
// projects feature 直接消费本组件（原 features/export 目录随页面移除）。
// 弹层挂载于 portal 天然不冒泡到卡片；触发按钮经外层容器 stopPropagation，
// 避免点击触发卡片「进入项目」。
import { useState } from "react";
import {
  Button,
  Checkbox,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  ProgressBar,
  Radio,
  RadioGroup,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowExportLtr20Regular, FolderOpen24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { exportMarkdown } from "../api/commands";
import { ITEM_TYPES, type ExportResult, type ItemType } from "../api/types";

const useStyles = makeStyles({
  anchor: { display: "inline-flex" },
  surface: {
    width: "360px",
    maxHeight: "70vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  fieldLabel: { display: "block", marginBottom: tokens.spacingVerticalXS },
  typeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: tokens.spacingVerticalXS,
  },
  pathRow: { display: "flex", gap: tokens.spacingHorizontalS, alignItems: "center" },
  hint: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

type Phase = "idle" | "running" | "done" | "error";

export function ExportPopover({ projectId, projectName }: { projectId: string; projectName: string }) {
  const styles = useStyles();
  const { t } = useTranslation();

  const [scope, setScope] = useState<"all" | "byType">("all");
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>([...ITEM_TYPES]);
  const [form, setForm] = useState<"directory" | "zip">("directory");
  const [targetPath, setTargetPath] = useState(`D:\\exports\\${projectName}`);
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
    <div className={styles.anchor} onClick={(e) => e.stopPropagation()}>
      <Popover>
        <PopoverTrigger disableButtonEnhancement>
          <Button
            appearance="subtle"
            size="small"
            icon={<ArrowExportLtr20Regular />}
            aria-label={t("exportPage.title")}
            title={t("exportPage.title")}
          />
        </PopoverTrigger>
        <PopoverSurface aria-label={t("exportPage.title")}>
          <div className={styles.surface}>
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
              <RadioGroup
                value={form}
                onChange={(_, d) => setForm(d.value as "directory" | "zip")}
                layout="horizontal"
              >
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
                  onClick={() => setTargetPath(`D:\\exports\\${projectName}-${Date.now() % 1000}`)}
                >
                  …
                </Button>
              </div>
              <Text className={styles.hint}>⚠ {t("exportPage.pathExistsHint")}</Text>
            </div>

            <div>
              <Button
                appearance="primary"
                icon={<ArrowExportLtr20Regular />}
                disabled={phase === "running"}
                onClick={() => void submit()}
              >
                {phase === "running" ? t("exportPage.exporting") : t("exportPage.submit")}
              </Button>
            </div>

            {/* 异步进度（NFR-002 不阻塞界面；mock 回调模拟，联调换 INT-006 进度事件） */}
            {phase === "running" ? <ProgressBar value={percent / 100} /> : null}

            {phase === "done" && result ? (
              <MessageBar intent="success">
                <MessageBarBody>
                  {t("exportPage.done", { count: result.fileCount })} · {result.path}
                </MessageBarBody>
                <MessageBarActions>
                  <Button icon={<FolderOpen24Regular />} size="small">
                    {t("exportPage.openFolder")}
                  </Button>
                </MessageBarActions>
              </MessageBar>
            ) : null}

            {phase === "error" && errorKey ? (
              <MessageBar intent="error">
                <MessageBarBody>{t(`errors.${errorKey}`, { defaultValue: errorKey })}</MessageBarBody>
              </MessageBar>
            ) : null}
          </div>
        </PopoverSurface>
      </Popover>
    </div>
  );
}
