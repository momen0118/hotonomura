import { app, clearScreens, el, esc, fadeThrough, wait } from '../ui/dom'
import { setBg } from '../ui/stage'
import { fill, getDay } from '../core/content'
import { blackout, isLost } from '../core/tags'
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

  // 黒塗り規則v2: 行は消さない。日は縮まない。塗るのは指定された語だけ。
  // たこ焼き型は対象語だけ、生き物型は名前+種別まで——黒の面積が重さを語る。
  // 日記だけが正直で、世界と写真は素知らぬ顔をする。
  const rendered = page.entries.map((e) => {
    const factText = fill(state, e.fact)
    const factHtml = isLost(state, e.tags)
      ? esc(blackout(factText, e.blackout)).replace(
          /■+/g,
          (bar) => `<span class="ink">${bar}</span>`,
        )
      : esc(factText)
    const feeling = e.feeling ? esc(fill(state, e.feeling)) : ''
    return `<li>${factHtml}${feeling}</li>`
  })

  const entries = rendered.length
    ? rendered.join('')
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

/**
 * 夜、その日ぶんが自動で書かれる。自動であることが黒塗りの自動発生と対になる。
 * 日記へは一秒の暗転を挟んで入る(一瞬で切り替えない)。
 */
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
  await fadeThrough(
    async () => {
      clearScreens()
      await setBg('engawa_night')
      app.appendChild(screen)
    },
    { ms: 1000 },
  )

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
