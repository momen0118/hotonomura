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
const seen = new Set()
const once = async (key, name) => {
  if (seen.has(key)) return
  seen.add(key)
  await shot(name)
}

await shot('01-title')
await page.click('[data-act="new"]')
await page.waitForTimeout(400)
await shot('02-name')
await page.click('[data-act="ok"]')
await page.waitForTimeout(500)

let steps = 0
let packed = false
while (steps < 1200) {
  steps++

  if (await page.$('.backlog')) {
    await once('backlog', '25-backlog')
    await page.click('.backlog [data-act="close"]')
    await page.waitForTimeout(200)
    continue
  }

  if (await page.$('.dev-panel')) {
    await page.click('.dev-panel [data-act="close"]')
    continue
  }

  if (await page.$('[data-act="title"]')) {
    await shot('90-slice-end')
    break
  }

  // リュック詰め: 固定枠(スマホ)以外から4つ選ぶ
  const packGo = await page.$('[data-act="go"]')
  if (packGo && !packed) {
    const rows = await page.$$('.pack-item:not(.fixed)')
    for (const i of [0, 2, 4, 7]) await rows[i].click()
    await shot('03-packing')
    await packGo.click()
    packed = true
    await page.waitForTimeout(500)
    continue
  }

  const choices = await page.$$('.choices .btn')
  if (choices.length) {
    await once('choice', '20-choice')
    await choices[0].click()
    await page.waitForTimeout(200)
    continue
  }

  const night = await page.$('.diary-screen [data-act="close"]')
  if (night) {
    await once('diary' + seen.size, '40-diary-' + seen.size)
    await night.click()
    await page.waitForTimeout(500)
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
    await once('place', '30-place-select')
    await places[0].click()
    await page.waitForTimeout(300)
    continue
  }

  const scene = await page.$('.scene')
  if (scene) {
    if (!seen.has('scene')) {
      await page.waitForTimeout(900)
      await once('scene', '10-op')
    }
    const log = await page.$('[data-act="log"]')
    if (log && !seen.has('hud')) {
      await page.waitForTimeout(900)
      await once('hud', '11-scene')
      // 履歴が開けるか一度だけ確かめる
      await log.click()
      await page.waitForTimeout(300)
      continue
    }
    await scene.click({ position: { x: 195, y: 300 } })
    await page.waitForTimeout(80)
    continue
  }

  await page.waitForTimeout(150)
}

// 「捧げると世界と日記から一斉に欠ける」が効いているかを確認する。
await page.click('.dev button')
await page.waitForTimeout(300)
for (const label of ['タロ', 'おまけのコーラ']) {
  await page.click(`.dev-tag:has-text("${label}")`)
  await page.waitForTimeout(250)
}
await shot('91-dev-panel')
await page.click('.dev-panel [data-role="misc"] .btn')
await page.waitForTimeout(600)
await shot('92-diary-redacted')

const redacted = await page.$$eval('.entry-lost', (n) => n.map((x) => x.textContent))
const lostPhotos = await page.$$eval('.photo.lost', (n) => n.length)
const bodyText = await page.$eval('.diary-screen', (n) => n.innerText)

console.log('黒塗りされた行(たこ焼き型):', redacted)
console.log('糊の跡だけになった写真:', lostPhotos)
console.log('「タロ」が本文に残っているか(生き物型なら消えているはず):', bodyText.includes('タロ'))
console.log('steps:', steps)
console.log('errors:', errors.length ? errors : 'none')
await browser.close()

const fail = []
if (steps >= 1200) fail.push('通しで終端に到達しませんでした')
if (errors.length) fail.push('JSエラーあり')
if (redacted.length === 0) fail.push('たこ焼き型の黒塗りが効いていません')
if (lostPhotos === 0) fail.push('写真の消失が効いていません')
if (bodyText.includes('タロ')) fail.push('生き物型(行ごと消える)が効いていません')
if (fail.length) {
  console.error('NG:', fail.join(' / '))
  process.exit(1)
}
console.log('OK')
