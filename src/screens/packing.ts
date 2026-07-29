import { app, clearScreens, el, esc } from '../ui/dom'
import { setBg } from '../ui/stage'
import { ITEMS } from '../core/content'

/** スマホ以外に選べる枠。SPEC §4(改訂: スマホ固定+8品から4枠) */
const SLOTS = 4

const LOCK_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">' +
  '<path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
  '<rect x="4" y="10" width="16" height="11" rx="2" fill="currentColor"/></svg>'

export function nameScreen(): Promise<string> {
  clearScreens()
  void setBg('room')
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
    const done = () => resolve(input.value.trim() || 'ソラ')
    node.querySelector('[data-act="ok"]')!.addEventListener('click', done)
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') done()
    })
    app.appendChild(node)
    setTimeout(() => input.select(), 100)
  })
}

/**
 * リュックに詰める。ここが最初の賭場(SPEC §4)。
 * スマホは並ぶが外せない——選べないのに一行説明があるのは、そのための表示。
 * 将来この画面は「机にばらっと並んだ一枚絵」になる(items.json の spot が配置用)。
 */
export function packingScreen(loop = 1): Promise<string[]> {
  clearScreens()
  void setBg('room')
  return new Promise((resolve) => {
    const chosen = new Set<string>()

    const node = el(`
      <div class="screen pad" style="min-height:0">
        <p class="head">なにを持っていく？</p>
        <p class="lead">リュックはひとつ。スマホのほかに、四つまで。</p>
        <div class="mom-line" hidden></div>
        <div class="pack-list"></div>
        <div class="counter"></div>
        <button class="btn btn-primary" data-act="go" disabled>これで出発する</button>
      </div>
    `)

    const list = node.querySelector('.pack-list') as HTMLElement
    const counter = node.querySelector('.counter') as HTMLElement
    const go = node.querySelector('[data-act="go"]') as HTMLButtonElement
    const momLine = node.querySelector('.mom-line') as HTMLElement

    // 品を入れた瞬間の母の一言(各一度だけ)。
    //  アクスタ/ゲーム機 → 「そんなんあっちでいらないでしょ。」(FABLE_ANSWERS_5 §2)
    //  夏期講習テキスト   → 「あら。……えらいじゃない。」(FABLE_ANSWERS_7 §3)
    let momItemsaid = false
    let momTextbookSaid = false
    const say = (text: string) => {
      momLine.innerHTML = `<span class="mom-name">母</span>${text}`
      momLine.hidden = false
    }
    const maybeMom = (id: string) => {
      if (!momItemsaid && (id === 'acryl' || id === 'game')) {
        momItemsaid = true
        say('そんなんあっちでいらないでしょ。')
      } else if (!momTextbookSaid && id === 'textbook') {
        momTextbookSaid = true
        say('あら。……えらいじゃない。')
      }
    }

    // 村で手に入る品(ぽやぽや等)はここには並ばない
    for (const item of ITEMS.filter((i) => !i.acquirable)) {
      const row = el(`
        <div class="pack-item ${item.fixed ? 'fixed on' : ''}" data-id="${esc(item.id)}">
          <div class="check">${item.fixed ? LOCK_SVG : ''}</div>
          <div>
            <div class="nm">${esc(item.name)}${item.fixed ? '<span class="tagline">必ず持っていく</span>' : ''}</div>
            <div class="ds">${esc(item.desc)}</div>
          </div>
        </div>
      `)
      if (!item.fixed) {
        row.addEventListener('click', () => {
          if (chosen.has(item.id)) chosen.delete(item.id)
          else if (chosen.size < SLOTS) {
            chosen.add(item.id)
            maybeMom(item.id)
          }
          row.classList.toggle('on', chosen.has(item.id))
          update()
        })
      }
      list.appendChild(row)
    }

    function update() {
      counter.textContent = `${chosen.size} / ${SLOTS}`
      go.disabled = chosen.size === 0
    }
    update()

    // 二周目以降、机の前で手が止まると、母の差分一言(FABLE_ANSWERS_7 §2)。
    // 迷わず選んで出発する周では出ない=「手が止まる」ときだけの一言。
    let hesitateTimer = 0
    if (loop >= 2) {
      hesitateTimer = window.setTimeout(() => {
        if (momLine.hidden) say('なに？ 行きたくなくなった？')
      }, 6000)
    }

    go.addEventListener('click', () => {
      if (hesitateTimer) clearTimeout(hesitateTimer)
      resolve([...chosen])
    })
    app.appendChild(node)
  })
}
