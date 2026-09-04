// 修订对比开关（patterns.md「修订对比」；2026-09-03 用户指令同日第八次
// 设计修订：废止「查看历史版自动 diff」，改为手动 ToggleButton——默认关
// 显示快照、开则与紧邻上一版单栏 diff；置于修订历史分区标题行右缘、
// 收起按钮左侧）。无上一版（最旧版/仅 1 条修订）时禁用；开关对当前版
// 同样适用（开启 = 最新修订与上一版对比，解锁原自动口径不可达的场景）。
import { ToggleButton, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowSwap16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

interface RevisionDiffToggleProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

// 与 CapsulePanelCollapseButton 同款尺寸（28px 方）与中性灰墨色：subtle
// 外观在 hover/按下/选中都会把前景切到品牌色，用户对收起按钮已定调保持
// 中性灰，本开关随同。根上钉 color 拦不住图标槽——Fluent 对选中态图标
// 槽另有后代规则（.fui-ToggleButton__icon:checked 系列 → 
// colorNeutralForeground2BrandSelected，特异性高于根上钉色），故经根上
// CSS 变量给图标 subtree 供墨（同胶囊 --icon-hover / collapseBtn 的
// var 手法，避 Griffel 后代选择器限制）；图标 span 只认变量、不落回
// currentColor，选中态品牌蓝即被隔离
const useStyles = makeStyles({
  toggleBtn: {
    minWidth: "28px",
    minHeight: "28px",
    color: tokens.colorNeutralForeground2,
    "--diff-icon-ink": tokens.colorNeutralForeground2,
  },
  toggleIcon: {
    color: "var(--diff-icon-ink)",
  },
});

export function RevisionDiffToggle({ checked, disabled = false, onChange }: RevisionDiffToggleProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const label = t("common.comparePrevious");
  return (
    // relationship label：Tooltip 兼作可见名称（aria-label 冗余省去）；
    // Fluent Tooltip 包裹层持有指针事件，禁用态也可出提示
    <Tooltip content={label} relationship="label">
      <ToggleButton
        appearance="subtle"
        size="small"
        className={styles.toggleBtn}
        checked={checked}
        disabled={disabled}
        icon={
          <span className={styles.toggleIcon}>
            <ArrowSwap16Regular />
          </span>
        }
        onClick={() => onChange(!checked)}
      />
    </Tooltip>
  );
}
