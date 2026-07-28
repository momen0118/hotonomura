import { app, clearScreens, el, esc } from '../ui/dom'
import { fill } from '../core/content'
import { sacrifice } from '../core/tags'
import type { DiaryEntryDef, GameState } from '../core/types'
import { renderPage } from './diary'

/**
 * 供物を選ぶ画面。日記帳がそのまま開く(台帳=メニュー表)。
 * 確定は長押し。処刑宣告系の演出で、システム操作を感情の共犯にする(SPEC §3)。
 *
 * depart = 帰りのバスの前。「なにを、おいていきますか」。最低一つ置かないと巻き戻れない(席料)
 * shrine = 祠。ページを破る。綴じの反対側のページも物理的に抜ける
 */
export type OfferMode = 'depart' | 'shrine'

const PRESS_MS = 900

interface Candidate {
  key: string
  label: string
  tags: string[]
  pageIndex: number
}

function candidates(state: GameState): Candidate[] {
  const out: Candidate[] = []
  state.diary.forEach((page, pageIndex) => {
    if (page.torn) return
    page.entries.forEach((e: DiaryEntryDef, i) => {
      if (!e.tags || e.tags.length === 0) return
      if (e.tags.some((t) => state.sacrificed.includes(t))) return
      out.push({
        key: `${pageIndex}:${i}`,
        label: fill(state, e.fact ?? ''),
        tags: e.tags,
        pageIndex,
      })
    })
  })
  return out
}

export function offerScreen(state: GameState, mode: OfferMode): Promise<boolean> {
  clearScreens()
  return new Promise((resolve) => {
    const rows = candidates(state)

    const heading = mode === 'depart' ? 'なにを、おいていきますか' : 'どのページを破りますか'
    const lead =
      mode === 'depart'
        ? '長押しで決まります。'
        : '破いたページの、綴じの反対側も抜けます。長押しで決まります。'

    const node = el(`
      <div class="diary-screen">
        <div class="offer-head">
          <p class="offer-title">${esc(heading)}</p>
          <p class="hint">${esc(lead)}</p>
        </div>
        <div class="offer-body"></div>
      </div>
    `)
    const body = node.querySelector('.offer-body') as HTMLElement

    if (mode === 'depart') {
      if (rows.length === 0) {
        body.appendChild(el('<p class="hint">置いていけるものが、もうない。</p>'))
        const b = el('<button class="btn btn-primary">とじる</button>')
        b.addEventListener('click', () => {
          node.remove()
          resolve(false)
        })
        body.appendChild(b)
      }
      for (const row of rows) {
        const btn = el(`
          <button class="btn offer-item">
            <span class="fill"></span>
            <span class="txt">${esc(row.label)}</span>
          </button>
        `)
        longPress(btn, () => {
          sacrifice(state, row.tags)
          node.remove()
          resolve(true)
        })
        body.appendChild(btn)
      }
    } else {
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
          tearPage(state, i)
          node.remove()
          resolve(true)
        })
        wrap.appendChild(btn)
        body.appendChild(wrap)
      })
      const cancel = el('<button class="btn">やめる</button>')
      cancel.addEventListener('click', () => {
        node.remove()
        resolve(false)
      })
      body.appendChild(cancel)
    }

    app.appendChild(node)
  })
}

/** 一枚破ると、綴じの反対側も抜ける。紙は一枚で二ページぶんだから。 */
function tearPage(state: GameState, index: number): void {
  const n = state.diary.length
  const opposite = n - 1 - index
  state.diary[index].torn = true
  if (opposite >= 0 && opposite < n) state.diary[opposite].torn = true
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
