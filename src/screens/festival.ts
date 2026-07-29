import { app, clearScreens, el, esc } from '../ui/dom'
import { STALLS, getEvent } from '../core/content'
import { save } from '../core/state'
import { playScene } from './scene'
import type { GameState, Stall } from '../core/types'

/**
 * Day 6・夏祭り。コマ制を崩したイベント回(FABLE_ANSWERS_4 §4)。
 * 屋台は全部で3,500円ぶん、所持金は3,000円。**全部は回れない。**
 * 回らなかった屋台は日記に載らない=思い出にならない=台帳に載らない。
 * リュックの枠と同型の賭場だが、UIでは一切説明しない。
 */
export async function festivalDay(state: GameState): Promise<void> {
  clearScreens()
  await playScene(state, getEvent('d06_start'), { here: 'じいちゃんの家' })
  save(state)

  clearScreens()
  await playScene(state, getEvent('d06_arrive'), { here: '広場', time: '夜' })
  save(state)

  let shrineSeen = false
  while (true) {
    const remaining = STALLS.filter((s) => !state.stallsVisited.includes(s.id))
    const affordable = remaining.filter((s) => s.price <= state.money)

    // 回遊の途中で必ず一度、集会所の前を通る
    if (!shrineSeen && state.stallsVisited.length >= 2) {
      shrineSeen = true
      clearScreens()
      await playScene(state, getEvent('d06_shrine'), { here: '集会所' })
      save(state)
      continue
    }

    if (affordable.length === 0) break
    const picked = await stallSelect(state, remaining)
    if (!picked) {
      // 一軒も回らずに帰ろうとすると、ナツに連れ戻される(FABLE_ANSWERS_7 §3)。
      if (state.stallsVisited.length === 0) {
        clearScreens()
        await playScene(state, getEvent('d06_leave_guard'), { here: '広場', time: '夜' })
        save(state)
        continue
      }
      break
    }

    state.money -= picked.price
    state.stallsVisited.push(picked.id)
    clearScreens()
    await playScene(state, getEvent(picked.event), { here: '広場', time: '夜' })
    save(state)
  }

  if (!shrineSeen) {
    clearScreens()
    await playScene(state, getEvent('d06_shrine'), { here: '集会所' })
  }

  clearScreens()
  await playScene(state, getEvent('d06_return'), { here: '帰り道' })
  save(state)
}

/** 屋台えらび。買えないものは並ぶが押せない(いくら足りないかは言わない)。 */
function stallSelect(state: GameState, remaining: Stall[]): Promise<Stall | null> {
  clearScreens()
  return new Promise((resolve) => {
    const node = el(`
      <div class="screen pad">
        <div class="hud" style="position:static;margin-bottom:12px;padding-right:70px">
          <div class="slotbar"><span>6日目 夜</span></div>
          <div class="here">広場</div>
          <div class="wallet">${state.money}円</div>
        </div>
        <p class="head" style="margin-bottom:10px">どこに寄る？</p>
        <div class="stack scrolls"></div>
        <button class="btn" data-act="leave" style="margin-top:10px">もう帰る</button>
      </div>
    `)

    const stack = node.querySelector('.stack') as HTMLElement
    for (const stall of remaining) {
      const tooExpensive = stall.price > state.money
      const b = el(`
        <button class="btn" ${tooExpensive ? 'disabled' : ''}>
          ${esc(stall.name)}
          <span class="sub">${stall.price}円</span>
        </button>
      `)
      if (!tooExpensive) b.addEventListener('click', () => resolve(stall))
      stack.appendChild(b)
    }

    node.querySelector('[data-act="leave"]')!.addEventListener('click', () => resolve(null))
    app.appendChild(node)
  })
}
