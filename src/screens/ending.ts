import { app, clearScreens, el, fadeThrough } from '../ui/dom'
import { setBg } from '../ui/stage'
import { getEvent, initialPlaces } from '../core/content'
import { recordEnding, rewind, save } from '../core/state'
import { EMPTY_ED_THRESHOLD, harvest, villageWeightRemaining } from '../core/harvest'
import { playScene } from './scene'
import type { GameState } from '../core/types'

// 受理された実物ごとの「一景」(FABLE_ANSWERS_16 §4 / 16a §3)。offered_item で選ぶ。
const SCENE_BY_ITEM: Record<string, string> = {
  watch: 'ed_scene_watch',
  game: 'ed_scene_game',
  book: 'ed_scene_book',
  acryl: 'ed_scene_acryl',
  walkie: 'ed_scene_walkie',
  band: 'ed_scene_band',
  phone_talk: 'ed_scene_phone_talk',
  phone_music: 'ed_scene_phone_music',
}

/**
 * Day 14(帰る日)と帰還分岐(FABLE_ANSWERS_16 §6)。
 *  - 実物受理済み(exitOpen)      → 捧げて帰るED(鳥居をくぐっても白まない)。
 *  - 残weight ≤ 閾値(実物未受理)  → 空っぽED。
 *  - どちらも不成立               → 白む(巻き戻し・お代わり)。
 * 優先順は「実物受理 > 空っぽ」。EDに達したら達成を記録してタイトルへ。
 */
export async function endingFlow(state: GameState): Promise<'rewind' | 'ended'> {
  state.day = 14
  state.slot = 'morning'
  save(state)

  const kind: 'offer' | 'empty' | 'rewind' = state.exitOpen
    ? 'offer'
    : villageWeightRemaining(state) <= EMPTY_ED_THRESHOLD
      ? 'empty'
      : 'rewind'

  // 荷造り(全分岐共通)
  clearScreens()
  await playScene(state, getEvent('d14_pack'), { here: 'じいちゃんの家' })
  save(state)

  if (kind === 'rewind') {
    clearScreens()
    await playScene(state, getEvent('d14_busstop'), { here: 'バス停' })
    clearScreens()
    await playScene(state, getEvent('d14_bus_rewind'), { here: 'バスの中' })
    // 白む前に無音で収穫→巻き戻し(現行の homecoming と同じ手順)。
    await fadeThrough(
      async () => {
        harvest(state)
        rewind(state, initialPlaces())
        save(state)
        clearScreens()
        await setBg('room')
      },
      { white: true, ms: 1200 },
    )
    return 'rewind'
  }

  if (kind === 'empty') {
    clearScreens()
    await playScene(state, getEvent('ed_empty_busstop'), { here: 'バス停' })
    clearScreens()
    await playScene(state, getEvent('ed_empty_bus'), { here: 'バスの中' })
    clearScreens()
    await playScene(state, getEvent('ed_empty_epilogue'), { hud: false })
    clearScreens()
    await playScene(state, getEvent('ed_empty_next'), { hud: false })
    recordEnding('empty')
    await endCard()
    return 'ended'
  }

  // 捧げて帰るED
  clearScreens()
  await playScene(state, getEvent('d14_busstop'), { here: 'バス停' })
  clearScreens()
  await playScene(state, getEvent('ed_offer_bus'), { here: 'バスの中' })
  // 黒は全周で確実にあるが、破れ(焼き)があった周だけ文面を足す(16a §2)。
  state.flags.torn_any = state.diary.some((p) => p.torn)
  save(state)
  clearScreens()
  await playScene(state, getEvent('ed_offer_epilogue'), { hud: false })
  const sceneId = SCENE_BY_ITEM[String(state.flags.offered_item ?? '')]
  if (sceneId) {
    clearScreens()
    await playScene(state, getEvent(sceneId), { hud: false })
  }
  clearScreens()
  await playScene(state, getEvent('ed_offer_close'), { hud: false })
  recordEnding('offer')
  await endCard()
  return 'ended'
}

/** ED後の最小の締め。スタッフロールは出さない(FABLE_ANSWERS_16 §4/§5)。 */
function endCard(): Promise<void> {
  return new Promise((resolve) => {
    void fadeThrough(
      async () => {
        clearScreens()
        await setBg('title')
        const node = el(`
          <div class="screen pad">
            <div class="title-wrap">
              <div class="title-sub">おわり</div>
              <div style="height:22px"></div>
              <button class="btn btn-primary" data-act="title">タイトルへ</button>
            </div>
          </div>
        `)
        node.querySelector('[data-act="title"]')!.addEventListener('click', () => resolve())
        app.appendChild(node)
      },
      { ms: 1400 },
    )
  })
}
