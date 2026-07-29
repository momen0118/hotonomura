import { clearScreens, fadeThrough } from '../ui/dom'
import { setBg } from '../ui/stage'
import { getEvent, initialPlaces } from '../core/content'
import { rewind, save } from '../core/state'
import { harvest } from '../core/harvest'
import type { GameState } from '../core/types'
import { playScene } from './scene'

/**
 * 帰宅日 → 巻き戻し(FABLE_ANSWERS_6 で全面改訂)。
 *
 * バスでは何も選ばせない。独白が「赤い柱がよぎって、」で切れたところで、
 * 神が村で育った思い出を無音で収穫する(周回数ぶん、重い順)。演出もUIも出ない。
 * 収穫の発覚は、二周目以降に日記を開いた瞬間だけ。バス車内には一切の示唆を置かない。
 *
 * 出口を開けるのは、祠で持ち込んだ実物を差し出したときだけ(§6)。ここではない。
 * Day 8〜13の本文は未納品なので、いまは Day 7 のあとの確認用導線から入る。
 */
export async function homecoming(state: GameState): Promise<void> {
  clearScreens()
  await playScene(state, getEvent('d14_home'), { here: 'バスの中' })

  // 白む前に、無音で収穫する。ここで日記を見せてはいけない。
  await fadeThrough(
    async () => {
      harvest(state)
      rewind(state, initialPlaces())
      save(state)
      clearScreens()
      // 白む→出発の朝(OP)へ(FABLE_ANSWERS_7 §2)。バス車内ではない。この直後に runOP が走る。
      await setBg('room')
    },
    { white: true, ms: 1200 },
  )
}
