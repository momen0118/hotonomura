import { app, el, esc, wait } from '../ui/dom'
import { setBg } from '../ui/stage'
import { fill, visibleLine } from '../core/content'
import { applySet, SLOT_LABEL, SLOT_ORDER } from '../core/state'
import type { ChoiceDef, GameEvent, GameState, Line } from '../core/types'

interface Frame {
  lines: Line[]
  i: number
}

/** 上部の 朝/昼/夕 インジケータ */
function slotBar(state: GameState): string {
  const dots = SLOT_ORDER.map(
    (s) => `<span class="dot ${SLOT_ORDER.indexOf(s) <= SLOT_ORDER.indexOf(state.slot) ? 'on' : ''}"></span>`,
  ).join('')
  return `<div class="slotbar"><span>${state.day}日目 ${SLOT_LABEL[state.slot]}</span>${dots}</div>`
}

export async function playScene(state: GameState, ev: GameEvent): Promise<void> {
  const scene = el(`
    <div class="scene">
      ${slotBar(state)}
      <div class="textbox">
        <div class="speaker" hidden></div>
        <div class="body"></div>
        <div class="next-mark" hidden></div>
      </div>
    </div>
  `)
  app.appendChild(scene)

  const box = scene.querySelector('.textbox') as HTMLElement
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
    if (line.set) applySet(state, line.set)
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
        (c) => visibleLine(state, { if: c.if }) && (!c.needItem || state.inventory.includes(c.needItem)),
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
  const raw = fill(state, (isTalk ? line.t : line.n) ?? '')
  const text = isTalk && !line.thought ? `「${raw}」` : raw

  if (isTalk && line.c) {
    speakerEl.hidden = false
    speakerEl.textContent = fill(state, line.c)
  } else {
    speakerEl.hidden = true
  }
  bodyEl.classList.toggle('thought', !!line.thought)

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
      const mark = opt.draft && state.settings.showDraftMarks ? ' <span style="opacity:.5">〔仮〕</span>' : ''
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
