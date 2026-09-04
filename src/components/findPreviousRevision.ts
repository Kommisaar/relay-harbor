// 修订对比基准：在修订序列中取 revisionNo 小于目标的最大一项。
// 不假设编号连续，也不假设数组已排序——详情与修订列表是两条独立查询，
// 不能用「倒数第二项」当上一版。
export function findPreviousRevision<T extends { revisionNo: number }>(
  revisions: readonly T[],
  targetRevisionNo: number,
): T | undefined {
  let previous: T | undefined;
  for (const revision of revisions) {
    if (revision.revisionNo >= targetRevisionNo) {
      continue;
    }
    if (previous === undefined || revision.revisionNo > previous.revisionNo) {
      previous = revision;
    }
  }
  return previous;
}
