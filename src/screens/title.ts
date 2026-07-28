import { app, clearScreens, el } from '../ui/dom'
import { setBg } from '../ui/stage'
import { askConfirm } from '../ui/confirm'
import { hasSave } from '../core/state'

export function titleScreen(): Promise<'new' | 'continue'> {
  clearScreens()
  void setBg('title')
  return new Promise((resolve) => {
    const canContinue = hasSave()
    const node = el(`
      <div class="screen pad">
        <div class="title-wrap">
          <div class="title-main">穂戸野村</div>
          <div class="title-sub">仮 題</div>
          <div class="title-menu">
            ${canContinue ? '<button class="btn btn-primary" data-act="continue">つづきから</button>' : ''}
            <button class="btn ${canContinue ? '' : 'btn-primary'}" data-act="new">はじめから</button>
          </div>
        </div>
      </div>
    `)
    node.addEventListener('click', async (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null
      if (!t) return
      const act = t.dataset.act as 'new' | 'continue'
      if (act === 'new' && canContinue) {
        const ok = await askConfirm(
          '最初からはじめます。今のセーブは消えますが、いいですか？',
          'はじめから',
        )
        if (!ok) return
      }
      resolve(act)
    })
    app.appendChild(node)
  })
}
