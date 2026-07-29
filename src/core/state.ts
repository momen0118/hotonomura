import type { GameState, Slot } from './types'

const SAVE_KEY = 'hotonomura.save.v1'
// データの形が変わったらここを上げる。古いセーブは読まずに捨てる。
const STATE_VERSION = 3

export const SLOT_ORDER: Slot[] = ['morning', 'noon', 'evening']

export const SLOT_LABEL: Record<Slot, string> = {
  morning: '朝',
  noon: '昼',
  evening: '夕',
}

export function newGame(playerName: string, fixed: string[]): GameState {
  return {
    version: STATE_VERSION,
    playerName,
    loop: 1,
    day: 1,
    slot: 'morning',
    inventory: [...fixed],
    leftBehind: [],
    sacrificed: [],
    places: [],
    diary: [],
    flags: {},
    seenEvents: [],
    ambientLog: {},
    money: 0,
    stallsVisited: [],
    harvested: [],
    burned: [],
    exitOpen: false,
    todayEntries: [],
    todayPhoto: null,
    seed: Math.floor(Math.random() * 0x7fffffff),
    settings: { showDraftMarks: true, textSpeed: 22 },
  }
}

/**
 * リュック詰めの結果を反映する。選外の品は村に来ない=供物にできない(SPEC §4)。
 * 村で手に入る品(ぽやぽや等)は、選ばなかった品ではないので置いてきた扱いにしない。
 */
export function setLoadout(state: GameState, chosen: string[], packable: string[]): void {
  for (const id of chosen) if (!state.inventory.includes(id)) state.inventory.push(id)
  state.leftBehind = packable.filter((id) => !state.inventory.includes(id))
}

/**
 * 巻き戻し(お代わり)。Day 1 に戻すが、日記と捧げたものは持ち越す。
 * 持ち越さないもの: その周の進行フラグ、消化済みイベント、所持金。
 */
export function rewind(state: GameState, initialPlaces: string[]): void {
  state.loop += 1
  state.day = 1
  state.slot = 'morning'
  state.flags = {}
  state.seenEvents = []
  state.ambientLog = {}
  state.todayEntries = []
  state.todayPhoto = null
  state.money = 0
  state.stallsVisited = []
  state.places = [...initialPlaces]
}

export function save(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    // 容量オーバー等。セーブできなくても進行は止めない。
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (parsed.version !== STATE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function hasSave(): boolean {
  return load() !== null
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
}

/** フラグ条件の判定。"flag" / "!flag" / "day>=3" 程度だけ見る。 */
export function testCondition(state: GameState, cond: string | undefined): boolean {
  if (!cond) return true
  const expr = cond.trim()
  if (expr.startsWith('!')) return !truthy(state, expr.slice(1))
  return truthy(state, expr)
}

function truthy(state: GameState, key: string): boolean {
  if (key === 'true') return true
  if (key.startsWith('item:')) return state.inventory.includes(key.slice(5))
  // "lost:taro" = そのタグが捧げられている
  if (key.startsWith('lost:')) return state.sacrificed.includes(key.slice(5))
  // "day>=8" = 8日目以降
  const dayCmp = key.match(/^day>=(\d+)$/)
  if (dayCmp) return state.day >= Number(dayCmp[1])
  const v = state.flags[key]
  return v !== undefined && v !== false && v !== 0 && v !== ''
}

export function applySet(
  state: GameState,
  set: Record<string, string | number | boolean> | undefined,
): void {
  if (!set) return
  for (const [k, v] of Object.entries(set)) state.flags[k] = v
}
