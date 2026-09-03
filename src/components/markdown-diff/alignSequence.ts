// 块序列对齐（patterns.md「修订对比」，diff方案.md markdown-unified-diff）。
// 先按语义签名锚定完全相同的块：小序列走 LCS 动态规划；超过平方上限
// 退化为唯一签名 patience 锚点（LIS），仍无法锚定则整段视为增删——
// 避免平方复杂度拖慢长文档。相邻未匹配区间再做**有上限**的单调贪心
// 配对：相似且可递归的容器对输出 changed（交 buildDiffTree 递归），
// 相似但不可递归的块对（如段落微改）输出 paired（渲染为相邻删除+新增），
// 其余保守降级为整块删除/新增。
import { plainText, semanticSignature, type DiffNode } from "./normalizeNode";

export type BlockOp<T extends DiffNode> =
  | { type: "equal"; node: T }
  | { type: "removed"; node: T }
  | { type: "added"; node: T }
  | { type: "paired"; before: T; after: T }
  | { type: "changed"; before: T; after: T };

/** LCS 单元格数上限（1000×1000），超出走 patience 锚点 */
const LCS_CELL_CAP = 1_000_000;
/** 区间配对比较次数上限，超出放弃配对（整段降级增删） */
const PAIR_CELL_CAP = 256;
/** 配对相似度阈值（文本 bigram Dice 系数） */
const PAIR_SIMILARITY_THRESHOLD = 0.5;
/** 相似度计算截断长度（字符），控制长段落配对开销 */
const SIMILARITY_TEXT_CAP = 400;

export function alignBlocks<T extends DiffNode>(
  before: readonly T[],
  after: readonly T[],
  isRecursable: (a: T, b: T) => boolean,
): BlockOp<T>[] {
  const sigBefore = before.map((node) => semanticSignature(node));
  const sigAfter = after.map((node) => semanticSignature(node));
  const matches = matchIndices(sigBefore, sigAfter);

  const ops: BlockOp<T>[] = [];
  let bi = 0;
  let aj = 0;
  for (const [mi, mj] of matches) {
    if (mi > bi || mj > aj) {
      emitGap(before, after, bi, mi, aj, mj, isRecursable, ops);
    }
    const equalNode = after[mj];
    if (equalNode !== undefined) {
      ops.push({ type: "equal", node: equalNode });
    }
    bi = mi + 1;
    aj = mj + 1;
  }
  if (bi < before.length || aj < after.length) {
    emitGap(before, after, bi, before.length, aj, after.length, isRecursable, ops);
  }
  return ops;
}

function emitGap<T extends DiffNode>(
  before: readonly T[],
  after: readonly T[],
  bStart: number,
  bEnd: number,
  aStart: number,
  aEnd: number,
  isRecursable: (a: T, b: T) => boolean,
  ops: BlockOp<T>[],
): void {
  const { pairs, pairedAfter } = pairGap(before, after, bStart, bEnd, aStart, aEnd);
  for (let i = bStart; i < bEnd; i += 1) {
    const node = before[i];
    if (node === undefined) {
      continue;
    }
    const j = pairs.get(i);
    const partner = j === undefined ? undefined : after[j];
    if (j !== undefined && partner !== undefined) {
      ops.push(
        isRecursable(node, partner)
          ? { type: "changed", before: node, after: partner }
          : { type: "paired", before: node, after: partner },
      );
    } else {
      ops.push({ type: "removed", node });
    }
  }
  for (let j = aStart; j < aEnd; j += 1) {
    const node = after[j];
    if (node !== undefined && !pairedAfter.has(j)) {
      ops.push({ type: "added", node });
    }
  }
}

/** 单调贪心配对：before 区间按序找 after 区间中相似度最高的未用项 */
function pairGap<T extends DiffNode>(
  before: readonly T[],
  after: readonly T[],
  bStart: number,
  bEnd: number,
  aStart: number,
  aEnd: number,
): { pairs: Map<number, number>; pairedAfter: Set<number> } {
  const pairs = new Map<number, number>();
  const pairedAfter = new Set<number>();
  const bLen = bEnd - bStart;
  const aLen = aEnd - aStart;
  if (bLen === 0 || aLen === 0 || bLen * aLen > PAIR_CELL_CAP) {
    return { pairs, pairedAfter };
  }
  const afterTexts = new Map<number, string>();
  for (let j = aStart; j < aEnd; j += 1) {
    const node = after[j];
    if (node !== undefined) {
      afterTexts.set(j, similarityText(plainText(node)));
    }
  }
  let nextJ = aStart;
  for (let i = bStart; i < bEnd; i += 1) {
    if (nextJ >= aEnd) {
      break;
    }
    const beforeNode = before[i];
    if (beforeNode === undefined) {
      continue;
    }
    const beforeText = similarityText(plainText(beforeNode));
    let bestJ = -1;
    let bestScore = 0;
    for (let j = nextJ; j < aEnd; j += 1) {
      if (pairedAfter.has(j)) {
        continue;
      }
      const score = similarity(beforeText, afterTexts.get(j) ?? "");
      if (score > bestScore) {
        bestScore = score;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && bestScore >= PAIR_SIMILARITY_THRESHOLD) {
      pairs.set(i, bestJ);
      pairedAfter.add(bestJ);
      nextJ = bestJ + 1;
    }
  }
  return { pairs, pairedAfter };
}

function similarityText(text: string): string {
  return text.replace(/\s+/gu, "").slice(0, SIMILARITY_TEXT_CAP);
}

function similarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) {
    return a === b ? 1 : 0;
  }
  const bigrams = (value: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let k = 0; k < value.length - 1; k += 1) {
      const gram = value.slice(k, k + 2);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
    return map;
  };
  const ga = bigrams(a);
  const gb = bigrams(b);
  let intersection = 0;
  for (const [gram, count] of ga) {
    const other = gb.get(gram);
    if (other !== undefined) {
      intersection += Math.min(count, other);
    }
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

function matchIndices(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  if (a.length === 0 || b.length === 0) {
    return [];
  }
  if (a.length * b.length <= LCS_CELL_CAP) {
    return lcsMatches(a, b);
  }
  return patienceMatches(a, b);
}

function lcsMatches(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  // dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度（滚动一维压缩为二维扁平表）
  const dp = new Uint32Array((n + 1) * width);
  const at = (i: number, j: number): number => dp[i * width + j] ?? 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const out: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([i, j]);
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return out;
}

/** 长序列退化路径：唯一签名锚点 + 最长递增子序列（patience diff） */
function patienceMatches(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const count = (values: readonly string[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const value of values) {
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return map;
  };
  const countA = count(a);
  const countB = count(b);
  const candidates: Array<[number, number]> = [];
  for (let i = 0; i < a.length; i += 1) {
    const sig = a[i];
    if (sig === undefined || countA.get(sig) !== 1 || countB.get(sig) !== 1) {
      continue;
    }
    const j = b.indexOf(sig);
    if (j >= 0) {
      candidates.push([i, j]);
    }
  }
  if (candidates.length === 0) {
    return [];
  }
  // 按 j 求 LIS（candidates 已按 i 递增），patience 牌堆 + 回溯指针
  const pileTops: number[] = [];
  const prev = new Array<number>(candidates.length).fill(-1);
  for (let k = 0; k < candidates.length; k += 1) {
    const j = candidates[k]?.[1] ?? 0;
    let lo = 0;
    let hi = pileTops.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const topJ = candidates[pileTops[mid] ?? 0]?.[1] ?? 0;
      if (topJ < j) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo > 0) {
      prev[k] = pileTops[lo - 1] ?? -1;
    }
    if (lo === pileTops.length) {
      pileTops.push(k);
    } else {
      pileTops[lo] = k;
    }
  }
  const out: Array<[number, number]> = [];
  let cursor = pileTops[pileTops.length - 1] ?? -1;
  while (cursor >= 0) {
    const candidate = candidates[cursor];
    if (candidate !== undefined) {
      out.push(candidate);
    }
    cursor = prev[cursor] ?? -1;
  }
  out.reverse();
  return out;
}
