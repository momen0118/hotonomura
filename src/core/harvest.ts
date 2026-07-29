import type { GameState } from './types'
import { sacrifice } from './tags'
import weightsJson from '../data/weights.json'

// 収穫(FABLE_ANSWERS_6 §1〜3)。
// 村で育った思い出は神の畑の作物で、周回の終わりに勝手に「収穫」される。
// ソラは選べない。支払いではなく収穫。UIも演出も出ない——完全無音。
// 収穫は重い順(同weightは日付の新しい順)。n周目の帰りに上位n件。停滞するほど一気に減る。

const WEIGHTS = weightsJson as unknown as Record<string, number>

interface Candidate {
  tag: string
  weight: number
  day: number
}

/** まだ収穫も焼却もされていない村の思い出を、重い順に並べて返す。 */
export function harvestCandidates(state: GameState): Candidate[] {
  const best = new Map<string, Candidate>()
  for (const page of state.diary) {
    if (page.torn) continue
    for (const e of page.entries) {
      for (const tag of e.tags ?? []) {
        const weight = WEIGHTS[tag]
        if (weight === undefined) continue // 実物・場所タグは収穫対象外
        if (state.sacrificed.includes(tag) || state.burned.includes(tag)) continue
        const prev = best.get(tag)
        if (!prev || page.day > prev.day) best.set(tag, { tag, weight, day: page.day })
      }
    }
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight || b.day - a.day)
}

/**
 * 帰りのバスで走る収穫。上位 count 件(既定=周回数)を無音で黒塗りにする。
 * 発覚は二周目以降、日記を開いた瞬間だけ(ここでは何も表示しない)。
 */
export function harvest(state: GameState, count = state.loop): void {
  const taken = harvestCandidates(state).slice(0, count)
  for (const c of taken) {
    if (!state.harvested.includes(c.tag)) state.harvested.push(c.tag)
    sacrifice(state, [c.tag])
  }
}
