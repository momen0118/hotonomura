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
let packCount = 0
const MAX_STEPS = 6000
while (steps < MAX_STEPS) {
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

  // ED到達(おわり画面)。実物受理も残weight≤8も通常は起きないが、来たら記録して抜ける。
  if (await page.$('[data-act="title"]')) {
    await shot('95-ending-card')
    break
  }

  // リュック詰め: 固定枠(スマホ)以外から4つ選ぶ。巻き戻し後のOPでも毎回やり直す。
  // 各周のOPで出るので、packCount で周を数える。loop1+loop2 を通したら(3周目のOP)止める。
  const packGo = await page.$('[data-act="go"]')
  if (packGo) {
    packCount++
    if (packCount >= 3) {
      await shot('93-loop2-end')
      break
    }
    const rows = await page.$$('.pack-item:not(.fixed)')
    for (const i of [0, 2, 4, 7]) await rows[i].click()
    if (!packed) {
      await shot('03-packing')
      packed = true
    }
    await packGo.click()
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
    await places[steps % places.length].click()
    await page.waitForTimeout(300)
    continue
  }

  // 祭りの屋台えらび。買えるものから順に、なくなるまで回る。
  const leave = await page.$('[data-act="leave"]')
  if (leave) {
    await once('stalls', '50-stalls')
    const buyable = await page.$$('.stack .btn:not([disabled])')
    if (buyable.length) {
      await buyable[0].click()
    } else {
      await leave.click()
    }
    await page.waitForTimeout(300)
    continue
  }

  // 場所として祠に入ったとき(2周目以降)は、何もせず出る。
  // ここで捧げる/焼くと周回の日記状態が乱れるので、ささげない→帰るで抜ける。
  // 焼き込みの確認は、通しのあと確認用パネルの「祠をひらく」で別途行う。
  if (await page.$('.shrine')) {
    await once('offer', '60-offer')
    const none = await page.$('.shrine .offer-none')
    if (none) {
      await none.click()
      await page.waitForTimeout(200)
    }
    const leave = await page.$('.shrine [data-act="leave"]')
    if (leave) {
      await leave.click()
      await page.waitForTimeout(200)
    }
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
    // 日記オープン(§4.1)はフェード後にDOMへ載るので、ループ先頭の日記チェックが
    // 一瞬すり抜けることがある。scene クリックがフェードイン中の日記に覆われても
    // 30秒ハングしないよう短いタイムアウトで諦め、次周で日記を閉じさせる。
    await scene.click({ position: { x: 195, y: 300 }, timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(80)
    continue
  }

  await page.waitForTimeout(150)
}

// 黒塗り規則v2: 行は消さない。日は縮まない。塗るのは指定された語だけ。
const openDiaryFromDev = async () => {
  await page.click('.dev button')
  await page.waitForTimeout(300)
  await page.click('.dev-panel [data-role="misc"] .btn')
  await page.waitForTimeout(500)
}

await openDiaryFromDev()
const before = {
  lines: await page.$$eval('.entries li', (n) => n.length),
  text: await page.$eval('.diary-screen', (n) => n.innerText),
}
await page.click('.diary-screen [data-act="close"]')
await page.waitForTimeout(300)

await page.click('.dev button')
await page.waitForTimeout(300)
// 席料としてすでに捧げ済みのものを押すと、逆に手元へ戻ってしまう。まだ手元にあるものだけ押す。
for (const label of ['タロ', 'おまけのコーラ']) {
  const row = await page.$(`.dev-tag:has-text("${label}")`)
  if (!row) continue
  if ((await row.innerText()).includes('手元にある')) {
    await row.click()
    await page.waitForTimeout(250)
  }
}
await shot('91-dev-panel')
await page.click('.dev-panel [data-role="misc"] .btn')
await page.waitForTimeout(600)
await shot('92-diary-redacted')

const after = {
  lines: await page.$$eval('.entries li', (n) => n.length),
  text: await page.$eval('.diary-screen', (n) => n.innerText),
}
const inked = await page.$$eval('.ink', (n) => n.map((x) => x.textContent))
const lostPhotos = await page.$$eval('.photo.lost', (n) => n.length)

console.log('日記の行数 捧げる前/後:', before.lines, '/', after.lines)
console.log('■化された語:', inked)
console.log('糊の跡だけになった写真:', lostPhotos)
console.log('「タロ」が本文に残っているか:', after.text.includes('タロ'))
console.log('「コーラ」が本文に残っているか:', after.text.includes('コーラ'))
console.log('「距離が近い。」の残存数:', (after.text.match(/距離が近い。/g) ?? []).length)
for (const line of after.text.split('\n')) {
  if (/コーラ|タロ/.test(line)) console.log('  残っている行:', JSON.stringify(line))
}
// 直前の黒塗り確認で開いた日記を閉じてから祠へ
if (await page.$('.diary-screen [data-act="close"]')) {
  await page.click('.diary-screen [data-act="close"]')
  await page.waitForTimeout(300)
}

// 再生中の scene(到着・決心・翌朝テキスト)を最後まで読み飛ばすヘルパ。
// .shrine ルートは焼却中も空のまま残るので「.scene が消えるまで」で待つ。
// 決心→(間)→翌朝 のように scene が途切れて再開するので、数回連続で空になるまで粘る。
const clickThroughScenes = async () => {
  let empties = 0
  for (let k = 0; k < 60; k++) {
    const sc = await page.$('.scene')
    if (sc) {
      empties = 0
      await sc.click({ position: { x: 195, y: 300 } })
    } else {
      empties++
      if (empties >= 4) break
    }
    await page.waitForTimeout(180)
  }
  await page.waitForTimeout(300)
}

// 祠をひらいてページを1枚焼けるか(綴じの反対側も抜けるか)を確認する。
// 一晩一件なので、焼くと祠は自動で閉じ、確認用パネルに戻る。
await page.click('.dev button')
await page.waitForTimeout(300)
await page.click('.dev-panel .btn:has-text("祠をひらく")')
await page.waitForTimeout(400)
await clickThroughScenes() // 到着テキスト
const shrineOpened = !!(await page.$('.shrine'))
await shot('70-shrine')
const burn = await page.$('.offer-item')
let tornCount = 0
if (burn) {
  const box = await burn.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1050)
  await page.mouse.up()
  await page.waitForTimeout(400)
  await clickThroughScenes() // 決心の独白→焼いた翌朝テキスト(祠は閉じる)
  await shot('71-shrine-burned')
  // 焼くと祠は閉じてパネルに戻る。日記側で焦げ縁ページを数える。
  if (await page.$('.dev-panel')) {
    await page.click('.dev-panel .btn:has-text("日記を読む")')
    await page.waitForTimeout(500)
    tornCount = await page.$$eval('.page.torn', (n) => n.length)
    await shot('72-diary-torn')
  }
}

console.log('祠が開いたか:', shrineOpened)
console.log('焼いたあとの torn ページ数(日単位で1件・1以上を期待):', tornCount)
console.log('steps:', steps)
console.log('errors:', errors.length ? errors : 'none')
await browser.close()

const fail = []
if (!shrineOpened) fail.push('祠が開かない')
if (tornCount < 1) fail.push('祠でページを焼いても torn になっていない')
if (steps >= MAX_STEPS) fail.push('通しで終端に到達しませんでした')
if (errors.length) fail.push('JSエラーあり')
if (before.lines !== after.lines) fail.push('行が消えている(v2では行は消さない)')
if (inked.length === 0) fail.push('■化が効いていません')
if (lostPhotos === 0) fail.push('写真の消失が効いていません')
if (after.text.includes('タロ')) fail.push('生き物型の■化が漏れています')
if (after.text.includes('コーラ')) fail.push('たこ焼き型の■化が漏れています')
if (!after.text.includes('距離が近い。')) fail.push('感情文が残っていません')
if (fail.length) {
  console.error('NG:', fail.join(' / '))
  process.exit(1)
}
console.log('OK')
