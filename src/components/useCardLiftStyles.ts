// 卡片悬停浮起动效（2026-08-28 用户要求：Hover 时浮起、阴影加深）。
// 共享给各页面的卡片：概览模块卡 + 项目/任务等可点击卡片；
// 表单容器卡片（设置/导出）刻意不加，避免填写时内容随悬停跳动。
// 注意（2026-08-28 排查结论）：
// 1. 使用方必须用 mergeClasses(styles.xxx, lift.root) 合并，不能用模板字符串拼接——
//    Griffel 每个返回值都带序列标识，拼接成单个字符串后 mergeClasses 只识别第一个
//    序列，后续整套类会被静默丢弃（浮起曾因此完全失效）。
// 2. 不做 prefers-reduced-motion 降级：Griffel 的 @media 规则桶插在 :hover 桶之后，
//    同特异性下 transform:none 会完全压掉浮起；用户要求效果始终生效。
import { makeStyles, tokens } from "@fluentui/react-components";

export const useCardLiftStyles = makeStyles({
  root: {
    transitionProperty: "transform, box-shadow",
    transitionDuration: tokens.durationSlow,
    transitionTimingFunction: tokens.curveEasyEase,
    ":hover": {
      transform: "translateY(-4px)",
      boxShadow: tokens.shadow16,
    },
  },
});
