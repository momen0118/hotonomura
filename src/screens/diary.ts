import { app, clearScreens, el, esc, fadeThrough, wait } from '../ui/dom'
import { setBg } from '../ui/stage'
import { fill, getDay } from '../core/content'
import { blackout, isLost } from '../core/tags'
import type { DiaryEntryDef, DiaryPage, GameState } from '../core/types'

/** 短いテキストを1タップずつ送る(scene 依存を避けるための最小実装。循環 import 回避)。 */
async function showTextLines(lines: string[]): Promise<void> {
  const node = el(
    '<div class="scene"><div class="textbox"><div class="speaker" hidden></div><div class="body"></div><div class="next-mark"></div></div></div>',
  )
  app.appendChild(node)
  const body = node.querySelector('.body') as HTMLElement
  for (const text of lines) {
    body.textContent = text
    await new Promise<void>((resolve) => {
      const onClick = () => {
        node.removeEventListener('click', onClick)
        resolve()
      }
      node.addEventListener('click', onClick)
    })
  }
  node.remove()
}

/**
 * 日記の1ページを描く。
 * 捧げられたタグを持つ行は消さずに黒く塗る。写真は糊の跡だけ残す(SPEC.md §3)。
 */
export function renderPage(state: GameState, page: DiaryPage, writeIn = false): HTMLElement {
  // 破られたページ。綴じに紙の縁だけが残る。
  if (page.torn) {
    return el(`
      <div class="page torn">
        <div class="page-date"><span>${page.day}日目　${esc(page.date)}</span></div>
      </div>
    `)
  }

  const photoLost = page.photo ? isLost(state, page.photo.tags) : false
  const photoClass = page.photo?.none ? ' none' : photoLost ? ' lost' : ''
  const photoHtml = page.photo
    ? `<div class="photo${photoClass}">${photoLost ? '' : esc(fill(state, page.photo.caption))}</div>`
    : ''

  // 黒塗り規則v2: 行は消さない。日は縮まない。塗るのは指定された語だけ。
  // たこ焼き型は対象語だけ、生き物型は名前+種別まで——黒の面積が重さを語る。
  // 日記だけが正直で、世界と写真は素知らぬ顔をする。
  const rendered = page.entries.map((e) => {
    const factText = e.fact ? fill(state, e.fact) : ''
    const factHtml =
      factText && isLost(state, e.tags)
        ? esc(blackout(factText, e.blackout)).replace(
            /■+/g,
            (bar) => `<span class="ink">${bar}</span>`,
          )
        : esc(factText)
    const feeling = e.feeling ? esc(fill(state, e.feeling)) : ''
    // 予記にない書き足しは余白に足された行(周が進むほどページが混む)。
    return `<li class="${e.handwritten ? 'added' : ''}">${factHtml}${feeling}</li>`
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

/** 行の同一判定キー。事実文で照合し、感情文だけの行は感情文で照合する。 */
function entryKey(e: DiaryEntryDef): string {
  return e.fact ? `f:${e.fact}` : `x:${e.feeling ?? ''}`
}

/**
 * 夜。日記は「一冊・日付固定」(FABLE_ANSWERS_12 §1, 12a §2)。
 *  - その日のページが初めてなら書き下ろす(その周の予記の起点)。
 *  - 既にあるなら、予記にない出来事(ランダム・調査)だけを余白に書き足す。行は再生成しない。
 * 黒塗り(収穫・焼却)は既存行を遺構として残す。ここでは足すだけ。
 */
export async function writeNightPage(state: GameState): Promise<void> {
  const dayDef = getDay(state.day)
  const existing = state.diary.find((p) => p.day === state.day)
  const additions: DiaryEntryDef[] = []

  let page: DiaryPage
  if (!existing) {
    page = {
      day: state.day,
      date: dayDef?.date ?? '',
      loop: state.loop,
      photo: state.todayPhoto,
      entries: state.todayEntries.map((e) => ({ ...e, loop: state.loop })),
    }
    state.diary.push(page)
  } else {
    page = existing
    const seen = new Set(existing.entries.map(entryKey))
    for (const e of state.todayEntries) {
      const k = entryKey(e)
      if (seen.has(k)) continue
      seen.add(k)
      const added = { ...e, handwritten: true, loop: state.loop }
      existing.entries.push(added)
      additions.push(added)
    }
    // 写真は日付固定。撮っていない日に新しく撮れた周だけ補う。
    if (!existing.photo && state.todayPhoto) existing.photo = state.todayPhoto
  }

  const firstWrite = !existing
  state.todayEntries = []
  state.todayPhoto = null

  if (firstWrite) {
    await showNightWrite(state, page)
    return
  }

  // 二周目以降。Day 1 は開幕イベント(§2)が日記を見せるので、夜画面は出さない。
  if (state.day === 1) return
  await showLoopNight(state, page, additions)
}

/** 一周目の夜。白紙に、その日ぶんを自分で書く。 */
async function showNightWrite(state: GameState, page: DiaryPage): Promise<void> {
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

  await wait(500 + Math.max(1, page.entries.length) * 340)
  screen.appendChild(footer)
  await new Promise<void>((resolve) => {
    footer.querySelector('[data-act="close"]')!.addEventListener('click', () => resolve())
  })
  screen.remove()
}

/**
 * 二周目以降の夜(FABLE_ANSWERS_12 §3)。
 *  - 予記どおりの日(書き足しなし): 「もう書いてあった。ペンを置いた。」(初回は全文)。
 *  - 差分があった日: 「書いてないことが、あった。」→そのページ(書き足し込み)を見せる。
 */
async function showLoopNight(
  state: GameState,
  page: DiaryPage,
  additions: DiaryEntryDef[],
): Promise<void> {
  let lines: string[]
  if (additions.length === 0) {
    lines = state.flags.loopnight_seen
      ? ['もう書いてあった。', 'ペンを置いた。']
      : [
          'うしろの白いページに、今日のぶんを書こうとした。',
          '今日の日付のページに、もう書いてあった。',
          '書こうとしたことと、だいたい同じことが、おれの字で。',
          '……書くこと、ないじゃん。',
          'ペンを置いた。',
        ]
  } else {
    lines = ['書いてないことが、あった。']
  }
  state.flags.loopnight_seen = true

  await fadeThrough(
    async () => {
      clearScreens()
      await setBg('engawa_night')
    },
    { ms: 1000 },
  )
  await showTextLines(lines)
  // 差分があった夜だけ、書き足しの見えるページを開く。
  if (additions.length > 0) await openDiary(state)
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
      // 日付順に(周をまたいでも一冊・日付固定)。
      const pages = [...state.diary].sort((a, b) => a.day - b.day)
      for (const page of pages) holder.appendChild(renderPage(state, page))
    }

    screen.querySelector('[data-act="close"]')!.addEventListener('click', () => {
      screen.remove()
      resolve()
    })
    // 日記への遷移はフェード必須(FABLE_ANSWERS_12 §4.1)。
    void fadeThrough(() => {
      app.appendChild(screen)
    }, { ms: 360 })
  })
}
