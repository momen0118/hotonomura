// ゲーム全体で使う型の定義。
// 設計の根っこ: あらゆる要素が tags を持ち、そのタグが「捧げられた」瞬間に
// 世界からも日記からも一斉に欠ける(SPEC.md §3)。後付けできないので最初から通す。

export type Slot = 'morning' | 'noon' | 'evening'

/** シーンを構成する1行。用途に応じてフィールドを使い分ける。 */
export interface Line {
  /** 地の文(ナレーション) */
  n?: string
  /** 話者名。t とセットで使う */
  c?: string
  /** 台詞 */
  t?: string
  /** 心の声(鉤括弧をつけずに出す) */
  thought?: boolean
  /** 背景の切り替え */
  bg?: string
  /** 画面全体の演出(white=白む, flash, shake など) */
  fx?: string
  /** この行が属するタグ。捧げられたタグを含む行は世界から消える */
  tags?: string[]
  /** Fable の確定稿待ちの仮テキスト */
  draft?: boolean
  /** 日記に一行足す */
  diary?: DiaryEntryDef
  /** その日の写真を決める */
  photo?: PhotoDef
  /** フラグを立てる */
  set?: Record<string, string | number | boolean>
  /** 表示条件。"flagName" または "!flagName" */
  if?: string
  /** 選択肢 */
  choice?: ChoiceDef[]
  /** データ側に残す覚え書き。表示されない */
  comment?: string
  /** 場所の解放 */
  unlock?: string[]
  /** 持ち物の取得 */
  gain?: string[]
}

export interface ChoiceDef {
  label: string
  draft?: boolean
  /** 選ぶと再生される入れ子のシーン */
  lines?: Line[]
  set?: Record<string, string | number | boolean>
  /** 表示条件 */
  if?: string
  /** 必要な持ち物 */
  needItem?: string
}

/**
 * 日記の一行。「日記の文法」(FABLE_ANSWERS.md)をそのまま構造にしてある。
 * 事実文と感情文を分けて持つのは、黒塗りの効き方が両者で違うため。
 */
export interface DiaryEntryDef {
  /** 事実文。供物対象の名前はここにだけ入れる(1文1タグ) */
  fact: string
  /** 感情文。タグも代名詞も持たない。黒塗り後、宛先のない感情だけが残る */
  feeling?: string
  tags?: string[]
  /**
   * 捧げられたときの欠け方。
   * redact = たこ焼き型: 事実文だけが黒く塗られ、感情文は残る(供物が物・体験)
   * remove = 生き物型: 行が丸ごと消えて、その日が縮む(供物が生き物・人との関係)
   */
  lost?: 'redact' | 'remove'
  draft?: boolean
}

export interface PhotoDef {
  id: string
  /** 写真の説明。絵ができるまではこの一行が写真の代わり */
  caption: string
  tags?: string[]
  draft?: boolean
}

export interface GameEvent {
  id: string
  /** fixed=固定イベント / ambient=その場所の何気ない日常 */
  kind: 'fixed' | 'ambient'
  day?: number
  slot?: Slot
  place: string
  /** このイベント自体のタグ。捧げられると丸ごと起きなくなる */
  tags?: string[]
  /** 表示条件 */
  if?: string
  /** 一周のあいだ一度きり */
  once?: boolean
  script: Line[]
}

export interface Place {
  id: string
  name: string
  /** 場所選択ボタンの文言。行動形に統一する(「家でごろごろ」「商店に行く」) */
  label: string
  /** 場所選択の画面に出る一言 */
  hint?: string
  bg: string
  /** 最初から選べるか */
  initial?: boolean
  tags?: string[]
  draft?: boolean
}

export interface Item {
  id: string
  name: string
  /** 冒頭のリュック詰め画面に出る一行説明 */
  desc: string
  tags: string[]
  /** 外せない品(スマホ)。並ぶが選択枠を消費しない */
  fixed?: boolean
  /** 将来の「机にばらっと並んだ一枚絵」でのホットスポット位置(%) */
  spot?: { x: number; y: number }
  draft?: boolean
}

export interface DaySlotDef {
  /** 選択の余地なくこの場所へ行く日 */
  locked?: string
  /** 選べる場所。省略時は解放済みの全場所 */
  places?: string[]
}

export interface DayDef {
  day: number
  date: string
  slots: Record<Slot, DaySlotDef>
}

/** 日記の1ページ。周回をまたいで持ち越される(SPEC.md §3) */
export interface DiaryPage {
  day: number
  date: string
  /** 何周目に書かれたページか */
  loop: number
  photo: PhotoDef | null
  entries: DiaryEntryDef[]
  /** プレイヤー(ソラ)が白紙に自分で書き足した行かどうか */
  handwritten?: boolean
}

export interface GameState {
  version: number
  playerName: string
  /** 周回数。1周目は 1 */
  loop: number
  day: number
  slot: Slot
  /** リュックの中身(item id) */
  inventory: string[]
  /** 選ばれなかった=村に来ていない持ち物 */
  leftBehind: string[]
  /** 捧げられたタグ。ここに入った瞬間、世界と日記から一斉に欠ける */
  sacrificed: string[]
  /** 解放済みの場所 */
  places: string[]
  diary: DiaryPage[]
  flags: Record<string, string | number | boolean>
  /** 消化済みイベント(once 用) */
  seenEvents: string[]
  /** その日ぶんの日記の下書き。夜に1ページへまとめる */
  todayEntries: DiaryEntryDef[]
  todayPhoto: PhotoDef | null
  /** 乱数の種。周回ごとに揺らぎを作る */
  seed: number
  settings: {
    /** 仮テキストの印を表示するか(開発用) */
    showDraftMarks: boolean
    textSpeed: number
  }
}
