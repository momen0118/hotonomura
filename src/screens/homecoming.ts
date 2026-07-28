import { clearScreens, fadeThrough } from '../ui/dom'
import { setBg } from '../ui/stage'
import { getEvent, initialPlaces } from '../core/content'
import { rewind, save } from '../core/state'
import type { GameState } from '../core/types'
import { playScene } from './scene'
import { offerScreen } from './offer'

/**
 * 帰宅日 → 巻き戻し(SPEC §3)。
 * Day 14、帰りのバスに乗る → 車窓に鳥居 → 白む → Day 1 の車内。
 * 出られない場合、白む前に「なにを、おいていきますか」。
 * 最低一つ置かないと巻き戻れない(席料)。帰ろうとするたび失う。
 *
 * Day 8〜14の本文は未納品なので、いまは仮のダイジェストで通している。
 */
export async function homecoming(state: GameState): Promise<void> {
  clearScreens()
  await playScene(state, getEvent('d14_home'), { here: 'バスの中' })

  // 席料を払うまで先へ進めない
  for (;;) {
    const paid = await offerScreen(state, 'depart')
    if (paid) break
    // 置いていけるものが尽きている場合は、そのまま通す(値切りは祠の担当)
    const anyLeft = state.diary.some(
      (p) =>
        !p.torn &&
        p.entries.some(
          (e) => e.tags && e.tags.length > 0 && !e.tags.some((t) => state.sacrificed.includes(t)),
        ),
    )
    if (!anyLeft) break
  }
  save(state)

  // 白む
  await fadeThrough(
    async () => {
      clearScreens()
      rewind(state, initialPlaces())
      save(state)
      await setBg('bus')
    },
    { white: true, ms: 1200 },
  )
}
