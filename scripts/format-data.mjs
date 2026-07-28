// src/data の JSON を、アサが読みやすい形に整える。
// 短いオブジェクト(台詞1行など)は1行にまとめ、長いものだけ展開する。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const WIDTH = 96

function fmt(v, indent = 0) {
  const pad = '  '.repeat(indent)
  const inner = '  '.repeat(indent + 1)
  const compact = JSON.stringify(v)
  if (compact.length + pad.length <= WIDTH) return compact

  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    return '[\n' + v.map((x) => inner + fmt(x, indent + 1)).join(',\n') + '\n' + pad + ']'
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v)
    if (keys.length === 0) return '{}'
    return (
      '{\n' +
      keys.map((k) => inner + JSON.stringify(k) + ': ' + fmt(v[k], indent + 1)).join(',\n') +
      '\n' +
      pad +
      '}'
    )
  }
  return compact
}

const files = [
  ...readdirSync('src/data').filter((f) => f.endsWith('.json')).map((f) => 'src/data/' + f),
  ...readdirSync('src/data/events').map((f) => 'src/data/events/' + f),
]
for (const f of files) {
  writeFileSync(f, fmt(JSON.parse(readFileSync(f, 'utf8'))) + '\n', 'utf8')
}
console.log('整形しました:', files.length, 'ファイル')
