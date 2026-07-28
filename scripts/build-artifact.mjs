// dist/index.html(1枚に固めたビルド結果)を、Artifact として公開できる形に直す。
// Artifact 側が <!doctype>〜<body> を自分で被せるので、中身だけを取り出す。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const src = 'dist/index.html'
const out = process.argv[2] ?? 'dist/artifact.html'

const html = readFileSync(src, 'utf8')

const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)

const head = headMatch ? headMatch[1] : ''
const body = bodyMatch ? bodyMatch[1] : html

// <title> は Artifact 側の見出しになるので残す。meta charset 等は不要。
const title = head.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '<title>穂戸野村(仮題)</title>'
const styles = [...head.matchAll(/<style[\s\S]*?<\/style>/gi)].map((m) => m[0]).join('\n')
const headScripts = [...head.matchAll(/<script[\s\S]*?<\/script>/gi)].map((m) => m[0]).join('\n')

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, [title, styles, body.trim(), headScripts].filter(Boolean).join('\n'), 'utf8')

console.log(`wrote ${out}`)
