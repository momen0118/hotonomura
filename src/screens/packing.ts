import { app, clearScreens, el, esc } from '../ui/dom'
import { setBg } from '../ui/stage'
import { ITEMS } from '../core/content'

const SLOTS = 5

export function nameScreen(): Promise<string> {
  clearScreens()
  void setBg('house')
  return new Promise((resolve) => {
    const node = el(`
      <div class="screen pad">
        <div class="spacer"></div>
        <div class="panel">
          <p class="head">なまえ</p>
          <p class="lead">小学六年生。最後の夏。</p>
          <input class="name-input" type="text" maxlength="8" value="ソラ" />
          <div style="height:14px"></div>
          <button class="btn btn-primary" data-act="ok">これでいく</button>
        </div>
        <div class="spacer"></div>
      </div>
    `)
    const input = node.querySelector('input') as HTMLInputElement
    const done = () => {
      const v = input.value.trim() || 'ソラ'
      resolve(v)
    }
    node.querySelector('[data-act="ok"]')!.addEventListener('click', done)
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') done()
    })
    app.appendChild(node)
    setTimeout(() => input.select(), 100)
  })
}

/** リュックに詰める。9品から5枠。ここが最初の賭場(SPEC.md §4)。 */
export function packingScreen(): Promise<string[]> {
  clearScreens()
  void setBg('house')
  return new Promise((resolve) => {
    const chosen = new Set<string>()

    const node = el(`
      <div class="screen pad" style="min-height:0">
        <p class="head">リュックに、五つまで</p>
        <p class="lead">「あっちで使うものだけ持っていきなよ」</p>
        <div class="pack-list"></div>
        <div class="counter"></div>
        <button class="btn btn-primary" data-act="go" disabled>これで出発する</button>
      </div>
    `)

    const list = node.querySelector('.pack-list') as HTMLElement
    const counter = node.querySelector('.counter') as HTMLElement
    const go = node.querySelector('[data-act="go"]') as HTMLButtonElement

    for (const item of ITEMS) {
      const row = el(`
        <div class="pack-item" data-id="${esc(item.id)}">
          <div class="check"></div>
          <div>
            <div class="nm">${esc(item.name)}</div>
            <div class="ds">${esc(item.desc)}</div>
          </div>
        </div>
      `)
      row.addEventListener('click', () => {
        if (chosen.has(item.id)) chosen.delete(item.id)
        else if (chosen.size < SLOTS) chosen.add(item.id)
        row.classList.toggle('on', chosen.has(item.id))
        update()
      })
      list.appendChild(row)
    }

    function update() {
      counter.textContent = `${chosen.size} / ${SLOTS}`
      go.disabled = chosen.size === 0
    }
    update()

    go.addEventListener('click', () => resolve([...chosen]))
    app.appendChild(node)
  })
}
