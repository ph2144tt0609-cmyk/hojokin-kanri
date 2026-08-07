import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// 公開（build）時のみ GitHub Pages の公開パス（/sizucu-compass/）を base にする。
// dev サーバではルート（/）にして確認しやすくする。
// ※ リポジトリ名＝公開パス。2026-08-07 に hojokin-kanri から sizucu-compass へ改名した。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/sizucu-compass/' : '/',
  plugins: [react()],
}))
