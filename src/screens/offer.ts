import { app, clearScreens, el, esc } from '../ui/dom'
import { getItem } from '../core/content'
import { sacrifice } from '../core/tags'
import { weightOfTags } from '../core/harvest'
import { save } from '../core/state'
import type { GameState, Item, Line } from '../core/types'
import { renderPage } from './diary'
import { playScene } from './scene'
import offerLinesJson from '../data/offer_lines.json'

// 捧げ独白(FABLE_ANSWERS_7 §4・確定稿)。
//   accept  = 受理。出口が開き、石の焦げがひとつ濃くなる(外の熟成品)。
//   reject  = 非受理。灰にもならず残る。出口は開かない(夏期講習テキスト・結晶キット)。
//   village = 村の水の実物。燃えるが出口は開かず、石も変わらない(ぽやぽや)。
const OFFER_LINES = offerLinesJson as unknown as Record<
  string,
  { kind: 'accept' | 'reject' | 'village'; lines: string[]; morning?: string[] }
>
const ACCEPT_MORNING = (offerLinesJson as { _accept_morning: string })._accept_morning

/**
 * 祠(FABLE_ANSWERS_6 §4)。日記帳がそのまま開く。見出しは「なにを、おいていきますか」。
 *
 * ・村の思い出のページを破る(長押し)= 焼く。破いた一日ぶんが灰になり、破り縁は焦げる。
 *   これは村への好き総量を減らすが、出口は開かない(自分の畑の作物で家賃は払えない)。
 *   ※「綴じの反対側も抜ける」挙動は日付固定のフリーノートでは意味をなさないため撤去(FABLE_ANSWERS_15 §1)。
 * ・「ささげない」→ 帰る / リュックをあける。持ち込んだ実物を差し出すと出口が開く。
 *   「リュックをあける」は棚+餌の台詞の二重フラグ(3周目〜)で出る。
 *   リュック欄の末尾には、村で拾った小物(FABLE_ANSWERS_15 §4)も並ぶ——差し出すと灰になるが、出口は開かない。
 *
 * 実物の捧げ独白は FABLE_ANSWERS_7 §4 の確定稿(src/data/offer_lines.json)。
 * 祠そのものの演出テキスト(見出し以外)はまだ仮文言。
 */
const PRESS_MS = 900

// 村で拾った小物(FABLE_ANSWERS_15 §4)。ぽやぽや獲得機会が消える周のミスリード教材の補充。
// リュック欄の末尾に「持ち物」として並ぶ。その周に入手した(=フラグが立っている)ものだけ。
// 差し出すと燃えて灰になるが、出口は開かず、石の焦げも変わらない(村の水)。
const TRINKETS: { flag: string; tag: string; label: string }[] = [
  { flag: 'has_nukegara', tag: 'fun:nukegara', label: '蝉のぬけがら' },
  { flag: 'has_biidama', tag: 'fun:matsuri_ramune', label: 'ラムネのビー玉' },
  { flag: 'has_ishikoro', tag: 'fun:ishizumi', label: '川原の石ころ' },
]

// 村産小物を捧げたときの独白(FABLE_ANSWERS_15 §4・共通・確定稿)。
// ぽやぽや専用の独白(第7便)は poyapoya の所持周のみ使用。ここは小物の共通文。
// FABLE_ANSWERS_16 §1 で夜(窪みに置く)と翌朝(灰になっていた)に分割。
const TRINKET_EVENING: string[] = ['窪みに置いた。']
const TRINKET_MORNING: string[] = ['朝、灰になっていた。', '石の焦げは、変わっていなかった。']

// 到着時の定型テキスト(FABLE_ANSWERS_11 §5)。毎回出す。
const ARRIVE_LINES: Line[] = [
  { bg: 'shrine' },
  { n: '祠は、今日も掃除されていた。' },
  { n: 'くぼみの黒が、前より濃いのかどうか、見るたびにわからなくなる。' },
]

// 初回のページ破りの前に一度だけ出す決心の独白(FABLE_ANSWERS_12 §5.2)。
const RESOLVE_LINES: Line[] = [
  { n: '黒く塗られた日記と、紙の灰の残るくぼみ。' },
  { n: 'つながっているのかは、わからない。' },
  { n: 'でも、この村で紙を焼く場所を、ほかに知らない。' },
  { n: 'ためしてみる。' },
  { n: 'どのページなら、破けるか。' },
  { n: '……どのページも、破きたくなかった。' },
  { n: 'それでも、一枚。' },
]

/**
 * 祠の一覧(root)を隠したうえで、その上に scene を再生する。
 * root を DOM に残したまま playScene すると、空の祠パネルがタップを吸ってしまい、
 * 独白・翌朝テキストを送れなくなる。再生中だけ隠して、終わったら戻す。
 */
async function playShrineScene(state: GameState, root: HTMLElement, lines: Line[]): Promise<void> {
  root.style.display = 'none'
  await playScene(state, { id: 'shrine_seq', kind: 'fixed', place: 'shrine', script: lines }, { hud: false })
  root.style.display = ''
}

export async function shrineScreen(state: GameState): Promise<void> {
  clearScreens()
  await playScene(state, { id: 'shrine_arrive', kind: 'fixed', place: 'shrine', script: ARRIVE_LINES }, { hud: false })
  return new Promise((resolve) => {
    const root = el('<div class="diary-screen shrine"></div>')
    app.appendChild(root)

    const done = () => {
      root.remove()
      resolve()
    }

    // 一晩一件(FABLE_ANSWERS_12 §5.3)。今日すでに置いた日は、もう捧げられない。
    if (state.flags.shrine_offer_day === state.day) showUsedToday(state, root, done)
    else showBurnList(state, root, done)
  })
}

/** その日すでに一件置いたあとの祠。窪みはひとつ、一晩に一件。 */
function showUsedToday(state: GameState, root: HTMLElement, done: () => void): void {
  root.innerHTML = ''
  root.appendChild(
    el(`
    <div class="offer-head">
      <p class="offer-title">祠のまえ</p>
      <p class="hint">今夜は、これでいい。窪みには、もう今夜のぶんがある。</p>
    </div>
  `),
  )
  const body = el('<div class="offer-body"></div>')
  root.appendChild(body)
  const leave = el('<button class="btn" data-act="leave">帰る</button>')
  leave.addEventListener('click', done)
  body.appendChild(leave)
}

/** 村の思い出のページ一覧。焼くと綴じの反対側も抜ける。 */
function showBurnList(state: GameState, root: HTMLElement, done: () => void): void {
  root.innerHTML = ''
  const head = el(`
    <div class="offer-head">
      <p class="offer-title">なにを、おいていきますか</p>
      <p class="hint">ページを長押しで破ります。破いた一日ぶんが、灰になります。</p>
    </div>
  `)
  root.appendChild(head)

  const body = el('<div class="offer-body"></div>')
  root.appendChild(body)

  // 最上段は必ず「ささげない」
  const none = el('<button class="btn btn-primary offer-none">ささげない</button>')
  none.addEventListener('click', () => showExit(state, root, done))
  body.appendChild(none)

  const pages = state.diary.filter((p) => !p.torn)
  if (pages.length === 0) {
    body.appendChild(el('<p class="hint" style="text-align:center">焼けるページが、もうない。</p>'))
  }

  state.diary.forEach((page, i) => {
    if (page.torn) return
    const wrap = el('<div class="offer-page"></div>')
    wrap.appendChild(renderPage(state, page))
    const btn = el(`
      <button class="btn offer-item">
        <span class="fill"></span>
        <span class="txt">このページを破る</span>
      </button>
    `)
    longPress(btn, () => void burnFlow(state, i, root, done))
    wrap.appendChild(btn)
    body.appendChild(wrap)
  })
}

/** ページを焼く→翌朝の確認テキスト(値切り不成立・3段階)。一晩一件なので、置いたら閉じる。 */
async function burnFlow(state: GameState, index: number, root: HTMLElement, done: () => void): Promise<void> {
  // 初回のページ破りの前に、決心の独白(§5.2)。
  if (!state.flags.burn_resolved) {
    state.flags.burn_resolved = true
    await playShrineScene(state, root, RESOLVE_LINES)
  }
  // 焼く前にこのページのweightを測り、納税(ノルマ充当)に積む(13 §1)。
  const burnedWeight = weightOfTags((state.diary[index]?.entries ?? []).flatMap((e) => e.tags ?? []))
  burnPage(state, index)
  state.flags.loop_burned_weight = (Number(state.flags.loop_burned_weight) || 0) + burnedWeight
  const n = (Number(state.flags.burn_ack_count) || 0) + 1
  state.flags.burn_ack_count = n
  // この周で焼いた回数(ナツの昔話の条件・12b §4)。2回以上で burns2。
  const loopBurns = (Number(state.flags.loop_burns) || 0) + 1
  state.flags.loop_burns = loopBurns
  if (loopBurns >= 2) state.flags.burns2 = true
  state.flags.shrine_offer_day = state.day // 一晩一件(§5.3)
  // 「朝、たしかめに行った」は同日には出さず、翌朝コマ選択前に強制再生する(FABLE_ANSWERS_16 §1)。
  state.pendingMorning = burnMorningLines(n)
  save(state)
  done()
}

/** 焼いた回数が増えるほど短くなる=疲弊の表現。この短文化以外に疲弊の説明を足さない。 */
function burnMorningLines(n: number): string[] {
  if (n === 1) {
    return ['朝、たしかめに行った。', 'ページは、灰になっていた。', '石の焦げは、変わっていなかった。', 'なにも、変わっていなかった。']
  }
  if (n <= 3) {
    return ['また、灰になっただけだった。', '神様がいるなら、味の感想くらい言ってほしい。']
  }
  return ['灰。', 'それだけ。']
}

/** 「ささげない」のあと。帰る、または(棚を見ていれば)リュックをあける。 */
function showExit(state: GameState, root: HTMLElement, done: () => void): void {
  root.innerHTML = ''
  root.appendChild(el('<div class="offer-head"><p class="offer-title">祠のまえ</p></div>'))

  const body = el('<div class="offer-body"></div>')
  root.appendChild(body)

  const leave = el('<button class="btn" data-act="leave">帰る</button>')
  leave.addEventListener('click', done)
  body.appendChild(leave)

  // 「リュックをあける」は二重フラグで解禁される(FABLE_ANSWERS_8 §1)。
  //   ① 商店の奥の棚(預かりもの)を見た   shelf_seen
  //   ② ツリさんの餌の台詞を聞いた         bait_heard(3周目・堤防で確定)
  // 実物を差し出せる状態になった時点で、プレイヤーは必ず餌の理屈を聞いている。
  if (state.flags.shelf_seen === true && state.flags.bait_heard === true) {
    const open = el('<button class="btn" data-act="bag">リュックをあける</button>')
    open.addEventListener('click', () => showBag(state, root, done))
    body.appendChild(open)
  }
}

/** リュックの実物一覧。差し出すと出口が開く(捧げて帰るEDへ)。 */
function showBag(state: GameState, root: HTMLElement, done: () => void): void {
  root.innerHTML = ''
  root.appendChild(
    el(`
    <div class="offer-head">
      <p class="offer-title">リュックのなか</p>
      <p class="hint">差し出したものは、次のバスで帰り道をひらきます。長押しで決まります。</p>
    </div>
  `),
  )
  const body = el('<div class="offer-body"></div>')
  root.appendChild(body)

  // スマホ本体(カメラ=日記の機材)は差し出せない。選ぶと分割サブメニューへ(FABLE_ANSWERS_11 §1 Q2)。
  const hasPhone = state.inventory.includes('phone') && !state.sacrificed.includes('item:phone')
  const items = state.inventory.filter(
    (id) => id !== 'phone' && !state.sacrificed.includes(`item:${id}`),
  )
  if (items.length === 0 && !hasPhone) {
    body.appendChild(el('<p class="hint" style="text-align:center">差し出せる実物がない。</p>'))
  }
  for (const id of items) {
    const item = getItem(id)
    if (!item) continue
    const btn = el(`
      <button class="btn offer-item">
        <span class="fill"></span>
        <span class="txt">${esc(item.name)}</span>
      </button>
    `)
    longPress(btn, () => void offerItem(state, item, root, done))
    body.appendChild(btn)
  }

  if (hasPhone) {
    // 本体は長押しで差し出せない。押すと「なにを置くか」を選ぶ。
    const pbtn = el('<button class="btn">スマホ<span class="sub">本体は置けない。中身を選ぶ。</span></button>')
    pbtn.addEventListener('click', () => showPhoneSplit(state, root, done))
    body.appendChild(pbtn)
  }

  // 末尾に村で拾った小物(§4)。その周に入手済みで、まだ捧げていないものだけ。
  for (const t of TRINKETS) {
    if (!state.flags[t.flag]) continue
    if (state.sacrificed.includes(t.tag)) continue
    const btn = el(`
      <button class="btn offer-item">
        <span class="fill"></span>
        <span class="txt">${esc(t.label)}<span class="sub">村で拾ったもの</span></span>
      </button>
    `)
    longPress(btn, () => void offerTrinket(state, t, root, done))
    body.appendChild(btn)
  }

  const back = el('<button class="btn" data-act="back">やめる</button>')
  back.addEventListener('click', () => showExit(state, root, done))
  body.appendChild(back)
}

/** スマホの分割(トーク履歴/音楽ライブラリ)。本体は残る=世界同期なし。喪失はED文側で拾う。 */
function showPhoneSplit(state: GameState, root: HTMLElement, done: () => void): void {
  root.innerHTML = ''
  root.appendChild(
    el(`
    <div class="offer-head">
      <p class="offer-title">スマホの、なにを</p>
      <p class="hint">本体は日記の機材だから、置けない。長押しで決まります。</p>
    </div>
  `),
  )
  const body = el('<div class="offer-body"></div>')
  root.appendChild(body)

  for (const part of [
    { key: 'phone_talk', label: 'トーク履歴' },
    { key: 'phone_music', label: '音楽ライブラリ' },
  ]) {
    const btn = el(`
      <button class="btn offer-item">
        <span class="fill"></span>
        <span class="txt">${esc(part.label)}</span>
      </button>
    `)
    longPress(btn, () => void offerPhoneSplit(state, part.key, root, done))
    body.appendChild(btn)
  }

  const back = el('<button class="btn" data-act="back">やめる</button>')
  back.addEventListener('click', () => showBag(state, root, done))
  body.appendChild(back)
}

/** スマホの中身を一つ差し出す。受理=出口が開き石の焦げが濃くなる。本体・世界は変わらない。 */
async function offerPhoneSplit(state: GameState, key: string, root: HTMLElement, done: () => void): Promise<void> {
  const data = OFFER_LINES[key]
  const lines: Line[] = (data?.lines ?? []).map((t) => ({ n: t }))
  state.exitOpen = true
  state.flags.stone_char = (Number(state.flags.stone_char) || 0) + 1
  state.flags.offered_item = key // 捧げて帰るEDの一景(トーク履歴/音楽ライブラリ)
  state.flags.shrine_offer_day = state.day // 一晩一件(§5.3)
  state.pendingMorning = [ACCEPT_MORNING] // 「朝、なくなっていた」は翌朝(FABLE_ANSWERS_16 §1)
  save(state)
  await playShrineScene(state, root, lines)
  done()
}

/**
 * 村で拾った小物を差し出す(FABLE_ANSWERS_15 §4)。村の水の実物なので、燃えて灰になるが
 * 出口は開かず、石の焦げも変わらない。ぽやぽやと同じ「村の水」の手触りを、小物でも教える。
 */
async function offerTrinket(
  state: GameState,
  t: { flag: string; tag: string; label: string },
  root: HTMLElement,
  done: () => void,
): Promise<void> {
  sacrifice(state, [t.tag])
  state.flags[t.flag] = false
  state.flags.shrine_offer_day = state.day // 一晩一件(§5.3)
  state.pendingMorning = TRINKET_MORNING // 「朝、灰になっていた」は翌朝(FABLE_ANSWERS_16 §1)
  save(state)
  await playShrineScene(state, root, TRINKET_EVENING.map((n) => ({ n })))
  done()
}

/**
 * 実物を一点、窪みに置く(FABLE_ANSWERS_7 §4)。品ごとの確定稿の独白を出し、
 * 受理/非受理/村の水で結末を分ける。受理で初めて出口が開く。
 */
async function offerItem(state: GameState, item: Item, root: HTMLElement, done: () => void): Promise<void> {
  const data = OFFER_LINES[item.id]
  const kind = data?.kind ?? 'accept'
  const lines: Line[] = (data?.lines ?? [`${item.name}を、窪みに置いた。`]).map((t) => ({ n: t }))
  let morning = data?.morning ?? []

  if (kind === 'accept') {
    // 外の熟成品。受理され、出口が開き、石の焦げがひとつ濃くなる。
    sacrifice(state, item.tags ?? [`item:${item.id}`])
    state.exitOpen = true
    state.flags.stone_char = (Number(state.flags.stone_char) || 0) + 1
    // 捧げて帰るEDの「一景」を、最後に受理された品で決める(FABLE_ANSWERS_16 §4)。
    state.flags.offered_item = item.id
    if (morning.length === 0) morning = [ACCEPT_MORNING]
  } else if (kind === 'village') {
    // 村の水の実物(ぽやぽや)。燃えるが出口は開かず、石の焦げも変わらない。
    sacrifice(state, item.tags ?? [`item:${item.id}`])
  }
  // reject(夏期講習テキスト・結晶キット)は捧げない。実物は残り、出口も開かない。
  state.flags.shrine_offer_day = state.day // 一晩一件(§5.3)。受理・非受理・村の水すべて当日を締める。
  // 「朝、たしかめに行った」ぶんは翌朝に回す(FABLE_ANSWERS_16 §1)。
  state.pendingMorning = morning
  save(state)

  await playShrineScene(state, root, lines)
  done()
}

/**
 * 一日分(1ページ)を焼く(FABLE_ANSWERS_13 §2, 13a §1)。ページ=その日の思い出の束。
 * 破れ跡(焦げ縁の耳)が残り、その日付の全タグが焼却=世界同期(12a §3)で世界からも消える。
 * ※以前の「綴じの反対側も抜ける」挙動は、フリーノート・日付固定モデルでは意味をなさないため撤去。
 */
function burnPage(state: GameState, index: number): void {
  const page = state.diary[index]
  if (!page || page.torn) return
  page.torn = true
  const tags: string[] = []
  for (const e of page.entries) {
    for (const tag of e.tags ?? []) {
      if (!state.burned.includes(tag)) state.burned.push(tag)
      tags.push(tag)
    }
  }
  // 焼却も収穫と同様に世界から消える(12a §3)。
  if (tags.length > 0) sacrifice(state, tags)
}

function longPress(btn: HTMLElement, onDone: () => void): void {
  let timer: number | null = null
  const start = (e: Event) => {
    e.preventDefault()
    btn.classList.add('pressing')
    timer = window.setTimeout(() => {
      btn.classList.remove('pressing')
      onDone()
    }, PRESS_MS)
  }
  const cancel = () => {
    btn.classList.remove('pressing')
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  btn.addEventListener('pointerdown', start)
  btn.addEventListener('pointerup', cancel)
  btn.addEventListener('pointerleave', cancel)
  btn.addEventListener('pointercancel', cancel)
}
