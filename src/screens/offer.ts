import { app, clearScreens, el, esc } from '../ui/dom'
import { getItem } from '../core/content'
import { sacrifice } from '../core/tags'
import { save } from '../core/state'
import type { GameEvent, GameState, Item, Line } from '../core/types'
import { renderPage } from './diary'
import { playScene } from './scene'
import offerLinesJson from '../data/offer_lines.json'

// 捧げ独白(FABLE_ANSWERS_7 §4・確定稿)。
//   accept  = 受理。出口が開き、石の焦げがひとつ濃くなる(外の熟成品)。
//   reject  = 非受理。灰にもならず残る。出口は開かない(夏期講習テキスト・結晶キット)。
//   village = 村の水の実物。燃えるが出口は開かず、石も変わらない(ぽやぽや)。
const OFFER_LINES = offerLinesJson as unknown as Record<
  string,
  { kind: 'accept' | 'reject' | 'village'; lines: string[] }
>
const ACCEPT_MORNING = (offerLinesJson as { _accept_morning: string })._accept_morning

/**
 * 祠(FABLE_ANSWERS_6 §4)。日記帳がそのまま開く。見出しは「なにを、おいていきますか」。
 *
 * ・村の思い出のページを破る(長押し)= 焼く。綴じの反対側も抜け、破り縁は焦げる。
 *   これは村への好き総量を減らすが、出口は開かない(自分の畑の作物で家賃は払えない)。
 * ・「ささげない」→ 帰る / リュックをあける。持ち込んだ実物を差し出すと出口が開く。
 *   「リュックをあける」は棚+餌の台詞の二重フラグ(3周目〜)で出る。
 *
 * 実物の捧げ独白は FABLE_ANSWERS_7 §4 の確定稿(src/data/offer_lines.json)。
 * 祠そのものの演出テキスト(見出し以外)はまだ仮文言。
 */
const PRESS_MS = 900

export function shrineScreen(state: GameState): Promise<void> {
  clearScreens()
  return new Promise((resolve) => {
    const root = el('<div class="diary-screen shrine"></div>')
    app.appendChild(root)

    const done = () => {
      root.remove()
      resolve()
    }

    showBurnList(state, root, done)
  })
}

/** 村の思い出のページ一覧。焼くと綴じの反対側も抜ける。 */
function showBurnList(state: GameState, root: HTMLElement, done: () => void): void {
  root.innerHTML = ''
  const head = el(`
    <div class="offer-head">
      <p class="offer-title">なにを、おいていきますか</p>
      <p class="hint">ページを長押しで破ります。破いたページの、綴じの反対側も抜けます。</p>
    </div>
  `)
  root.appendChild(head)

  const body = el('<div class="offer-body"></div>')
  root.appendChild(body)

  // 最上段は必ず「ささげない」
  const none = el('<button class="btn btn-primary offer-none">ささげない</button>')
  none.addEventListener('click', () => showExit(state, root, done))
  body.appendChild(none)

  const pages = state.diary.filter((p) => !p.torn)
  if (pages.length === 0) {
    body.appendChild(el('<p class="hint" style="text-align:center">焼けるページが、もうない。</p>'))
  }

  state.diary.forEach((page, i) => {
    if (page.torn) return
    const wrap = el('<div class="offer-page"></div>')
    wrap.appendChild(renderPage(state, page))
    const btn = el(`
      <button class="btn offer-item">
        <span class="fill"></span>
        <span class="txt">このページを破る</span>
      </button>
    `)
    longPress(btn, () => {
      burnPage(state, i)
      showBurnList(state, root, done)
    })
    wrap.appendChild(btn)
    body.appendChild(wrap)
  })
}

/** 「ささげない」のあと。帰る、または(棚を見ていれば)リュックをあける。 */
function showExit(state: GameState, root: HTMLElement, done: () => void): void {
  root.innerHTML = ''
  root.appendChild(el('<div class="offer-head"><p class="offer-title">祠のまえ</p></div>'))

  const body = el('<div class="offer-body"></div>')
  root.appendChild(body)

  const leave = el('<button class="btn" data-act="leave">帰る</button>')
  leave.addEventListener('click', done)
  body.appendChild(leave)

  // 「リュックをあける」は二重フラグで解禁される(FABLE_ANSWERS_8 §1)。
  //   ① 商店の奥の棚(預かりもの)を見た   shelf_seen
  //   ② ツリさんの餌の台詞を聞いた         bait_heard(3周目・堤防で確定)
  // 実物を差し出せる状態になった時点で、プレイヤーは必ず餌の理屈を聞いている。
  if (state.flags.shelf_seen === true && state.flags.bait_heard === true) {
    const open = el('<button class="btn" data-act="bag">リュックをあける</button>')
    open.addEventListener('click', () => showBag(state, root, done))
    body.appendChild(open)
  }
}

/** リュックの実物一覧。差し出すと出口が開く(捧げて帰るEDへ)。 */
function showBag(state: GameState, root: HTMLElement, done: () => void): void {
  root.innerHTML = ''
  root.appendChild(
    el(`
    <div class="offer-head">
      <p class="offer-title">リュックのなか</p>
      <p class="hint">差し出したものは、次のバスで帰り道をひらきます。長押しで決まります。</p>
    </div>
  `),
  )
  const body = el('<div class="offer-body"></div>')
  root.appendChild(body)

  // スマホ本体は捧げ候補ではない(分割=トーク履歴/音楽ライブラリは未実装)。差し出せる実物から外す。
  const items = state.inventory.filter(
    (id) => id !== 'phone' && !state.sacrificed.includes(`item:${id}`),
  )
  if (items.length === 0) {
    body.appendChild(el('<p class="hint" style="text-align:center">差し出せる実物がない。</p>'))
  }
  for (const id of items) {
    const item = getItem(id)
    if (!item) continue
    const btn = el(`
      <button class="btn offer-item">
        <span class="fill"></span>
        <span class="txt">${esc(item.name)}</span>
      </button>
    `)
    longPress(btn, () => void offerItem(state, item, root, done))
    body.appendChild(btn)
  }

  const back = el('<button class="btn" data-act="back">やめる</button>')
  back.addEventListener('click', () => showExit(state, root, done))
  body.appendChild(back)
}

/**
 * 実物を一点、窪みに置く(FABLE_ANSWERS_7 §4)。品ごとの確定稿の独白を出し、
 * 受理/非受理/村の水で結末を分ける。受理で初めて出口が開く。
 */
async function offerItem(state: GameState, item: Item, root: HTMLElement, done: () => void): Promise<void> {
  const data = OFFER_LINES[item.id]
  const kind = data?.kind ?? 'accept'
  const lines: Line[] = (data?.lines ?? [`${item.name}を、窪みに置いた。`]).map((t) => ({ n: t }))

  if (kind === 'accept') {
    // 外の熟成品。受理され、出口が開き、石の焦げがひとつ濃くなる。
    sacrifice(state, item.tags ?? [`item:${item.id}`])
    state.exitOpen = true
    state.flags.stone_char = (Number(state.flags.stone_char) || 0) + 1
    lines.push({ n: ACCEPT_MORNING })
  } else if (kind === 'village') {
    // 村の水の実物(ぽやぽや)。燃えるが出口は開かず、石の焦げも変わらない。
    sacrifice(state, item.tags ?? [`item:${item.id}`])
  }
  // reject(夏期講習テキスト・結晶キット)は捧げない。実物は残り、出口も開かない。
  save(state)

  root.innerHTML = ''
  const ev: GameEvent = { id: 'shrine_offer', kind: 'fixed', place: 'shrine', script: lines }
  await playScene(state, ev, { hud: false })

  // 受理されたら祠を出る。されなければ、また別の実物を試せる(値切りの一手)。
  if (state.exitOpen) done()
  else showBag(state, root, done)
}

/** 一枚破ると、綴じの反対側も抜ける。紙は一枚で二ページぶんだから。 */
function burnPage(state: GameState, index: number): void {
  const n = state.diary.length
  for (const i of [index, n - 1 - index]) {
    if (i < 0 || i >= n) continue
    const page = state.diary[i]
    if (page.torn) continue
    page.torn = true
    // 焼いたページの思い出タグは、以後の収穫対象から外れる
    for (const e of page.entries) {
      for (const tag of e.tags ?? []) {
        if (!state.burned.includes(tag)) state.burned.push(tag)
      }
    }
  }
}

function longPress(btn: HTMLElement, onDone: () => void): void {
  let timer: number | null = null
  const start = (e: Event) => {
    e.preventDefault()
    btn.classList.add('pressing')
    timer = window.setTimeout(() => {
      btn.classList.remove('pressing')
      onDone()
    }, PRESS_MS)
  }
  const cancel = () => {
    btn.classList.remove('pressing')
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  btn.addEventListener('pointerdown', start)
  btn.addEventListener('pointerup', cancel)
  btn.addEventListener('pointerleave', cancel)
  btn.addEventListener('pointercancel', cancel)
}
