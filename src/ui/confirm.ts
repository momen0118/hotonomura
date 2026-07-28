import { app, el, esc } from './dom'

/**
 * 画面内の確認ダイアログ。
 * 公開版は iframe の中で動くため window.confirm が使えない(押しても何も起きない)。
 * 「はじめから」が反応しなかったのはこれが原因だった。
 */
export function askConfirm(message: string, okLabel = 'はい', ngLabel = 'やめる'): Promise<boolean> {
  return new Promise((resolve) => {
    const node = el(`
      <div class="modal">
        <div class="modal-box">
          <p class="modal-msg">${esc(message)}</p>
          <div class="stack">
            <button class="btn btn-primary" data-act="ok">${esc(okLabel)}</button>
            <button class="btn" data-act="ng">${esc(ngLabel)}</button>
          </div>
        </div>
      </div>
    `)
    const close = (v: boolean) => {
      node.remove()
      resolve(v)
    }
    node.querySelector('[data-act="ok"]')!.addEventListener('click', (e) => {
      e.stopPropagation()
      close(true)
    })
    node.querySelector('[data-act="ng"]')!.addEventListener('click', (e) => {
      e.stopPropagation()
      close(false)
    })
    app.appendChild(node)
  })
}
