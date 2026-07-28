import { app, el, esc } from '../ui/dom'
import { askConfirm } from '../ui/confirm'
import { EVENTS, ITEMS, getItem, getPlace } from '../core/content'
import { clearSave } from '../core/state'
import { playScene } from './scene'
import { sacrifice } from '../core/tags'
import type { GameState } from '../core/types'
import tagLabels from '../data/tags.json'
import { openDiary } from './diary'

// 開発用。製品には出さない。
// 「捧げると全域から欠ける」が本当に動いているかを、アサがその場で確認するためのもの。

const LABELS = tagLabels as Record<string, string>

function allTags(state: GameState): { tag: string; label: string }[] {
  const rows = Object.entries(LABELS).map(([tag, label]) => ({ tag, label }))
  // 村に持ってきた持ち物。捧げてリュックから消えたあとも、戻せるように一覧には残す。
  for (const item of ITEMS) {
    if (state.leftBehind.includes(item.id)) continue
    rows.push({ tag: `item:${item.id}`, label: `持ち物: ${item.name}` })
  }
  return rows
}

export function devButton(state: GameState, onChange: () => void): HTMLElement {
  const wrap = el('<div class="dev"><button class="dev-btn">確認用</button></div>')
  wrap.querySelector('button')!.addEventListener('click', (e) => {
    e.stopPropagation()
    openDevPanel(state, onChange)
  })
  return wrap
}

function openDevPanel(state: GameState, onChange: () => void): void {
  const panel = el(`
    <div class="dev-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h2>確認用パネル</h2>
        <button class="dev-btn" data-act="close">とじる</button>
      </div>
      <p class="hint" style="margin-bottom:14px">
        製品には出しません。「捧げると世界と日記から一斉に欠ける」が動いているかを、
        ここで先に確認できるようにしてあります。オンにしたものは、この先の会話・場所・日記から消えます。
      </p>
      <div class="stack" data-role="tags"></div>
      <div style="height:20px"></div>
      <h2>日常イベントを見る</h2>
      <p class="hint" style="margin-bottom:10px">
        Day 1〜3 はすべて固定イベントなので、日常イベントはまだ本編に出てきません。
        ここから単体で確認できます(セーブや日記には影響しません)。
      </p>
      <div class="stack" data-role="ambients"></div>
      <div style="height:20px"></div>
      <h2>表示</h2>
      <div class="stack" data-role="opts"></div>
      <div style="height:20px"></div>
      <div class="stack" data-role="misc"></div>
    </div>
  `)

  const tags = panel.querySelector('[data-role="tags"]') as HTMLElement
  for (const { tag, label } of allTags(state)) {
    const on = state.sacrificed.includes(tag)
    const row = el(`
      <div class="dev-tag ${on ? 'on' : ''}">
        <span>${esc(label)}</span>
        <span>${on ? '捧げた' : '手元にある'}</span>
      </div>
    `)
    row.addEventListener('click', () => {
      if (state.sacrificed.includes(tag)) {
        state.sacrificed = state.sacrificed.filter((t) => t !== tag)
        // 持ち物を戻す(確認用の巻き戻し。本編にはこの操作はない)
        if (tag.startsWith('item:')) {
          const id = tag.slice(5)
          if (!state.leftBehind.includes(id) && !state.inventory.includes(id)) {
            state.inventory.push(id)
          }
        }
      } else {
        sacrifice(state, [tag])
      }
      onChange()
      panel.remove()
      openDevPanel(state, onChange)
    })
    tags.appendChild(row)
  }

  const ambients = panel.querySelector('[data-role="ambients"]') as HTMLElement
  for (const ev of EVENTS.filter((e) => e.kind === 'ambient' || e.kind === 'prelude')) {
    const place = getPlace(ev.place)?.name ?? ev.place
    const first = ev.script.find((l) => l.n || l.t)
    const preview = (first?.n ?? first?.t ?? '').slice(0, 22)
    const b = el(`
      <button class="btn">${esc(place)}
        <span class="sub">${esc(preview)}…</span>
      </button>
    `)
    b.addEventListener('click', async () => {
      panel.remove()
      // 状態を複製して再生する。日記や所持品に影響を残さないため。
      const sandbox = JSON.parse(JSON.stringify(state)) as GameState
      await playScene(sandbox, ev, { hud: false })
      openDevPanel(state, onChange)
    })
    ambients.appendChild(b)
  }

  const opts = panel.querySelector('[data-role="opts"]') as HTMLElement
  const draftBtn = el(
    `<button class="btn">仮テキストの「仮」印: ${state.settings.showDraftMarks ? 'ON' : 'OFF'}</button>`,
  )
  draftBtn.addEventListener('click', () => {
    state.settings.showDraftMarks = !state.settings.showDraftMarks
    onChange()
    panel.remove()
    openDevPanel(state, onChange)
  })
  opts.appendChild(draftBtn)

  const speeds = [34, 22, 12, 6]
  const speedBtn = el(`<button class="btn">文字速度: ${speedLabel(state.settings.textSpeed)}</button>`)
  speedBtn.addEventListener('click', () => {
    const i = speeds.indexOf(state.settings.textSpeed)
    state.settings.textSpeed = speeds[(i + 1) % speeds.length] ?? 22
    onChange()
    panel.remove()
    openDevPanel(state, onChange)
  })
  opts.appendChild(speedBtn)

  const misc = panel.querySelector('[data-role="misc"]') as HTMLElement
  const diaryBtn = el('<button class="btn">日記を読む</button>')
  diaryBtn.addEventListener('click', () => {
    panel.remove()
    void openDiary(state)
  })
  misc.appendChild(diaryBtn)

  const resetBtn = el('<button class="btn">セーブを消して最初から</button>')
  resetBtn.addEventListener('click', async () => {
    const ok = await askConfirm('セーブを消して最初からやり直します。いいですか？', '最初から')
    if (!ok) return
    clearSave()
    location.reload()
  })
  misc.appendChild(resetBtn)

  const info = el(
    `<p class="hint">持ち物: ${
      state.inventory.map((id) => esc(getItem(id)?.name ?? id)).join('、') || 'なし'
    }<br>置いてきた: ${
      state.leftBehind.map((id) => esc(getItem(id)?.name ?? id)).join('、') || 'なし'
    }<br>全${ITEMS.length}品中</p>`,
  )
  misc.appendChild(info)

  panel.querySelector('[data-act="close"]')!.addEventListener('click', () => panel.remove())
  app.appendChild(panel)
}

function speedLabel(v: number): string {
  if (v >= 30) return 'ゆっくり'
  if (v >= 20) return 'ふつう'
  if (v >= 10) return 'はやい'
  return 'すごくはやい'
}
