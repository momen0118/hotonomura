import { app, clearScreens, el, esc, fadeThrough, wait } from '../ui/dom'
import { setBg } from '../ui/stage'
import { fill, getDay } from '../core/content'
import { blackout, isLost } from '../core/tags'
import type { DiaryEntryDef, DiaryPage, GameState } from '../core/types'

/** 短いテキストを1タップずつ送る(scene 依存を避けるための最小実装。循環 import 回避)。 */
async function showTextLines(lines: string[]): Promise<void> {
  const node = el(
    '<div class="scene"><div class="textbox"><div class="speaker"></div><div class="body"></div><div class="next-mark"></div></div></div>',
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
 * 日記の1ページ(まるごと)を描く。夜の書きおろし・祠のリストなど、1ページを丸ごと出す用途。
 * めくりUIの続きページは renderPageChunk を使う。
 */
export function renderPage(state: GameState, page: DiaryPage, writeIn = false): HTMLElement {
  if (page.torn) {
    return el(`
      <div class="page torn">
        <div class="page-date"><span>${page.day}日目　${esc(page.date)}</span></div>
        <p class="torn-note">やぶった跡。</p>
      </div>
    `)
  }
  return renderPageChunk(state, page, page.entries, { showPhoto: true, writeIn })
}

/**
 * ページの一部(行の部分集合)を描く。長い日を続きページに割るためのもの(FABLE_ANSWERS_18 日記UI)。
 * cont=true は「(続き)」表示・写真なし。捧げられたタグの行は黒く塗る(SPEC.md §3)。
 */
export function renderPageChunk(
  state: GameState,
  page: DiaryPage,
  entries: DiaryEntryDef[],
  opts: { showPhoto?: boolean; cont?: boolean; writeIn?: boolean } = {},
): HTMLElement {
  const photoLost = page.photo ? isLost(state, page.photo.tags) : false
  const photoClass = page.photo?.none ? ' none' : photoLost ? ' lost' : ''
  const photoHtml =
    opts.showPhoto && page.photo
      ? `<div class="photo${photoClass}">${photoLost ? '' : esc(fill(state, page.photo.caption))}</div>`
      : ''

  const rendered = entries.map((e) => {
    const factText = e.fact ? fill(state, e.fact) : ''
    const factHtml =
      factText && isLost(state, e.tags)
        ? esc(blackout(factText, e.blackout)).replace(/■+/g, (bar) => `<span class="ink">${bar}</span>`)
        : esc(factText)
    const feeling = e.feeling ? esc(fill(state, e.feeling)) : ''
    return `<li class="${e.handwritten ? 'added' : ''}">${factHtml}${feeling}</li>`
  })
  const list = rendered.length ? rendered.join('') : '<li class="entry-blank">(なにも書いていない)</li>'
  const cont = opts.cont ? '<span class="cont">(つづき)</span>' : ''

  return el(`
    <div class="page">
      <div class="page-date"><span>${page.day}日目　${esc(page.date)}</span>${cont}</div>
      ${photoHtml}
      <ul class="entries ${opts.writeIn ? 'write-in' : ''}">${list}</ul>
    </div>
  `)
}

/** 行の同一判定キー。事実文で照合し、感情文だけの行は感情文で照合する。 */
function entryKey(e: DiaryEntryDef): string {
  return e.fact ? `f:${e.fact}` : `x:${e.feeling ?? ''}`
}

/**
 * 夜。日記は「一冊・日付固定のフリーノート」(FABLE_ANSWERS_12 §1 / 13a §1)。
 *  - その日のページがまだ無ければ書き下ろす(その周の起点)。
 *  - 既存(未破)ページがあれば、予記にない出来事だけを余白に書き足す。行は再生成しない。
 *  - その日付の最後のページが「破られた(torn)」なら、次周にソラが新しいページとして書き直す
 *    (捧げた記憶がないため)。内容はその周に実際に起きたこと。何もなければ「なにもなかった。」。
 * 黒塗り(収穫・焼却)は既存行を遺構として残す。
 */
export async function writeNightPage(state: GameState): Promise<void> {
  const dayDef = getDay(state.day)
  const daysPages = state.diary.filter((p) => p.day === state.day)
  const last = daysPages.length ? daysPages[daysPages.length - 1] : null

  // 既存の未破ページ → 差分だけ書き足す
  if (last && !last.torn) {
    const seen = new Set(last.entries.map(entryKey))
    const additions: DiaryEntryDef[] = []
    for (const e of state.todayEntries) {
      const k = entryKey(e)
      if (seen.has(k)) continue
      seen.add(k)
      const added = { ...e, handwritten: true, loop: state.loop }
      last.entries.push(added)
      additions.push(added)
    }
    if (!last.photo && state.todayPhoto) last.photo = state.todayPhoto
    state.todayEntries = []
    state.todayPhoto = null
    // Day 1 は開幕イベント(§2)が日記を見せるので、夜画面は出さない。
    if (state.day === 1) return
    // 祭り消滅周の Day 6夜は、八月十五日のページを開いて残った品目を読む夜に(FABLE_ANSWERS_18 §7)。
    if (state.day === 6 && isLost(state, ['fun:matsuri'])) {
      await matsuriGoneNight(state)
      return
    }
    await showLoopNight(state, last, additions)
    return
  }

  // ページが無い(初回)、または最後のページが破られている(書き直し)。新しいページを起こす。
  const rewrite = !!last
  const entries: DiaryEntryDef[] =
    state.todayEntries.length > 0
      ? state.todayEntries.map((e) => ({ ...e, loop: state.loop }))
      : [{ fact: 'なにもなかった。', loop: state.loop }]
  const page: DiaryPage = {
    day: state.day,
    date: dayDef?.date ?? '',
    loop: state.loop,
    photo: state.todayPhoto,
    entries,
  }
  state.diary.push(page)
  state.todayEntries = []
  state.todayPhoto = null

  // loop2+ の Day 1(破られていない初回)は開幕が見せるので夜画面なし。それ以外は書きの画面。
  if (state.day === 1 && !rewrite && state.loop >= 2) return
  await showNightWrite(state, page)
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
  // タロ未収穫の周の、特定日の態度差分(FABLE_ANSWERS_13 §3 / 13a §3)。
  const taroAlive = !state.sacrificed.includes('taro')
  let lines: string[]
  if (additions.length > 0) {
    lines = ['書いてないことが、あった。']
  } else if (page.entries.some((e) => !!e.fact && isLost(state, e.tags))) {
    // 夜定型・第三形態(FABLE_ANSWERS_19c §3): 非登載イベントが今日も起きたが、対応する予記行が
    // すでに黒塗り済みの夜。黒の上からは、書けない。理由の説明はしない。以後この夜は追記なし。
    lines = [
      '今日の日付のところは、黒く塗られていた。',
      '書こうとしたことが、この下に書いてある気がした。',
      '気がするだけで、読めない。',
      '黒の上から書く気には、ならなかった。',
      'ペンを置いた。',
    ]
  } else if (taroAlive && state.day === 2) {
    lines = ['今日の日記は、もう書いてあった。', 'ナツ、という名前も。', '書いてあったとおりのことを、あの子は言った。']
  } else if (taroAlive && state.day === 9) {
    lines = ['散歩のことも、書いてあった。', 'つぎのページは、めくらないで閉じた。']
  } else {
    // 「書くことないじゃん」の全文は Day 1夜の開幕に統合済み(FABLE_ANSWERS_18 §6)。
    // 2日目以降の定型は短縮版のみ。
    lines = ['今日の日記は、もう書いてあった。', 'ペンを置いた。']
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
  // 「ペンを置いた」日も、その日のページを見せる(FABLE_ANSWERS_18 §10.6)。当日ページを既定表示。
  await openDiary(state, { day: state.day })
}

/**
 * 祭り消滅周の Day 6夜(FABLE_ANSWERS_18 §7)。八月十五日のページを開き、黒く残った品目を読む。
 * 品目は 8月15日ページの「無傷の(捧げられていない)品目行」から実際に2つ引く。
 * 無傷の品目が無い周はフォールバック(ほとんど黒いページ)。
 */
async function matsuriGoneNight(state: GameState): Promise<void> {
  const page = state.diary.find((p) => p.day === 6 && !p.torn)
  const intact = (page?.entries ?? [])
    .filter((e) => !!e.fact && !!e.tags && e.tags.length > 0 && !isLost(state, e.tags))
    .map((e) => e.blackout ?? e.fact ?? '')
    .filter((s) => s.length > 0)

  let lines: string[]
  if (intact.length >= 1) {
    lines = [
      '夜、日記に書こうとして、八月十五日のページをひらいた。',
      intact.slice(0, 2).join('。') + '。',
      '読める行を、読んだ。',
      '……これ、どこの話だ？',
      '祭り、みたいだ。',
      '祭りは、ないのに。',
      '黒く塗られたところを、しばらく見ていた。',
      '見ていても、読めるようには、ならなかった。',
    ]
  } else {
    lines = [
      '八月十五日のページは、ほとんど黒かった。',
      '「ぜんぶは回れなかった。」',
      'それだけが、読めた。',
      'なにを、回れなかったんだ？',
    ]
  }

  await fadeThrough(
    async () => {
      clearScreens()
      await setBg('engawa_night')
    },
    { ms: 1000 },
  )
  await showTextLines(lines)
  // 八月十五日のページを開いて見せる(その周に読んだ日付を既定表示)。
  await openDiary(state, { day: 6 })
}

interface DiaryView {
  day: number
  node: HTMLElement
  empty?: boolean
}

/** 1ページに収まらない長い日を、行を割って続きページにする(measure で実寸判定)。 */
function splitToViews(state: GameState, viewEl: HTMLElement): DiaryView[] {
  const pages = [...state.diary].sort((a, b) => a.day - b.day)
  const views: DiaryView[] = []
  const fits = (node: HTMLElement): boolean => {
    viewEl.innerHTML = ''
    viewEl.appendChild(node)
    return node.scrollHeight <= viewEl.clientHeight + 1
  }
  for (const page of pages) {
    if (page.torn) {
      views.push({ day: page.day, node: renderPage(state, page) })
      continue
    }
    // まず丸ごと。収まればそれで1ページ。
    if (page.entries.length <= 1 || fits(renderPageChunk(state, page, page.entries, { showPhoto: true }))) {
      views.push({ day: page.day, node: renderPageChunk(state, page, page.entries, { showPhoto: true }) })
      continue
    }
    // あふれるので、頭から入るだけ入れて続きページに送る。
    let rest = page.entries.slice()
    let first = true
    while (rest.length > 0) {
      let k = rest.length
      while (k > 1) {
        if (fits(renderPageChunk(state, page, rest.slice(0, k), { showPhoto: first, cont: !first }))) break
        k--
      }
      views.push({
        day: page.day,
        node: renderPageChunk(state, page, rest.slice(0, k), { showPhoto: first, cont: !first }),
      })
      rest = rest.slice(k)
      first = false
    }
  }
  viewEl.innerHTML = ''
  return views
}

/**
 * いつでも読み返せる日記帳(FABLE_ANSWERS_18 日記UI改修)。
 * めくり形式(単ページ送り)・長い日は続きページ・とじるは固定フッター・破れ跡は在位置表示・
 * 既定は当日ページ(opts.day で上書き可)。
 */
export function openDiary(state: GameState, opts: { day?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    const screen = el(`
      <div class="diary-screen paged">
        <div class="diary-view"></div>
        <div class="diary-footer">
          <button class="diary-nav" data-act="prev">前</button>
          <span class="diary-ind"></span>
          <button class="diary-nav" data-act="next">次</button>
          <button class="dev-btn" data-act="close">とじる</button>
        </div>
      </div>
    `)
    const viewEl = screen.querySelector('.diary-view') as HTMLElement
    const ind = screen.querySelector('.diary-ind') as HTMLElement
    const prevBtn = screen.querySelector('[data-act="prev"]') as HTMLButtonElement
    const nextBtn = screen.querySelector('[data-act="next"]') as HTMLButtonElement

    let views: DiaryView[] = []
    let idx = 0
    const show = (): void => {
      viewEl.innerHTML = ''
      viewEl.appendChild(views[idx].node)
      ind.textContent = views[idx].empty ? '' : `${idx + 1} / ${views.length}`
      prevBtn.disabled = idx === 0
      nextBtn.disabled = idx === views.length - 1
    }
    const go = (d: number): void => {
      const n = idx + d
      if (n >= 0 && n < views.length) {
        idx = n
        show()
      }
    }
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      go(-1)
    })
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      go(1)
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    screen.querySelector('[data-act="close"]')!.addEventListener('click', () => {
      window.removeEventListener('keydown', onKey)
      screen.remove()
      resolve()
    })

    // 日記への遷移はフェード必須(FABLE_ANSWERS_12 §4.1)。DOM に載せてから実寸で割る。
    void fadeThrough(() => {
      app.appendChild(screen)
      views = splitToViews(state, viewEl)
      if (views.length === 0) {
        views = [{ day: 0, empty: true, node: el('<p class="hint" style="margin:auto;text-align:center">まだ一日も終わっていない。</p>') }]
      }
      // 既定は当日ページ(opts.day 優先)。無ければ最後のページ。
      const target = opts.day ?? state.day
      const found = views.findIndex((v) => v.day === target)
      idx = found >= 0 ? found : views.length - 1
      show()
    }, { ms: 360 })
  })
}
