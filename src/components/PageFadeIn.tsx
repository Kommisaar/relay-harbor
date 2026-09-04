// 页面内容渐入内容层（patterns.md「页面内容渐入」，2026-09-04 三改：
// 分块错落——同页多块以 delay 逐层错开，头部层 0ms 先入、正文层
// +80ms 随后，经行内 --page-enter-delay 注入 .page-enter 的
// animation-delay；backwards fill 保证延迟期保持首帧不可见）。
// 供承载 tree 内 fixed 胶囊的两个页面（条目详情/项目概览）使用——
// 胶囊不入动画层：transform 会使动画祖先临时成为 fixed 的包含块，
// 整容器参与动画会让胶囊 200ms 跳位后弹回。其余页面由
// usePageContainerStyles 直接在容器注入同类名（整块、零延迟）。
import { type CSSProperties, type ReactNode } from "react";

interface PageFadeInProps {
  /** 错落延迟 ms：头部层 0、正文层 140（步进 140，patterns.md 四改同调） */
  delay?: number;
  children: ReactNode;
}

export function PageFadeIn({ delay = 0, children }: PageFadeInProps) {
  return (
    <div className="page-enter" style={{ "--page-enter-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}
