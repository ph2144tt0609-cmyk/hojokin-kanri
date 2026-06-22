import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// 公開（build）時のみ GitHub Pages の公開パス（/hojokin-kanri/）を base にする。
// dev サーバではルート（/）にして確認しやすくする。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/hojokin-kanri/' : '/',
  plugins: [react()],
}))
