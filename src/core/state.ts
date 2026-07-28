import type { GameState, Slot } from './types'

const SAVE_KEY = 'hotonomura.save.v1'
const STATE_VERSION = 1

export const SLOT_ORDER: Slot[] = ['morning', 'noon', 'evening']

export const SLOT_LABEL: Record<Slot, string> = {
  morning: '朝',
  noon: '昼',
  evening: '夕',
}

export function newGame(playerName: string, inventory: string[], allItems: string[]): GameState {
  return {
    version: STATE_VERSION,
    playerName,
    loop: 1,
    day: 1,
    slot: 'morning',
    inventory: [...inventory],
    leftBehind: allItems.filter((id) => !inventory.includes(id)),
    sacrificed: [],
    places: [],
    diary: [],
    flags: {},
    seenEvents: [],
    todayEntries: [],
    todayPhoto: null,
    seed: Math.floor(Math.random() * 0x7fffffff),
    settings: { showDraftMarks: true, textSpeed: 22 },
  }
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
