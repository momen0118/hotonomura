import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const css = readFileSync('src/style.css', 'utf8')
const bgs = ['room','bus','busstop','house','engawa_night','shop','park','park_evening','river','road','title']
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
body{margin:0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px;background:#111}
.cell{position:relative;height:210px;border-radius:6px;overflow:hidden}
.cell .bg{position:absolute;inset:0}
.cap{position:absolute;left:6px;bottom:6px;z-index:2;font:12px sans-serif;color:#fff;text-shadow:0 1px 3px #000}
</style></head><body><div class="grid">
${bgs.map(b=>`<div class="cell"><div class="bg bg-${b}"></div><span class="cap">${b}</span></div>`).join('')}
</div></body></html>`
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 })
await page.setContent(html)
await page.waitForTimeout(300)
await page.screenshot({ path: '/tmp/hotonomura-shots/00-backgrounds.png', fullPage: true })
await browser.close()
console.log('ok')
