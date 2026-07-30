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

/** 各周の徴収ノルマ = これ × 周回数(13 §1)。 */
export const TAX_PER_LOOP = WEIGHTS['_tax_per_loop'] ?? 5

/** タグ列の合計weight(祠で焼いた分の納税計算に使う)。weightのないタグは0。 */
export function weightOfTags(tags: string[]): number {
  return tags.reduce((sum, t) => sum + (WEIGHTS[t] ?? 0), 0)
}

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

function take(state: GameState, c: Candidate): void {
  if (!state.harvested.includes(c.tag)) state.harvested.push(c.tag)
  sacrifice(state, [c.tag])
}

/**
 * 帰りのバスで走る収穫(12b §1 + 13 §1 納税制)。無音で黒塗りにする。
 *  - 1周目: 必ず「夏祭り」(焼きが発生しないので矛盾しない)。
 *  - 2周目以降: 徴収ノルマ = TAX_PER_LOOP × 周回数。その周に祠で焼いたweightを充当し、
 *    不足分だけを最上位weight帯からランダムに、ノルマ以上になるまで取る(超過繰り越しなし)。
 * 発覚は二周目以降、日記を開いた瞬間だけ(ここでは何も表示しない)。
 */
export function harvest(state: GameState): void {
  const cands = harvestCandidates(state)
  if (cands.length === 0) return

  if (state.loop === 1) {
    const matsuri = cands.filter((c) => c.tag === 'fun:matsuri')
    for (const c of matsuri.length > 0 ? matsuri : cands.slice(0, 1)) take(state, c)
    return
  }

  const target = TAX_PER_LOOP * state.loop
  const paid = Number(state.flags.loop_burned_weight) || 0
  const remaining = target - paid
  if (remaining <= 0) return // 焼きでノルマ達成

  // 最上位weight帯から順に、同weight内はシャッフル。ノルマ(の不足分)以上になるまで取る。
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
  let collected = 0
  for (const c of ordered) {
    if (collected >= remaining) break
    take(state, c)
    collected += c.weight
  }
}
