// 縦切りを頭から終わりまで自動でクリックして通す確認スクリプト。
// 使い方: npm run build && node scripts/smoke.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.env.SHOT_DIR ?? '/tmp/hotonomura-shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await page.goto('file://' + resolve(process.env.TARGET ?? 'dist/index.html'))
await page.waitForTimeout(600)

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })

await shot('01-title')

// はじめから
await page.click('[data-act="new"]')
await page.waitForTimeout(400)
await shot('02-name')
await page.click('[data-act="ok"]')
await page.waitForTimeout(400)

// 持ち物を5つ選ぶ
const items = await page.$$('.pack-item')
for (const i of [0, 1, 3, 5, 8]) await items[i].click()
await shot('03-packing')
await page.click('[data-act="go"]')
await page.waitForTimeout(1600)

// あとはひたすら進める
let steps = 0
const seen = new Set()
while (steps < 900) {
  steps++

  if (await page.$('.dev-panel')) {
    await page.click('.dev-panel [data-act="close"]')
    continue
  }

  const end = await page.$('[data-act="title"]')
  if (end) {
    await shot('90-slice-end')
    break
  }

  const choices = await page.$$('.choices .btn')
  if (choices.length) {
    if (!seen.has('choice')) {
      seen.add('choice')
      await shot('20-choice')
    }
    await choices[0].click()
    await page.waitForTimeout(200)
    continue
  }

  const night = await page.$('.diary-screen [data-act="close"]')
  if (night) {
    const key = 'diary-' + seen.size
    if (!seen.has('diary1') || !seen.has('diary2')) {
      seen.add(seen.has('diary1') ? 'diary2' : 'diary1')
      await shot('40-' + key)
    }
    await night.click()
    await page.waitForTimeout(400)
    continue
  }

  const nextBtn = await page.$('[data-act="next"]')
  if (nextBtn) {
    await nextBtn.click()
    await page.waitForTimeout(200)
    continue
  }

  const places = await page.$$('.stack .btn[data-place]')
  if (places.length) {
    if (!seen.has('place')) {
      seen.add('place')
      await shot('30-place-select')
    }
    await places[0].click()
    await page.waitForTimeout(300)
    continue
  }

  const scene = await page.$('.scene')
  if (scene) {
    if (!seen.has('scene')) {
      seen.add('scene')
      await page.waitForTimeout(900)
      await shot('10-scene')
    }
    await scene.click({ position: { x: 195, y: 300 } })
    await page.waitForTimeout(90)
    continue
  }

  await page.waitForTimeout(150)
}

// 「捧げると世界と日記から一斉に欠ける」が効いているかを確認する。
await page.click('.dev button')
await page.waitForTimeout(300)
for (const label of ['タロ', 'ナツ', '持ち物: 読みかけの文庫']) {
  await page.click(`.dev-tag:has-text("${label}")`)
  await page.waitForTimeout(250)
}
await shot('91-dev-panel')
await page.click('.dev-panel [data-role="misc"] .btn')
await page.waitForTimeout(500)
await shot('92-diary-redacted')

const redacted = await page.$$eval('.entry-lost', (n) => n.map((x) => x.textContent))
const lostPhotos = await page.$$eval('.photo.lost', (n) => n.length)
console.log('黒塗りされた行:', redacted)
console.log('糊の跡だけになった写真:', lostPhotos)

console.log('steps:', steps)
console.log('errors:', errors.length ? errors : 'none')
await browser.close()
if (redacted.length === 0 || lostPhotos === 0) {
  console.error('黒塗り/写真消失が効いていません')
  process.exit(1)
}
if (errors.length) process.exit(1)
if (steps >= 900) {
  console.error('通しで終端に到達しませんでした')
  process.exit(1)
}
