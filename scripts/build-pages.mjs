// dist/index.html(1枚に固めたビルド結果)を docs/ にコピーして、GitHub Pages で配れる形にする。
// GitHub Pages は「ビルドしない・ファイルをそのまま配る」ので、ここで作った完成品を置くだけでよい。
// 使い方: npm run pages(= vite build のあとにこれが走る)
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('docs', { recursive: true })
copyFileSync('dist/index.html', 'docs/index.html')
// .nojekyll = GitHub Pages の Jekyll 処理を止める(1枚HTMLには不要な変換を避ける)。
writeFileSync('docs/.nojekyll', '')

console.log('wrote docs/index.html(+ .nojekyll)')
