// AntV 自定义 tooltip 模式（@ant-design/plots 官方示例）：tooltip 回调整形数据项，
// interaction.tooltip.render 返回 JSX 接管整个浮层内容——title 也被一并替换，
// 因此无需像旧方案那样用 title:"" 压制自动标题（2026-08-28 按用户提供的示例
// 改造；2026-09-02 自 StatsPage 抽出为模块内共享，供活动图复用）
export const tooltipRender = (
  _e: unknown,
  { items }: { items: Array<{ name?: string; value?: number | string; color?: string }> },
) => (
  <>
    {items.map((item) => (
      // gap 为名称与数值的最小间距：浮层宽度由内容收缩适配，长名称下
      // space-between 无富余空间可分，没有 gap 文字会贴住数值（2026-09-02）
      <div key={item.name} style={{ margin: 0, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: item.color,
              marginRight: 6,
            }}
          />
          <span>{item.name}</span>
        </div>
        <b>{item.value}</b>
      </div>
    ))}
  </>
);
