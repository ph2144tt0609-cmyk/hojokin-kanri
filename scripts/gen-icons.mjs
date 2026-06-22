// public/favicon.svg から PWA 用 PNG アイコンを生成する
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url))

const targets = [
  ['public/pwa-192.png', 192],
  ['public/pwa-512.png', 512],
  ['public/apple-touch-icon.png', 180],
]

for (const [out, size] of targets) {
  await sharp(svg).resize(size, size).png().toFile(out)
  console.log('generated', out, size)
}
