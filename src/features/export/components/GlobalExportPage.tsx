// 全部项目导出页（UI-033，2026-08-28 用户指令新增）：侧栏顶部「导出」入口，
// 把所有项目的条目导出为 Markdown——形式（目录/zip）+ 目标路径，无「范围」
// 选择（恒为全部条目）。目录形态=目标路径/项目名 子目录，zip=每项目一个包。
// mock 阶段前端顺序调用既有 exportMarkdown（INT-006 契约不变）；联调时若
// 后端提供聚合导出命令再替换，UI 行为不变。
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
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
import { EmptyState } from "../../../components/EmptyState";
import { PageTitle } from "../../../components/PageTitle";
import { SkeletonRows } from "../../../components/Skeletons";
import { exportMarkdown, listProjects } from "../../../api/commands";
import type { ExportResult } from "../../../api/types";

const useStyles = makeStyles({
  page: { padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL}`, maxWidth: "720px", margin: "0 auto" },
  form: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  fieldLabel: { display: "block", marginBottom: tokens.spacingVerticalXS },
  pathRow: { display: "flex", gap: tokens.spacingHorizontalS, alignItems: "center" },
  hint: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  result: { marginTop: tokens.spacingVerticalM },
});

type Phase = "idle" | "running" | "done" | "error";

export function GlobalExportPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { data: projects, isPending } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const [form, setForm] = useState<"directory" | "zip">("directory");
  const [targetPath, setTargetPath] = useState("D:\\exports\\relay-harbor");
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  if (isPending) {
    return (
      <div className={styles.page}>
        <PageTitle>{t("exportAll.title")}</PageTitle>
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (!projects || projects.length === 0) {
    return (
      <div className={styles.page}>
        <PageTitle>{t("exportAll.title")}</PageTitle>
        <EmptyState icon={<ArrowExportLtr24Regular />} title={t("projects.emptyTitle")} hint={t("projects.emptyHint")} />
      </div>
    );
  }

  const submit = async () => {
    setPhase("running");
    setPercent(0);
    setResult(null);
    setErrorKey(null);
    const base = targetPath.replace(/[\\/]+$/, "");
    let files = 0;
    try {
      // 顺序导出，整体进度按「已完成项目数 + 当前项目进度」折算（NFR-002 不阻塞界面）
      for (const [i, p] of projects.entries()) {
        const res = await exportMarkdown(
          p.id,
          { scope: "all", form, targetPath: `${base}/${p.name}` },
          (pct) => setPercent(Math.round(((i + pct / 100) / projects.length) * 100)),
        );
        files += res.fileCount;
      }
      setResult({ path: base, fileCount: files });
      setPercent(100);
      setPhase("done");
    } catch (e) {
      setErrorKey(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  return (
    <div className={styles.page}>
      <PageTitle>{t("exportAll.title")}</PageTitle>
      <Card className={styles.form}>
        <Text className={styles.hint}>
          {t("exportAll.projectCount", { count: projects.length })} · {t("exportAll.hint")}
        </Text>

        {/* 形式：目录（每项目子目录）/ zip（每项目一包） */}
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
            <Button icon={<FolderOpen24Regular />} onClick={() => setTargetPath(`D:\\exports\\relay-harbor-${Date.now() % 1000}`)}>
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
