import './style.css'

import { app, clearScreens, el, fadeThrough } from './ui/dom'
import { currentBg, setBg } from './ui/stage'
import { ITEMS, getDay, getPlace, initialPlaces, lockedPlace, resolveEvent } from './core/content'
import { SLOT_ORDER, load, newGame, save } from './core/state'
import type { GameState } from './core/types'
import { titleScreen } from './screens/title'
import { nameScreen, packingScreen } from './screens/packing'
import { dayInterstitial, placeSelect } from './screens/day'
import { playScene } from './screens/scene'
import { openDiary, writeNightPage } from './screens/diary'
import { devButton } from './screens/dev'

async function main(): Promise<void> {
  const choice = await titleScreen()

  let state: GameState | null = choice === 'continue' ? load() : null
  if (!state) {
    const name = await nameScreen()
    const inventory = await packingScreen()
    state = newGame(name, inventory, ITEMS.map((i) => i.id))
    state.places = initialPlaces()
    save(state)
    await fadeThrough(async () => {
      clearScreens()
      await setBg('bus')
    })
  }

  // つづきから始めたときは背景がまだ無いので、とりあえず家にしておく。
  if (!currentBg()) await setBg('house')

  mountDev(state)
  await gameLoop(state)
}

function mountDev(state: GameState): void {
  document.querySelector('.dev')?.remove()
  app.appendChild(devButton(state, () => save(state)))
}

async function gameLoop(state: GameState): Promise<void> {
  while (getDay(state.day)) {
    const introKey = `intro:${state.loop}:${state.day}`
    if (state.slot === 'morning' && !state.flags[introKey]) {
      clearScreens()
      // 朝は家で目が覚める。その日の朝が特定の場所に固定されている日は、そちらを先に出す。
      const first = lockedPlace(state.day, 'morning')
      void setBg(first ? (getPlace(first)?.bg ?? 'house') : 'house')
      await dayInterstitial(state)
      state.flags[introKey] = true
      save(state)
    }

    const locked = lockedPlace(state.day, state.slot)
    const place = locked ?? (await placeSelect(state, state.slot))
    clearScreens()

    const event = resolveEvent(state, state.day, state.slot, place)
    if (event) {
      await playScene(state, event)
      if (event.once && !state.seenEvents.includes(event.id)) state.seenEvents.push(event.id)
    } else {
      // データがまだ無いコマ。縦切り中は起こりうるので、黙って一コマ進める。
      await emptySlot()
    }

    const i = SLOT_ORDER.indexOf(state.slot)
    if (i < SLOT_ORDER.length - 1) {
      state.slot = SLOT_ORDER[i + 1]
      save(state)
    } else {
      clearScreens()
      await setBg('engawa_night')
      await writeNightPage(state)
      state.day += 1
      state.slot = 'morning'
      save(state)
      if (getDay(state.day)) await fadeThrough(() => clearScreens())
    }
  }

  await sliceEnd(state)
}

function emptySlot(): Promise<void> {
  return new Promise((resolve) => {
    const node = el(`
      <div class="screen pad">
        <div class="spacer"></div>
        <div class="panel">
          <p class="head">この場所のイベントはまだ入っていません</p>
          <p class="hint">縦切り中の表示です。次のコマへ進みます。</p>
        </div>
        <div style="height:14px"></div>
        <button class="btn btn-primary" data-act="next">つぎへ</button>
        <div class="spacer"></div>
      </div>
    `)
    node.querySelector('[data-act="next"]')!.addEventListener('click', () => {
      node.remove()
      resolve()
    })
    app.appendChild(node)
  })
}

async function sliceEnd(state: GameState): Promise<void> {
  clearScreens()
  await setBg('title')
  const node = el(`
    <div class="screen pad">
      <div class="spacer"></div>
      <div class="panel">
        <p class="head">ここまでが縦切りです</p>
        <p class="hint">
          三日目まで。この先(4日目〜14日目、巻き戻し、祠、日記の引き継ぎ)はこれから作ります。<br><br>
          台詞に「仮」の印が付いているところは、Fable の確定稿待ちです。
        </p>
      </div>
      <div style="height:14px"></div>
      <div class="stack">
        <button class="btn btn-primary" data-act="diary">日記を最初から読む</button>
        <button class="btn" data-act="title">タイトルへ</button>
      </div>
      <div class="spacer"></div>
    </div>
  `)
  node.querySelector('[data-act="diary"]')!.addEventListener('click', () => void openDiary(state))
  node.querySelector('[data-act="title"]')!.addEventListener('click', () => location.reload())
  app.appendChild(node)
}

void main()
