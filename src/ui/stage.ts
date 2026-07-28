import { app, el, raf, wait } from './dom'

// 背景の一枚板。クロスフェードだけ担当する。
let root: HTMLElement | null = null
let current: HTMLElement | null = null
let currentId = ''

function ensure(): HTMLElement {
  if (!root) {
    root = el('<div class="stage"></div>')
    app.appendChild(root)
  }
  return root
}

export async function setBg(id: string): Promise<void> {
  if (id === currentId) return
  const stage = ensure()
  const next = el(`<div class="bg bg-${id}" style="opacity:0"></div>`)
  stage.appendChild(next)
  await raf()
  next.style.opacity = '1'
  const prev = current
  current = next
  currentId = id
  if (prev) {
    prev.style.opacity = '0'
    await wait(700)
    prev.remove()
  }
}

export function currentBg(): string {
  return currentId
}
