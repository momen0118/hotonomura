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
import { hashString, mulberry32 } from './core/rng'
import { isLost } from './core/tags'
import type { GameState } from './core/types'
import { titleScreen } from './screens/title'
import { nameScreen, packingScreen } from './screens/packing'
import { dayInterstitial, placeSelect } from './screens/day'
import { playScene } from './screens/scene'
import { writeNightPage } from './screens/diary'
import { festivalDay } from './screens/festival'
import { endingFlow } from './screens/ending'
import { shrineScreen } from './screens/offer'
import { devButton } from './screens/dev'

// ナツが「今日いるか」を毎日抽選する(FABLE_ANSWERS_9 Q5)。
// 基礎確率70%。ただしナツ必須の固定イベント日は強制で在。
// 種は seed+loop+day から作るので、セーブ・再読み込みしても同じ日は同じ結果になる。
const FORCED_NATSU_DAYS = new Set([2, 3, 4, 5, 6, 7, 11, 12, 13])
function decideNatsuToday(state: GameState): boolean {
  if (FORCED_NATSU_DAYS.has(state.day)) return true
  const rnd = mulberry32(hashString(`${state.seed}:${state.loop}:${state.day}:natsu`))
  return rnd() < 0.7
}

async function main(): Promise<void> {
  const choice = await titleScreen()

  let state: GameState | null = choice === 'continue' ? load() : null
  if (!state) {
    const name = await nameScreen()
    state = newGame(name, fixedItems())
    state.places = initialPlaces()
    await runOP(state)
    await fadeThrough(() => clearScreens())
  }

  // つづきから始めたときは背景がまだ無いので、とりあえず家にしておく。
  if (!currentBg()) await setBg('house')

  mountDev(state)
  for (;;) {
    await gameLoop(state)
    // Day 14(帰る日)と帰還分岐。EDに達したか、白んで次の周(お代わり)か。
    const outcome = await endingFlow(state)
    if (outcome === 'rewind') {
      // 巻き戻し(お代わり)。白む→出発の朝(OP)に戻る(FABLE_ANSWERS_7 §2)。
      // 持ち物選択を毎周やり直す=供物計画の中核。日記帳の受け渡しも毎周同一。
      await runOP(state)
      await fadeThrough(() => clearScreens())
      continue
    }
    // EDに到達。セーブを消してタイトルへ戻す(ED達成の記録は別領域なので保持される)。
    clearSave()
    location.reload()
    return
  }
}

/**
 * OP(出発の朝)。母の声 → 机の上から持ち物を選ぶ → 母が日記帳を入れる。
 * 一周目も、巻き戻し後も同じここを通る。周回ごとに持ち物を組み替えられる。
 */
async function runOP(state: GameState): Promise<void> {
  clearScreens()
  await playScene(state, getEvent('op_morning'), { hud: false })

  const chosen = await packingScreen()
  // 巻き戻し後は前周の持ち物が残っているので、固定品まで戻してから選び直す。
  state.inventory = [...fixedItems()]
  setLoadout(
    state,
    chosen,
    ITEMS.filter((i) => !i.acquirable).map((i) => i.id),
  )

  clearScreens()
  await playScene(state, getEvent('op_diary'), { hud: false })
  save(state)
}

function mountDev(state: GameState): void {
  document.querySelector('.dev')?.remove()
  app.appendChild(devButton(state, () => save(state)))
}

async function gameLoop(state: GameState): Promise<void> {
  while (getDay(state.day)) {
    const dayDef = getDay(state.day)!
    const introKey = `intro:${state.loop}:${state.day}`
    if (state.slot === 'morning' && !state.flags[introKey]) {
      clearScreens()
      // 先に「◯日目」を出してから背景を切り替える(でないと次シーンの背景が一瞬映る・§7.4)。
      await dayInterstitial(state)
      const first = lockedPlace(state.day, 'morning')
      void setBg(first ? (getPlace(first)?.bg ?? 'house') : 'house')
      state.flags[introKey] = true
      // その日ナツがいるか。日記・イベントから `natsu_today` / `!natsu_today` で参照できる。
      state.flags.natsu_today = decideNatsuToday(state)
      save(state)
    }

    // 前夜に祠で捧げ/焼きをしていたら、コマ選択の前に「朝、たしかめに行った」を強制再生する
    // (FABLE_ANSWERS_16 §1)。コマは消費しない。祠の窪みを見に行く場面なので背景は祠。
    if (state.slot === 'morning' && state.pendingMorning && state.pendingMorning.length > 0) {
      const lines = state.pendingMorning
      state.pendingMorning = []
      save(state)
      await playScene(
        state,
        { id: 'shrine_morning', kind: 'fixed', place: 'shrine', script: [{ bg: 'shrine' }, ...lines.map((n) => ({ n }))] },
        { hud: false },
      )
      // 確認のあと、その日の場所の背景へ戻す。
      const back = lockedPlace(state.day, 'morning')
      await setBg(back ? (getPlace(back)?.bg ?? 'house') : 'house')
    }

    // 祭りの日はコマ制を崩す。夕方開始の一本道+屋台の自由回遊。
    // ただし fun:matsuri が収穫/焼却された周は、祭りは二度と起きない(FABLE_ANSWERS_15 §2/§3)。
    // その周の Day 6 は「祭りのない、通常の自由日(3コマ)」+ 広場の解禁になる。
    if (dayDef.festival) {
      if (!isLost(state, ['fun:matsuri'])) {
        await festivalDay(state)
        await writeNightPage(state)
        state.day += 1
        state.slot = 'morning'
        save(state)
        if (getDay(state.day)) await fadeThrough(() => clearScreens())
        continue
      }
      // 祭り消滅周。祭りがあったはずの広場を、通常の場所として解禁する。
      if (!state.places.includes('matsuri')) {
        state.places.push('matsuri')
        save(state)
      }
    }

    // himawari を失った周は、Day 5昼の「ナツが連れていく」初訪問が起きない(FABLE_ANSWERS_16 §3)。
    // その周のDay 5昼は自由コマにし、ひまわり畑を先に解禁して選べるようにする(祠動線を残す)。
    if (state.day === 5 && isLost(state, ['fun:himawari']) && !state.places.includes('himawari')) {
      state.places.push('himawari')
      save(state)
    }

    let locked = lockedPlace(state.day, state.slot)
    // 祭り消滅周の Day 6・昼は、集会所(§15a)を通算1回だけ必ず通す。
    // ナツに連れていかれる一拍なので、初回だけ広場へロックする(以後は自由コマ)。
    if (dayDef.festival && state.slot === 'noon' && !state.flags.ever_shukaijo) {
      locked = 'matsuri'
    }
    // himawari 消滅周の Day 5昼はロックを外す(自由コマ)。
    if (state.day === 5 && state.slot === 'noon' && isLost(state, ['fun:himawari'])) {
      locked = null
    }
    // ロック先のイベントが世界同期で消えた周(例: タロ収穫後のDay 9〜10)は、
    // そのコマを自由コマに開放する(FABLE_ANSWERS_10 §6)。
    if (locked && !resolveEvent(state, state.day, state.slot, locked) && !resolvePrelude(state, locked)) {
      locked = null
    }
    const place = locked ?? (await placeSelect(state, state.slot))
    // 川原を訪れた周は、川原の石ころを常に所持扱い(FABLE_ANSWERS_15 §4)。祠のリュック欄に並ぶ。
    if (place === 'river' && !state.flags.has_ishikoro) {
      state.flags.has_ishikoro = true
      save(state)
    }
    clearScreens()

    // 祠は場所として選べる(2周目で発見後)。ここへ行くと「なにを、おいていきますか」が開く。
    // 確認用パネルの「祠をひらく」を正規の導線に置き換えたもの(FABLE_ANSWERS_9 §4)。
    if (place === 'shrine') {
      await setBg(getPlace('shrine')?.bg ?? 'himawari')
      await shrineScreen(state)
      await finishSlot(state)
      continue
    }

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

    await finishSlot(state)
  }
  // Day 1〜13 を終えた。Day 14(帰る日)と帰還分岐は endingFlow が引き取る。
}

/** そのコマを終える。夕方なら夜の日記を書いて翌日へ。祠と通常コマで共用する。 */
async function finishSlot(state: GameState): Promise<void> {
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
