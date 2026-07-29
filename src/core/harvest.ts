import type { GameState } from './types'
import { sacrifice } from './tags'
import { hashString, mulberry32 } from './rng'
import weightsJson from '../data/weights.json'

// 収穫(FABLE_ANSWERS_6 §1〜3、12b §1 で順序を改訂)。
// 村で育った思い出は神の畑の作物で、周回の終わりに勝手に「収穫」される。
// ソラは選べない。支払いではなく収穫。UIも演出も出ない——完全無音。
//  - 1周目は「夏祭り」に固定(二周目開幕の黒は祭りのページ)。
//  - 2周目以降は、未収穫・未焼却の思い出の最上位weight帯からランダム抽選で n 件(n=周回数)。

const WEIGHTS = weightsJson as unknown as Record<string, number>

/** 空っぽEDの閾値(12a §4)。残存する村の思い出の合計weightがこれ以下でED。 */
export const EMPTY_ED_THRESHOLD = WEIGHTS['_empty_ed_threshold'] ?? 8

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

/** 残存する村の思い出の合計weight(空っぽEDの判定に使う)。 */
export function villageWeightRemaining(state: GameState): number {
  return harvestCandidates(state).reduce((sum, c) => sum + c.weight, 0)
}

/**
 * 帰りのバスで走る収穫(12b §1)。無音で count 件(既定=周回数)を黒塗りにする。
 * 発覚は二周目以降、日記を開いた瞬間だけ(ここでは何も表示しない)。
 */
export function harvest(state: GameState, count = state.loop): void {
  const cands = harvestCandidates(state)
  if (cands.length === 0) return

  let taken: Candidate[]
  if (state.loop === 1) {
    // 一周目は必ず「夏祭り」。無ければ最上位から(祭りに行っていない周の保険)。
    const matsuri = cands.filter((c) => c.tag === 'fun:matsuri')
    taken = (matsuri.length > 0 ? matsuri : cands).slice(0, count)
  } else {
    // 最上位weight帯から順に、同weight内はシャッフルして n 件。周ごとに欠け方が変わる。
    const rnd = mulberry32(hashString(`${state.seed}:${state.loop}:harvest`))
    const weights = [...new Set(cands.map((c) => c.weight))].sort((a, b) => b - a)
    const ordered: Candidate[] = []
    for (const w of weights) {
      const tier = cands.filter((c) => c.weight === w)
      for (let i = tier.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1))
        ;[tier[i], tier[j]] = [tier[j], tier[i]]
      }
      ordered.push(...tier)
    }
    taken = ordered.slice(0, count)
  }

  for (const c of taken) {
    if (!state.harvested.includes(c.tag)) state.harvested.push(c.tag)
    sacrifice(state, [c.tag])
  }
}
