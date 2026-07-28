import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 出力を1枚のHTMLに固める。リンクを1つ渡すだけで遊べる状態を保つため。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100 * 1024 * 1024,
    cssCodeSplit: false,
    target: 'es2020',
  },
})
