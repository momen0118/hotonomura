import type { GameState } from './types'

// 捧げられたものの扱い(SPEC.md §3)。
//  - 世界: そのタグを持つ行・イベント・場所・持ち物は「最初から無かった」ように消える。
//  - 日記: 消さずに黒く塗る。欠けが見えることが痛みの本体なので、日記だけは残す。
//  - 写真: 糊の跡と四つ角の日焼けだけ残す。

export function isSacrificed(state: GameState, tag: string): boolean {
  return state.sacrificed.includes(tag)
}

/** タグ集合のどれか一つでも捧げられていれば true(=世界から欠けている) */
export function isLost(state: GameState, tags: string[] | undefined): boolean {
  if (!tags || tags.length === 0) return false
  return tags.some((t) => state.sacrificed.includes(t))
}

/** 捧げる。ここを通した瞬間、全域に波及する。 */
export function sacrifice(state: GameState, tags: string[]): void {
  for (const t of tags) {
    if (!state.sacrificed.includes(t)) state.sacrificed.push(t)
  }
  // 持ち物そのものが捧げられた場合、リュックからも消える
  state.inventory = state.inventory.filter((id) => !state.sacrificed.includes(`item:${id}`))
}

/**
 * 黒塗り(規則v2)。行は消さない。日は縮まない。塗るのは指定された語だけ。
 * たこ焼き型は対象語だけ、生き物型は名前+種別まで——黒の面積が重さを語る。
 * 指定がない場合だけ、保険として文全体を塗る。
 */
export function blackout(text: string, target?: string): string {
  if (!target) return text.replace(/\S/gu, '■')
  const bar = '■'.repeat(Array.from(target).length)
  return text.split(target).join(bar)
}
