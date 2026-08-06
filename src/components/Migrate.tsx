// 以前の「メール＋パスワードでログインする方式」で貯めたデータを、
// いまの「合言葉で暗号化してクラウドに置く方式」へ引っ越すための画面。
//
// 旧データは行レベルセキュリティ（RLS）で本人しか読めないので、
// ここで一度だけログインして読み出し、暗号化して保存し直す。読み終わったらログアウトする。
// 引っ越しが済めば二度と使わないが、別の端末やアカウントから移すときのために残してある。
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../supabase'
import { cloudLoad, cloudSave, CLOUD_KEYS } from '../cloud'
import { migrateBaseup } from '../baseupCalc'
import type { Subsidy } from '../types'

export function Migrate({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [log, setLog] = useState<string[]>([])

  const add = (s: string) => setLog((l) => [...l, s])

  async function run(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    setLog([])
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) {
        setErr('ログインできませんでした。メールアドレスとパスワードをご確認ください。')
        setBusy(false)
        return
      }
      add('ログインしました')

      // ① 補助金＋後追い提出物
      const { data: subs, error: se } = await supabase
        .from('subsidies')
        .select('*, followups(*)')
      if (se) {
        add('補助金の読み出しに失敗：' + se.message)
      } else if (subs?.length) {
        const cur = await cloudLoad<Subsidy[]>(CLOUD_KEYS.subsidies)
        if (
          cur?.length &&
          !confirm(
            `いまクラウドに補助金が ${cur.length} 件あります。旧データ ${subs.length} 件で置き換えますか？`,
          )
        ) {
          add('補助金は取り込みませんでした')
        } else {
          const ok = await cloudSave(CLOUD_KEYS.subsidies, subs as Subsidy[])
          add(ok ? `補助金 ${subs.length} 件を取り込みました` : '補助金の保存に失敗しました')
        }
      } else {
        add('補助金の旧データはありませんでした')
      }

      // ② ベースアップ評価料
      const { data: bu, error: be } = await supabase
        .from('baseup_state')
        .select('data')
        .maybeSingle()
      if (be) {
        add('ベースアップの読み出しに失敗：' + be.message)
      } else if (bu?.data) {
        const m = migrateBaseup(bu.data)
        if (m) {
          const ok = await cloudSave(CLOUD_KEYS.baseup, m.state)
          add(
            ok
              ? `ベースアップを取り込みました（職員 ${m.state.staff.length} 名${m.mergedFromShops ? '・薬局別データを法人1本に結合' : ''}）`
              : 'ベースアップの保存に失敗しました',
          )
        } else {
          add('ベースアップの旧データが読み取れませんでした')
        }
      } else {
        add('ベースアップの旧データはありませんでした')
      }

      await supabase.auth.signOut()
      add('ログアウトしました。取り込みは完了です（画面を閉じて読み込み直してください）')
    } catch (e) {
      setErr('取り込み中にエラーが起きました：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="migrate-back" role="dialog" aria-modal="true" aria-label="以前のデータを取り込む">
      <div className="migrate-card">
        <h2>以前のデータを取り込む</h2>
        <p className="note">
          メール＋パスワードでログインしていた頃のデータ（補助金・ベースアップ評価料）を、
          いまの合言葉方式へ引っ越します。<b>取り込みは最初の1回だけ</b>でかまいません。
        </p>
        <form onSubmit={run}>
          <label className="field">
            <span>メールアドレス</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {err && <p className="login-error">{err}</p>}
          {log.length > 0 && (
            <ul className="migrate-log">
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          <div className="migrate-actions">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? '取り込み中…' : '取り込む'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              閉じる
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
