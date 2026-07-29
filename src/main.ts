import './style.css'

import { app, clearScreens, el, fadeThrough } from './ui/dom'
import { currentBg, setBg } from './ui/stage'
import {
  ITEMS,
  fixedItems,
  getDay,
  getEvent,
  getPlace,
  initialPlaces,
  lockedPlace,
  resolveEvent,
  resolvePrelude,
} from './core/content'
import { SLOT_ORDER, clearSave, load, newGame, save, setLoadout } from './core/state'
import type { GameState } from './core/types'
import { titleScreen } from './screens/title'
import { nameScreen, packingScreen } from './screens/packing'
import { dayInterstitial, placeSelect } from './screens/day'
import { playScene } from './screens/scene'
import { openDiary, writeNightPage } from './screens/diary'
import { festivalDay } from './screens/festival'
import { homecoming } from './screens/homecoming'
import { devButton } from './screens/dev'

async function main(): Promise<void> {
  const choice = await titleScreen()

  let state: GameState | null = choice === 'continue' ? load() : null
  if (!state) {
    // OP: 出発の朝。母の声 → 机の上から選ぶ → 母が日記帳を入れる。
    const name = await nameScreen()
    state = newGame(name, fixedItems())
    state.places = initialPlaces()

    clearScreens()
    await playScene(state, getEvent('op_morning'), { hud: false })

    const chosen = await packingScreen()
    setLoadout(
      state,
      chosen,
      ITEMS.filter((i) => !i.acquirable).map((i) => i.id),
    )

    clearScreens()
    await playScene(state, getEvent('op_diary'), { hud: false })
    save(state)

    await fadeThrough(() => clearScreens())
  }

  // つづきから始めたときは背景がまだ無いので、とりあえず家にしておく。
  if (!currentBg()) await setBg('house')

  mountDev(state)
  // 巻き戻したら、そのまま次の周を始める
  for (;;) {
    const outcome = await gameLoop(state)
    if (outcome !== 'rewind') break
  }
}

function mountDev(state: GameState): void {
  document.querySelector('.dev')?.remove()
  app.appendChild(devButton(state, () => save(state)))
}

async function gameLoop(state: GameState): Promise<'rewind' | 'end'> {
  while (getDay(state.day)) {
    const dayDef = getDay(state.day)!
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

    // 祭りの日はコマ制を崩す。夕方開始の一本道+屋台の自由回遊。
    if (dayDef.festival) {
      await festivalDay(state)
      await writeNightPage(state)
      state.day += 1
      state.slot = 'morning'
      save(state)
      if (getDay(state.day)) await fadeThrough(() => clearScreens())
      continue
    }

    const locked = lockedPlace(state.day, state.slot)
    const place = locked ?? (await placeSelect(state, state.slot))
    clearScreens()
    const placeName = getPlace(place)?.name ?? ''
    // イベント自身が here を切り替えるなら、初期表示は空にする(移動中に行き先がバレないように)
    const initialHere = (ev: { script: { here?: string }[] } | null) =>
      ev && ev.script.some((l) => l.here) ? '' : placeName

    // コマの本編の手前に差し込む断片(体の記憶の空振りなど)
    const prelude = resolvePrelude(state, place)
    if (prelude) {
      await playScene(state, prelude, { here: initialHere(prelude) })
      if (!state.seenEvents.includes(prelude.id)) state.seenEvents.push(prelude.id)
    }

    const event = resolveEvent(state, state.day, state.slot, place)
    if (event) {
      await playScene(state, event, { here: initialHere(event) })
      if (event.kind === 'ambient') state.ambientLog[event.id] = state.day
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
      await writeNightPage(state)
      state.day += 1
      state.slot = 'morning'
      save(state)
      if (getDay(state.day)) await fadeThrough(() => clearScreens())
    }
  }

  return await sliceEnd(state)
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

function sliceEnd(state: GameState): Promise<'rewind' | 'end'> {
  clearScreens()
  void setBg('title')
  return new Promise((resolve) => {
  const node = el(`
    <div class="screen pad">
      <div class="spacer"></div>
      <div class="panel">
        <p class="head">ここまでが遊べるぶんです</p>
        <p class="hint">
          七日目まで。八日目〜十三日目はこれから作ります。<br><br>
          台詞に「仮」の印が付いているところは、Fable の確定稿待ちです。
        </p>
      </div>
      <div style="height:14px"></div>
      <div class="stack">
        <button class="btn btn-primary" data-act="diary">日記を最初から読む</button>
        <button class="btn" data-act="rewind">
          帰る日と巻き戻しを見る
          <span class="sub">確認用。八日目〜十四日目は仮のダイジェストで飛ばします。</span>
        </button>
        <button class="btn" data-act="title">タイトルへ</button>
      </div>
      <div class="spacer"></div>
    </div>
  `)
    node.querySelector('[data-act="diary"]')!.addEventListener('click', () => void openDiary(state))
    node.querySelector('[data-act="rewind"]')!.addEventListener('click', async () => {
      node.remove()
      await homecoming(state)
      resolve('rewind')
    })
    node.querySelector('[data-act="title"]')!.addEventListener('click', () => location.reload())
    app.appendChild(node)
  })
}

/**
 * 止まったときに黙って固まらないようにする。
 * アサが「ここで進めなくなった」を報告できるよう、文面を画面に出す。
 */
function showFatal(message: string): void {
  if (document.querySelector('.fatal')) return
  const node = el(`
    <div class="fatal">
      <div class="panel" style="max-width:420px;width:100%">
        <p class="head">エラーが出て止まりました</p>
        <p class="hint">この文面を見せてもらえれば直せます。</p>
        <pre class="fatal-msg"></pre>
        <button class="btn btn-primary" data-act="reset">セーブを消して最初から</button>
      </div>
    </div>
  `)
  ;(node.querySelector('.fatal-msg') as HTMLElement).textContent = message
  node.querySelector('[data-act="reset"]')!.addEventListener('click', () => {
    clearSave()
    location.reload()
  })
  app.appendChild(node)
}

window.addEventListener('error', (e) => showFatal(e.message))
window.addEventListener('unhandledrejection', (e) => showFatal(String(e.reason)))

main().catch((e: unknown) => showFatal(e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)))
