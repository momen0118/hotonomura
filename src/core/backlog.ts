// 既読の行(読み返し用)。セーブには含めない、その場かぎりのログ。
// scene(本編)と diary(夜の日記シーン)の両方から積むため、DOM非依存の小モジュールに切り出す
// (FABLE_ANSWERS_19 §5.3: 開幕・書き足し・祭り消滅日の動的日記も履歴に載せる)。
export interface LogRow {
  speaker: string | null
  text: string
}

const backlog: LogRow[] = []
const BACKLOG_MAX = 200

/** 一行を履歴に積む。話者名で地の文/台詞を区別する(鉤括弧は表示上つけない方針)。 */
export function pushLog(speaker: string | null, text: string): void {
  backlog.push({ speaker, text })
  if (backlog.length > BACKLOG_MAX) backlog.shift()
}

/** 履歴の全行(古い順)。 */
export function getBacklog(): LogRow[] {
  return backlog
}
