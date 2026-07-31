import { app, el, esc, fadeThrough, wait } from '../ui/dom'
import { setBg } from '../ui/stage'
import { fill, getEvent, visibleLine } from '../core/content'
import { openDiary } from './diary'
import { hashString, mulberry32 } from '../core/rng'
import { applySet, SLOT_LABEL, SLOT_ORDER } from '../core/state'
import { getBacklog, pushLog } from '../core/backlog'
import type { ChoiceDef, GameEvent, GameState, Line } from '../core/types'

interface Frame {
  lines: Line[]
  i: number
}

// 既読スキップ(FABLE_ANSWERS_18 §10.5)。ON のあいだ、既読の行は待たずに送る。
// 未読の行は普通に表示して止まる(=見たところは飛ばし、新しいところは読む)。
// 選択肢では止まる。周回を速くするための快適化。ボタン/キー(S)で切り替え。
let skipMode = false
const readKey = (speaker: string | null, text: string): string =>
  String(hashString(`${speaker ?? ''}${text}`))
function markRead(state: GameState, key: string): void {
  if (!state.read) state.read = {}
  state.read[key] = 1
}
function isRead(state: GameState, key: string): boolean {
  return !!state.read && !!state.read[key]
}

function slotBar(state: GameState, here: string, time?: string): string {
  // 時刻の上書きがあるとき(祭りなど)はコマのドットを出さない
  const dots = time
    ? ''
    : SLOT_ORDER.map(
        (s) =>
          `<span class="dot ${SLOT_ORDER.indexOf(s) <= SLOT_ORDER.indexOf(state.slot) ? 'on' : ''}"></span>`,
      ).join('')
  const label = time ?? SLOT_LABEL[state.slot]
  return `
    <div class="hud">
      <div class="slotbar"><span>${state.day}日目 ${label}</span>${dots}</div>
      <div class="here" ${here ? '' : 'hidden'}>${esc(here)}</div>
      <button class="dev-btn" data-act="log">履歴</button>
    </div>
  `
}

export async function playScene(
  state: GameState,
  ev: GameEvent,
  opts: { hud?: boolean; here?: string; time?: string } = {},
): Promise<void> {
  const hud = opts.hud !== false
  const scene = el(`
    <div class="scene">
      ${hud ? slotBar(state, opts.here ?? '', opts.time) : ''}
      <div class="textbox">
        <div class="speaker"></div>
        <div class="body"></div>
        <div class="next-mark" hidden></div>
      </div>
    </div>
  `)
  app.appendChild(scene)

  scene.querySelector('[data-act="log"]')?.addEventListener('click', (e) => {
    e.stopPropagation()
    openBacklog()
  })

  // 既読スキップの切り替えボタン(HUDの有無にかかわらず右下に出す)。
  const skipBtn = el(`<button class="skip-btn ${skipMode ? 'on' : ''}" data-act="skip">スキップ</button>`)
  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    skipMode = !skipMode
    skipBtn.classList.toggle('on', skipMode)
  })
  scene.appendChild(skipBtn)

  const box = scene.querySelector('.textbox') as HTMLElement
  const hereEl = scene.querySelector('.here') as HTMLElement | null
  const speakerEl = scene.querySelector('.speaker') as HTMLElement
  const bodyEl = scene.querySelector('.body') as HTMLElement
  const nextEl = scene.querySelector('.next-mark') as HTMLElement

  const stack: Frame[] = [{ lines: ev.script, i: 0 }]

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (frame.i >= frame.lines.length) {
      stack.pop()
      continue
    }
    const line = frame.lines[frame.i++]
    if (!visibleLine(state, line)) continue

    if (line.bg) await setBg(line.bg)
    if (line.fx === 'fade') await fadeThrough(() => {}, { ms: 500 })
    if (line.here && hereEl) {
      hereEl.textContent = fill(state, line.here)
      hereEl.hidden = false
    }
    if (line.set) applySet(state, line.set)
    if (line.roll) {
      const rnd = mulberry32(hashString(`${state.seed}:${state.loop}:${line.roll.flag}`))
      state.flags[line.roll.flag] = rnd() < line.roll.chance
    }
    if (line.money) state.money += line.money
    if (line.include) {
      const inc = getEvent(line.include)
      // 差し込んだ側でも消化済みにする。でないと一度きりのイベントが後日また起きる。
      if (inc.once && !state.seenEvents.includes(inc.id)) state.seenEvents.push(inc.id)
      stack.push({ lines: inc.script, i: 0 })
      continue
    }
    if (line.unlock) {
      for (const p of line.unlock) if (!state.places.includes(p)) state.places.push(p)
    }
    if (line.gain) {
      for (const it of line.gain) if (!state.inventory.includes(it)) state.inventory.push(it)
    }
    if (line.diary) state.todayEntries.push(line.diary)
    if (line.photo) state.todayPhoto = line.photo
    if (line.openDiary) {
      // 全ページの日記を開き、プレイヤーがめくって閉じるまで待つ(二周目開幕・FABLE_ANSWERS_10 C4)。
      await openDiary(state)
      continue
    }

    if (line.choice) {
      const options = line.choice.filter(
        (c) =>
          visibleLine(state, { if: c.if }) && (!c.needItem || state.inventory.includes(c.needItem)),
      )
      if (options.length > 0) {
        const picked = await askChoice(state, scene, options)
        applySet(state, picked.set)
        if (picked.lines) stack.push({ lines: picked.lines, i: 0 })
      }
      continue
    }

    if (line.n !== undefined || line.t !== undefined) {
      await showText(state, box, speakerEl, bodyEl, nextEl, scene, line)
    }
  }

  scene.remove()
}

function showText(
  state: GameState,
  box: HTMLElement,
  speakerEl: HTMLElement,
  bodyEl: HTMLElement,
  nextEl: HTMLElement,
  scene: HTMLElement,
  line: Line,
): Promise<void> {
  const isTalk = line.t !== undefined
  // 鉤括弧は表示上つけない。話者名と文字色で地の文と区別する。
  const text = fill(state, (isTalk ? line.t : line.n) ?? '')
  const speaker = isTalk && line.c ? fill(state, line.c) : null

  // 話者名は毎行かならず入れ替える。地の文でも行の高さは確保したまま(名前は空・FABLE_ANSWERS_18a §2)。
  // 枠の高さを常に「話者名行+本文3行」に固定して、縦伸び・スキップボタンとの隙間の変動を消す。
  speakerEl.textContent = speaker ?? ''
  bodyEl.classList.toggle('talk', isTalk && !line.thought)
  bodyEl.classList.toggle('thought', !!line.thought)

  pushLog(speaker, text)

  // 仮テキストの印。Fable の確定稿待ちが一目でわかるようにしておく(開発用)。
  box.querySelector('.draft-mark')?.remove()
  if (line.draft && state.settings.showDraftMarks) {
    box.appendChild(el('<div class="draft-mark">仮</div>'))
  }

  // 既読スキップ(§10.5)。この行が既読かを、表示前に判定してから既読に記録する。
  const key = readKey(speaker, text)
  const wasRead = isRead(state, key)
  markRead(state, key)

  // メッセージ枠の高さは固定(本文3行ぶん)。長文は枠を縦に伸ばさず、既存の▼送りで
  // ページ分割して見せる(FABLE_ANSWERS_17 §0)。短い行は1ページなので従来と同じ挙動。
  const pages = paginate(bodyEl, text)

  return new Promise((resolve) => {
    // 既読スキップ中の既読行: 最終ページを一瞬だけ見せて自動送り(待たない)。
    if (skipMode && wasRead) {
      bodyEl.textContent = pages[pages.length - 1]
      nextEl.hidden = false
      window.setTimeout(resolve, 14)
      return
    }

    let page = 0
    let idx = 0
    let done = false
    let timer = 0
    nextEl.hidden = true
    bodyEl.textContent = ''

    const finish = () => {
      done = true
      bodyEl.textContent = pages[page]
      nextEl.hidden = false
      clearInterval(timer)
    }

    const startPage = () => {
      idx = 0
      done = false
      nextEl.hidden = true
      bodyEl.textContent = ''
      timer = window.setInterval(() => {
        idx++
        bodyEl.textContent = pages[page].slice(0, idx)
        if (idx >= pages[page].length) finish()
      }, Math.max(6, state.settings.textSpeed))
    }

    const onTap = () => {
      if (document.querySelector('.backlog')) return
      if (!done) {
        finish()
        return
      }
      if (page < pages.length - 1) {
        page++
        startPage()
        return
      }
      scene.removeEventListener('click', onTap)
      window.removeEventListener('keydown', onKey)
      resolve()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        onTap()
      }
    }
    scene.addEventListener('click', onTap)
    window.addEventListener('keydown', onKey)
    startPage()
  })
}

/**
 * 一行のテキストを、メッセージ枠(高さ固定)に収まるページに割る(FABLE_ANSWERS_17 §0)。
 * 枠に収まる行はそのまま1ページ。あふれる行だけ、句読点で切って複数ページにする。
 * bodyEl の実寸で測るので、フォント・幅が変わっても追従する。
 */
function paginate(bodyEl: HTMLElement, text: string): string[] {
  const fits = (s: string): boolean => {
    bodyEl.textContent = s
    return bodyEl.scrollHeight <= bodyEl.clientHeight + 1
  }
  if (fits(text)) {
    bodyEl.textContent = ''
    return [text]
  }
  const pages: string[] = []
  let rest = text
  // 無限ループ防止(1文字ずつは必ず進む)。
  while (rest.length > 0) {
    if (fits(rest)) {
      pages.push(rest)
      break
    }
    // 収まる最大の接頭辞を二分探索。
    let lo = 1
    let hi = rest.length
    let best = 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (fits(rest.slice(0, mid))) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    // なるべく句読点で切る(枠の後半にある区切りだけ採用。前すぎる切れ目は使わない)。
    const seg = rest.slice(0, best)
    const brk = Math.max(
      seg.lastIndexOf('。'),
      seg.lastIndexOf('！'),
      seg.lastIndexOf('？'),
      seg.lastIndexOf('、'),
    )
    const cut = brk >= Math.floor(best * 0.5) ? brk + 1 : best
    pages.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  bodyEl.textContent = ''
  return pages
}

function askChoice(state: GameState, scene: HTMLElement, options: ChoiceDef[]): Promise<ChoiceDef> {
  return new Promise((resolve) => {
    const wrap = el('<div class="choices"></div>')
    options.forEach((opt, i) => {
      const mark =
        opt.draft && state.settings.showDraftMarks ? ' <span style="opacity:.5">〔仮〕</span>' : ''
      const b = el(`<button class="btn">${esc(fill(state, opt.label))}${mark}</button>`)
      b.addEventListener('click', async (e) => {
        e.stopPropagation()
        wrap.remove()
        await wait(120)
        resolve(options[i])
      })
      wrap.appendChild(b)
    })
    scene.appendChild(wrap)
  })
}

/** 読み返し。1シーンの行数が増えたので、遡れる場所が要る。 */
export function openBacklog(): void {
  const rows = getBacklog()
    .map(
      (b) =>
        `<div class="log-row">${
          b.speaker ? `<div class="log-speaker">${esc(b.speaker)}</div>` : ''
        }<div class="log-text ${b.speaker ? 'talk' : ''}">${esc(b.text)}</div></div>`,
    )
    .join('')

  const panel = el(`
    <div class="backlog">
      <div class="backlog-head">
        <span class="head" style="margin:0">履歴</span>
        <button class="dev-btn" data-act="close">とじる</button>
      </div>
      <div class="backlog-body">${rows || '<p class="hint">まだ何も読んでいない。</p>'}</div>
    </div>
  `)
  panel.querySelector('[data-act="close"]')!.addEventListener('click', (e) => {
    e.stopPropagation()
    panel.remove()
  })
  app.appendChild(panel)
  const body = panel.querySelector('.backlog-body') as HTMLElement
  body.scrollTop = body.scrollHeight
}
