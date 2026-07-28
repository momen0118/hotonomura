/**
 * 種つきの乱数。周回ごとに揺らぎを出しつつ、同じ状況では同じ結果を返せるようにする。
 * (「村の子がいる日といない日がある」程度の揺らぎ用。SPEC.md §3)
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 文字列から安定した数値を作る(day+slot+place のような組から種を作る用) */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function pick<T>(items: T[], seed: number): T | null {
  if (items.length === 0) return null
  const rnd = mulberry32(seed)
  return items[Math.floor(rnd() * items.length)]
}
