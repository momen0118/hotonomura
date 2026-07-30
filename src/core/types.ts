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
  /** 画面上部の現在地表示を差し替える(「帰り道」「商店裏」など) */
  here?: string
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
  /** 別イベントの script をその場に差し込む(初回来店ブロックの共用など) */
  include?: string
  /** くじを引いてフラグを立てる。{"roll":{"flag":"hit","chance":0.5}} */
  roll?: { flag: string; chance: number }
  /** 所持金を増減する(祭りの屋台など) */
  money?: number
  /** 場所の解放 */
  unlock?: string[]
  /** 持ち物の取得 */
  gain?: string[]
  /** 全ページの日記を開く(二周目開幕など)。プレイヤーがめくって閉じると次の行へ。 */
  openDiary?: boolean
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
  /** 事実文。供物対象の名前はここにだけ入れる(1文1タグ)。感情文だけの行では省略する */
  fact?: string
  /**
   * 捧げられたときに■化する文字列。データで明示指定する(推論しない)。
   * たこ焼き型は対象語だけ、生き物型は名前+種別まで塗る——黒の面積が重さを語る。
   * 行は消さない。日は縮まない(黒塗り規則v2)。
   */
  blackout?: string
  /** 感情文。タグも代名詞も持たない。黒塗り後、宛先のない感情だけが残る */
  feeling?: string
  tags?: string[]
  draft?: boolean
  /** 予記(固定イベント分)にない出来事を、後の周で余白に書き足した行(FABLE_ANSWERS_12 §1) */
  handwritten?: boolean
  /** その行が書かれた/書き足された周。ページ日付は固定でも、行は書かれた周に属する */
  loop?: number
}

export interface PhotoDef {
  id: string
  /** 写真の説明。絵ができるまではこの一行が写真の代わり */
  caption: string
  /**
   * そもそも撮らなかった日。糊の跡は残らない(捧げて消えた欠損と見分けがつくこと)。
   */
  none?: boolean
  tags?: string[]
  draft?: boolean
}

export interface GameEvent {
  id: string
  /**
   * fixed   = 固定イベント
   * ambient = その場所の何気ない日常
   * prelude = そのコマの本編の手前に差し込まれる短い断片(体の記憶の空振りなど)
   */
  kind: 'fixed' | 'ambient' | 'prelude'
  day?: number
  slot?: Slot
  place: string
  /** このイベント自体のタグ。捧げられると丸ごと起きなくなる */
  tags?: string[]
  /** 表示条件 */
  if?: string
  /** 一周のあいだ一度きり */
  once?: boolean
  /** 絵の発注用メモ。実装対象ではない(データとして保持するだけ) */
  art_note?: string
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
  /** 村で手に入る品。冒頭のリュック詰め画面には並ばない */
  acquirable?: boolean
  /** 将来の「机にばらっと並んだ一枚絵」でのホットスポット位置(%) */
  spot?: { x: number; y: number }
  draft?: boolean
}

export interface DaySlotDef {
  /** 選択の余地なくこの場所へ行く日 */
  locked?: string
  /** 選べる場所。省略時は解放済みの全場所 */
  places?: string[]
  /**
   * 選べない場所と、その理由文(FABLE_ANSWERS_8 §2)。
   * 台風の増水で Day 9〜10 の川原を「川はまだ水が出ている」で灰色表示する等。
   * ここに載せる場所は places からは外すこと(二重表示を避ける)。
   */
  grayed?: Record<string, string>
}

export interface DayDef {
  day: number
  date: string
  /** 3コマ制の日。祭りの日は持たない */
  slots?: Record<Slot, DaySlotDef>
  /** イベント回。コマ制を崩し、一本道+屋台の自由回遊にする */
  festival?: boolean
}

/** 祭りの屋台 */
export interface Stall {
  id: string
  name: string
  price: number
  /** 再生するイベントID */
  event: string
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
  /** 祠で破られたページ。紙は一枚で二ページぶんなので、綴じの反対側も一緒に抜ける */
  torn?: boolean
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
  /** 日常イベントを最後に出した日。同じ弾を続けて出さないため */
  ambientLog: Record<string, number>
  /** 所持金(祭りの日に使う) */
  money: number
  /** 祭りで回った屋台 */
  stallsVisited: string[]
  /** 神に収穫された思い出タグ(帰りのバスで自動・無音)。日記では黒塗り */
  harvested: string[]
  /** 祠で焼いた思い出タグ。日記では焦げ縁。収穫対象から外れる */
  burned: string[]
  /** 実物を祠に差し出して出口が開いたか(捧げて帰るEDへの唯一の鍵) */
  exitOpen: boolean
  /**
   * 祠で捧げ/焼きをした翌朝に、コマ選択の前に強制再生する「朝、たしかめに行った」テキスト
   * (FABLE_ANSWERS_16 §1)。同日中には出さない(時系列の矛盾を消す)。翌朝に出して空にする。
   */
  pendingMorning?: string[]
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
