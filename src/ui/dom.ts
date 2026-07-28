export const app = document.getElementById('app') as HTMLElement

export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild as T
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function raf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

/** 画面を片付ける(背景と確認用ボタンは残す) */
export function clearScreens(): void {
  for (const node of Array.from(app.children)) {
    if (node.classList.contains('stage') || node.classList.contains('dev')) continue
    node.remove()
  }
}

/** 黒(または白)への暗転をはさむ。ms は片道の長さ。 */
export async function fadeThrough(
  fn: () => void | Promise<void>,
  opts: { white?: boolean; ms?: number } = {},
): Promise<void> {
  const ms = opts.ms ?? 520
  const f = el(`<div class="fade${opts.white ? ' white' : ''}"></div>`)
  f.style.transitionDuration = `${ms}ms`
  app.appendChild(f)
  await raf()
  f.classList.add('on')
  await wait(ms)
  await fn()
  await raf()
  f.classList.remove('on')
  await wait(ms)
  f.remove()
}
