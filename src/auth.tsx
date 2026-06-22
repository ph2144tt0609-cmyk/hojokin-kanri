import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, hasSupabaseConfig } from './supabase'

// ログイン状態を購読するフック
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 接続情報が無いときは通信せず、すぐログイン画面を出す（固まり防止）
    if (!hasSupabaseConfig) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, loading }
}

// ログイン / 新規登録 画面
export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')

    if (isSignup) {
      // 新規登録
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(signupErrorMessage(error.message))
      } else if (data.session) {
        // メール確認OFFの場合 → そのままログイン状態に（onAuthStateChange が拾って画面が切り替わる）
      } else {
        // メール確認ONの場合 → 確認メールを送信
        setInfo(
          '確認メールを送信しました。メール内のリンクを開くと登録が完了し、ログインできます。',
        )
      }
    } else {
      // ログイン
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('ログインできませんでした。メールアドレスとパスワードをご確認ください。')
      }
    }
    setBusy(false)
  }

  function switchMode() {
    setMode(isSignup ? 'login' : 'signup')
    setError('')
    setInfo('')
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-title">補助金管理</h1>
        <p className="login-sub">
          {isSignup ? 'アカウントを新規作成' : 'ログインしてください'}
        </p>

        {!hasSupabaseConfig && (
          <p className="login-error">
            接続情報が未設定です。.env を設定してください。
          </p>
        )}

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
          <span>パスワード{isSignup ? '（6文字以上）' : ''}</span>
          <input
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>

        {error && <p className="login-error">{error}</p>}
        {info && <p className="login-info">{info}</p>}

        <button className="btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? '処理中…' : isSignup ? '新規登録' : 'ログイン'}
        </button>

        <button type="button" className="login-switch" onClick={switchMode}>
          {isSignup
            ? 'すでにアカウントをお持ちの方はこちら（ログイン）'
            : 'アカウントをお持ちでない方はこちら（新規登録）'}
        </button>
      </form>
    </div>
  )
}

// 新規登録のエラーを分かりやすい日本語にする
function signupErrorMessage(msg: string): string {
  if (/already registered|already exists|User already/i.test(msg)) {
    return 'このメールアドレスは既に登録されています。ログインをお試しください。'
  }
  if (/at least 6|password.*6|weak|short|6 characters/i.test(msg)) {
    return 'パスワードは6文字以上にしてください。'
  }
  if (/signups? not allowed|signup is disabled|disabled/i.test(msg)) {
    return '現在、新規登録を受け付けていません（管理側で受付停止中）。'
  }
  return '登録できませんでした：' + msg
}
