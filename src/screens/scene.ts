import { app, el, esc, wait } from '../ui/dom'
import { setBg } from '../ui/stage'
import { fill, getEvent, visibleLine } from '../core/content'
import { hashString, mulberry32 } from '../core/rng'
import { applySet, SLOT_LABEL, SLOT_ORDER } from '../core/state'
import type { ChoiceDef, GameEvent, GameState, Line } from '../core/types'

interface Frame {
  lines: Line[]
  i: number
}

/**
 * 既読の行。読み返し用。セーブには含めない(その場のログ)。
 * 台詞の鉤括弧は表示上つけない方針なので、ここでも話者名で区別する。
 */
const backlog: { speaker: string | null; text: string }[] = []
const BACKLOG_MAX = 200

function slotBar(state: GameState, here: string): string {
  const dots = SLOT_ORDER.map(
    (s) =>
      `<span class="dot ${SLOT_ORDER.indexOf(s) <= SLOT_ORDER.indexOf(state.slot) ? 'on' : ''}"></span>`,
  ).join('')
  return `
    <div class="hud">
      <div class="slotbar"><span>${state.day}日目 ${SLOT_LABEL[state.slot]}</span>${dots}</div>
      <div class="here" ${here ? '' : 'hidden'}>${esc(here)}</div>
      <button class="dev-btn" data-act="log">履歴</button>
    </div>
  `
}

export async function playScene(
  state: GameState,
  ev: GameEvent,
  opts: { hud?: boolean; here?: string } = {},
): Promise<void> {
  const hud = opts.hud !== false
  const scene = el(`
    <div class="scene">
      ${hud ? slotBar(state, opts.here ?? '') : ''}
      <div class="textbox">
        <div class="speaker" hidden></div>
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
    if (line.here && hereEl) {
      hereEl.textContent = line.here
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

  // 話者名は毎行かならず入れ替える。地の文・独白では空にして隠す(残留対策)
  speakerEl.textContent = speaker ?? ''
  speakerEl.hidden = speaker === null
  bodyEl.classList.toggle('talk', isTalk && !line.thought)
  bodyEl.classList.toggle('thought', !!line.thought)

  backlog.push({ speaker, text })
  if (backlog.length > BACKLOG_MAX) backlog.shift()

  // 仮テキストの印。Fable の確定稿待ちが一目でわかるようにしておく(開発用)。
  box.querySelector('.draft-mark')?.remove()
  if (line.draft && state.settings.showDraftMarks) {
    box.appendChild(el('<div class="draft-mark">仮</div>'))
  }

  return new Promise((resolve) => {
    let idx = 0
    let done = false
    nextEl.hidden = true
    bodyEl.textContent = ''

    const finish = () => {
      done = true
      bodyEl.textContent = text
      nextEl.hidden = false
      clearInterval(timer)
    }

    const timer = setInterval(() => {
      idx++
      bodyEl.textContent = text.slice(0, idx)
      if (idx >= text.length) finish()
    }, Math.max(6, state.settings.textSpeed))

    const onTap = () => {
      if (document.querySelector('.backlog')) return
      if (!done) {
        finish()
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
  })
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
  const rows = backlog
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
