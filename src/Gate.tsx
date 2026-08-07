// 合言葉ゲート。
// public/seed.enc.json（経営数字の基準値）を合言葉で復号できたら通す。
// 復号できた＝合言葉が正しい、なので、これがそのままログインの代わりになる。
// 通過後は合言葉を sessionStorage に持ち、クラウド保存（cloud.ts）の鍵として使い回す。
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { applySeed } from './dashboard/seed.js'
import { setPass, clearPass } from './cloud'

const b2u = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function decryptSeed(pass: string) {
  const res = await fetch(import.meta.env.BASE_URL + 'seed.enc.json', { cache: 'no-store' })
  if (!res.ok) throw new Error('seed fetch failed')
  const enc = await res.json()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pass) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b2u(enc.salt) as BufferSource, iterations: enc.iter, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b2u(enc.iv) as BufferSource },
    key,
    b2u(enc.ct) as BufferSource,
  )
  return JSON.parse(new TextDecoder().decode(pt))
}

const KEY = 'sizucu-dash-pass'

export function Gate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function tryPass(pass: string, fromStore: boolean) {
    setBusy(true)
    setErr('')
    try {
      const data = await decryptSeed(pass)
      applySeed(data)
      setPass(pass)
      setReady(true)
    } catch {
      if (!fromStore) setErr('合言葉が違います')
      clearPass()
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(KEY)
    } catch {
      saved = null
    }
    if (saved) tryPass(saved, true)
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (ready) return <>{children}</>

  return (
    <div className="gate">
      <div className="gate-card">
        <img
          className="gate-mark"
          src={import.meta.env.BASE_URL + 'sizucu-logo-color.png'}
          alt=""
          aria-hidden="true"
        />
        <div className="gate-latin">Sizucu Pharmacy Group</div>
        <h1 className="gate-title">sizucu compass</h1>
        <div className="gate-sub">経営の羅針盤 ─ 合言葉を入力してください</div>
        <input
          type="password"
          value={pw}
          autoFocus
          aria-label="合言葉"
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') tryPass(pw, false)
          }}
          placeholder="合言葉"
        />
        <button className="btn-primary" onClick={() => tryPass(pw, false)} disabled={busy}>
          {busy ? '確認中…' : '表示する'}
        </button>
        <div className="gate-err">{err}</div>
      </div>
    </div>
  )
}
