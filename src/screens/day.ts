import { app, clearScreens, el, esc, wait } from '../ui/dom'
import { availablePlaces, getDay, getPlace } from '../core/content'
import { SLOT_LABEL, SLOT_ORDER } from '../core/state'
import type { GameState, Slot } from '../core/types'
import { openDiary } from './diary'

const KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四']

export async function dayInterstitial(state: GameState): Promise<void> {
  const day = getDay(state.day)
  const node = el(`
    <div class="interstitial">
      <div class="d">${KANJI[state.day] ?? state.day}日目</div>
      <div class="s">${esc(day?.date ?? '')}</div>
    </div>
  `)
  app.appendChild(node)
  await wait(1600)
  node.style.transition = 'opacity 600ms ease'
  node.style.opacity = '0'
  await wait(620)
  node.remove()
}

/** 3コマ制の場所選び。行ける場所が一つしかない日は呼ばれない。 */
export function placeSelect(state: GameState, slot: Slot): Promise<string> {
  clearScreens()
  // 背景は今いる場所のまま。立ち止まって考えている、という画にする。
  const ids = availablePlaces(state, state.day, slot)

  return new Promise((resolve) => {
    const dots = SLOT_ORDER.map(
      (s) => `<span class="dot ${SLOT_ORDER.indexOf(s) <= SLOT_ORDER.indexOf(slot) ? 'on' : ''}"></span>`,
    ).join('')

    const node = el(`
      <div class="screen pad">
        <div class="slotbar" style="position:static;align-self:flex-start;margin-bottom:14px">
          <span>${state.day}日目 ${SLOT_LABEL[slot]}</span>${dots}
        </div>
        <p class="head">どこへ行く?</p>
        <div class="stack"></div>
        <div class="spacer"></div>
        <button class="btn" data-act="diary">日記を読む</button>
      </div>
    `)

    const stack = node.querySelector('.stack') as HTMLElement
    for (const id of ids) {
      const p = getPlace(id)
      if (!p) continue
      const b = el(`
        <button class="btn" data-place="${esc(id)}">
          ${esc(p.label)}
          ${p.hint ? `<span class="sub">${esc(p.hint)}</span>` : ''}
        </button>
      `)
      b.addEventListener('click', () => resolve(id))
      stack.appendChild(b)
    }

    node.querySelector('[data-act="diary"]')!.addEventListener('click', async () => {
      await openDiary(state)
    })

    app.appendChild(node)
  })
}
