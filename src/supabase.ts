import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 接続情報は .env（ローカル）/ ビルド時の環境変数から読む。
// anon key は公開されても問題ない設計（RLS でログイン必須にして保護する）。
export const hasSupabaseConfig = Boolean(url && anonKey)

if (!hasSupabaseConfig) {
  // 設定漏れに気づけるように
  console.error(
    'Supabase の接続情報（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）が未設定です。.env を確認してください。',
  )
}

// 未設定でもアプリ自体は起動できるよう、形式だけ有効なダミーにフォールバックする
// （実際の通信は失敗するが、ログイン画面と未設定の警告は表示される）。
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
)
