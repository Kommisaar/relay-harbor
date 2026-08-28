// 加载骨架屏（UI-032）：列表/卡片占位，避免布局跳动。
import { Skeleton, SkeletonItem, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  stack: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, padding: tokens.spacingVerticalXL },
  row: { height: "44px" },
  board: { display: "flex", gap: tokens.spacingHorizontalM },
  boardColumn: { flex: 1, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  card: { height: "64px" },
});

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  const styles = useStyles();
  return (
    <div className={styles.stack} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={styles.row} shape="rectangle">
          <SkeletonItem />
        </Skeleton>
      ))}
    </div>
  );
}

export function SkeletonBoard() {
  const styles = useStyles();
  return (
    <div className={styles.board} aria-busy="true">
      {Array.from({ length: 5 }, (_, col) => (
        <div key={col} className={styles.boardColumn}>
          {Array.from({ length: 2 + (col % 2) }, (_, i) => (
            <Skeleton key={i} className={styles.card} shape="rectangle">
              <SkeletonItem />
            </Skeleton>
          ))}
        </div>
      ))}
    </div>
  );
}
