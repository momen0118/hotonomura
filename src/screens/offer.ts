import { app, clearScreens, el, esc } from '../ui/dom'
import { getItem } from '../core/content'
import { sacrifice } from '../core/tags'
import type { GameState } from '../core/types'
import { renderPage } from './diary'

/**
 * 祠(FABLE_ANSWERS_6 §4)。日記帳がそのまま開く。見出しは「なにを、おいていきますか」。
 *
 * ・村の思い出のページを破る(長押し)= 焼く。綴じの反対側も抜け、破り縁は焦げる。
 *   これは村への好き総量を減らすが、出口は開かない(自分の畑の作物で家賃は払えない)。
 * ・「ささげない」→ 帰る / リュックをあける。持ち込んだ実物を差し出すと出口が開く。
 *   「リュックをあける」は商店の奥の棚を見たあと(3周目〜)だけ出る。
 *
 * 演出テキストは未納品なので、システムメッセージ程度の仮文言で骨組みだけ通す。
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

  // 「リュックをあける」は商店の奥の棚を見たあと(3周目〜)だけ出る
  if (state.flags.shelf_seen === true) {
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

  const items = state.inventory.filter((id) => !state.sacrificed.includes(`item:${id}`))
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
    longPress(btn, () => {
      sacrifice(state, [`item:${id}`])
      state.exitOpen = true
      done()
    })
    body.appendChild(btn)
  }

  const back = el('<button class="btn" data-act="back">やめる</button>')
  back.addEventListener('click', () => showExit(state, root, done))
  body.appendChild(back)
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
