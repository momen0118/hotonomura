import type { DayDef, GameEvent, GameState, Item, Line, Place, Slot, Stall } from './types'
import { isLost } from './tags'
import { testCondition } from './state'
import { hashString, mulberry32 } from './rng'

import itemsJson from '../data/items.json'
import placesJson from '../data/places.json'
import daysJson from '../data/days.json'
import namesJson from '../data/names.json'
import stallsJson from '../data/stalls.json'

// イベントは日ごとのファイルに分けてある。増やすときはファイルを足すだけでよい。
const eventModules = import.meta.glob<{ default: GameEvent[] }>('../data/events/*.json', {
  eager: true,
})

export const ITEMS = itemsJson as Item[]
export const PLACES = placesJson as Place[]
export const DAYS = daysJson as DayDef[]
export const STALLS = stallsJson as Stall[]
export const EVENTS: GameEvent[] = Object.keys(eventModules)
  .sort()
  .flatMap((k) => eventModules[k].default)

export function getItem(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id)
}

export function getPlace(id: string): Place | undefined {
  return PLACES.find((p) => p.id === id)
}

export function getEvent(id: string): GameEvent {
  const ev = EVENTS.find((e) => e.id === id)
  if (!ev) throw new Error(`イベントが見つかりません: ${id}`)
  return ev
}

export function getDay(day: number): DayDef | undefined {
  return DAYS.find((d) => d.day === day)
}

export function initialPlaces(): string[] {
  return PLACES.filter((p) => p.initial).map((p) => p.id)
}

/** その日そのコマで選べる場所。捧げられて消えた場所はそもそも並ばない。 */
export function availablePlaces(state: GameState, day: number, slot: Slot): string[] {
  const def = getDay(day)?.slots?.[slot]
  const ids = def?.places ?? state.places
  return ids
    .filter((id) => state.places.includes(id))
    .filter((id) => {
      const p = getPlace(id)
      return p ? !isLost(state, p.tags) : false
    })
}

export function lockedPlace(day: number, slot: Slot): string | null {
  return getDay(day)?.slots?.[slot]?.locked ?? null
}

/**
 * その日・そのコマ・その場所で起きることを決める。
 * 固定イベント優先。無ければその場所の日常イベントから、日付で決まる種を使って選ぶ。
 */
export function resolveEvent(state: GameState, day: number, slot: Slot, place: string): GameEvent | null {
  const usable = (e: GameEvent) =>
    !isLost(state, e.tags) &&
    testCondition(state, e.if) &&
    !(e.once && state.seenEvents.includes(e.id))

  const fixed = EVENTS.filter(
    (e) => e.kind === 'fixed' && e.place === place && e.day === day && (!e.slot || e.slot === slot),
  ).filter(usable)
  if (fixed.length > 0) return fixed[0]

  // トリガー型(日付を持たない固定イベント)。初回来店など、いつ来ても一度だけ起きる。
  const trigger = EVENTS.filter(
    (e) => e.kind === 'fixed' && e.place === place && e.day === undefined,
  ).filter(usable)
  if (trigger.length > 0) return trigger[0]

  // 日常イベントは同じ弾を続けて出さない(同日重複禁止・2日クールダウン)
  const fresh = EVENTS.filter((e) => e.kind === 'ambient' && e.place === place)
    .filter(usable)
    .filter((e) => {
      const last = state.ambientLog[e.id]
      return last === undefined || day - last >= 2
    })
  // 弾切れのときはクールダウンを無視する(何も起きないよりまし)
  const ambient =
    fresh.length > 0
      ? fresh
      : EVENTS.filter((e) => e.kind === 'ambient' && e.place === place).filter(usable)
  if (ambient.length === 0) return null

  const rnd = mulberry32(hashString(`${state.seed}:${state.loop}:${day}:${slot}:${place}`))
  return ambient[Math.floor(rnd() * ambient.length)]
}

/** そのコマの本編の手前に差し込む断片。条件を満たすものがあれば返す。 */
export function resolvePrelude(state: GameState, place: string): GameEvent | null {
  const found = EVENTS.filter(
    (e) =>
      e.kind === 'prelude' &&
      e.place === place &&
      !isLost(state, e.tags) &&
      testCondition(state, e.if) &&
      !(e.once && state.seenEvents.includes(e.id)),
  )
  return found[0] ?? null
}

/** その日のどこかに固定イベントが残っているか(縦切りの終端判定に使う) */
export function hasContentForDay(day: number): boolean {
  return getDay(day) !== undefined
}

/**
 * 行の可視判定。
 * 捧げられたタグを持つ行は、世界から消える=最初から無かったものとして飛ばす。
 */
export function visibleLine(state: GameState, line: Line): boolean {
  if (isLost(state, line.tags)) return false
  return testCondition(state, line.if)
}

const NAMES = namesJson as unknown as Record<string, string>

/**
 * {{name}} を主人公の名前に、{{grandpa}} 等を names.json の差し込み表に置き換える。
 * 固有名が未決のものは [祖父の名] のまま画面に出る(未決であることを隠さない)。
 */
export function fill(state: GameState, text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    if (key === 'name') return state.playerName
    return NAMES[key] ?? whole
  })
}

/** 必ず持っていく品(スマホ)。選択枠を消費しない */
export function fixedItems(): string[] {
  return ITEMS.filter((i) => i.fixed).map((i) => i.id)
}
