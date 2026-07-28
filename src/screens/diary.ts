import { app, el, esc, wait } from '../ui/dom'
import { fill, getDay } from '../core/content'
import { isLost, redact } from '../core/tags'
import type { DiaryPage, GameState } from '../core/types'

/**
 * 日記の1ページを描く。
 * 捧げられたタグを持つ行は消さずに黒く塗る。写真は糊の跡だけ残す(SPEC.md §3)。
 */
export function renderPage(state: GameState, page: DiaryPage, writeIn = false): HTMLElement {
  const photoLost = page.photo ? isLost(state, page.photo.tags) : false
  const photoHtml = page.photo
    ? `<div class="photo${photoLost ? ' lost' : ''}">${photoLost ? '' : esc(fill(state, page.photo.caption))}</div>`
    : ''

  const entries = page.entries.length
    ? page.entries
        .map((e) => {
          const lost = isLost(state, e.tags)
          const text = fill(state, e.text)
          return lost
            ? `<li><span class="entry-lost">${esc(redact(text))}</span></li>`
            : `<li>${esc(text)}</li>`
        })
        .join('')
    : '<li class="entry-blank">(なにも書いていない)</li>'

  return el(`
    <div class="page">
      <div class="page-date">
        <span>${page.day}日目　${esc(page.date)}</span>
        ${page.loop > 1 ? `<span class="loop">${page.loop}周目</span>` : ''}
      </div>
      ${photoHtml}
      <ul class="entries ${writeIn ? 'write-in' : ''}">${entries}</ul>
    </div>
  `)
}

/** 夜、その日ぶんが自動で書かれる。自動であることが黒塗りの自動発生と対になる。 */
export async function writeNightPage(state: GameState): Promise<void> {
  const dayDef = getDay(state.day)
  const page: DiaryPage = {
    day: state.day,
    date: dayDef?.date ?? '',
    loop: state.loop,
    photo: state.todayPhoto,
    entries: [...state.todayEntries],
  }
  state.diary.push(page)
  state.todayEntries = []
  state.todayPhoto = null

  const screen = el(`
    <div class="diary-screen">
      <div style="max-width:460px;width:100%;margin:0 auto 12px;">
        <p class="head" style="text-align:center">日記</p>
      </div>
    </div>
  `)
  const holder = el('<div style="max-width:460px;width:100%;margin:0 auto"></div>')
  screen.appendChild(holder)
  holder.appendChild(renderPage(state, page, true))

  const footer = el(`
    <div style="max-width:460px;width:100%;margin:18px auto 0">
      <button class="btn btn-primary" data-act="close">とじる</button>
    </div>
  `)
  app.appendChild(screen)

  // 書き終わるまで、とじられない。読ませるための間。
  await wait(500 + Math.max(1, page.entries.length) * 340)
  screen.appendChild(footer)
  await new Promise<void>((resolve) => {
    footer.querySelector('[data-act="close"]')!.addEventListener('click', () => resolve())
  })
  screen.remove()
}

/** いつでも読み返せる日記帳。 */
export function openDiary(state: GameState): Promise<void> {
  return new Promise((resolve) => {
    const screen = el(`
      <div class="diary-screen">
        <div style="max-width:460px;width:100%;margin:0 auto 12px;display:flex;justify-content:space-between;align-items:center">
          <p class="head" style="margin:0">日記</p>
          <button class="dev-btn" data-act="close">とじる</button>
        </div>
      </div>
    `)
    const holder = el('<div style="max-width:460px;width:100%;margin:0 auto"></div>')
    screen.appendChild(holder)

    if (state.diary.length === 0) {
      holder.appendChild(el('<p class="hint" style="text-align:center">まだ一日も終わっていない。</p>'))
    } else {
      for (const page of state.diary) holder.appendChild(renderPage(state, page))
    }

    screen.querySelector('[data-act="close"]')!.addEventListener('click', () => {
      screen.remove()
      resolve()
    })
    app.appendChild(screen)
  })
}
