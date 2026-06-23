// 区分（部署・店舗・カテゴリなど）はユーザーが各自で自由入力する（固定の選択肢は持たない）。

// 後追いの提出物（補助金ごとに 0 個以上）
export interface Followup {
  id: string
  subsidy_id: string
  name: string
  due_date: string | null // 'YYYY-MM-DD'
  done: boolean
  done_at: string | null // ISO 8601 タイムスタンプ
  created_at?: string
}

// 補助金 本体
export interface Subsidy {
  id: string
  name: string
  department: string
  deadline: string | null // 申請期限 'YYYY-MM-DD'
  applied: boolean
  applied_at: string | null // 申請の確認日時
  decision: boolean
  decision_at: string | null // 決定通知書の確認日時
  paid: boolean
  paid_at: string | null // 振込の確認日時
  amount: number // 金額（円）
  note: string
  created_at?: string
  updated_at?: string
  followups?: Followup[] // join 取得時に同梱
}

// 各ステータス項目の共通定義（画面で繰り返し使う）
export type StatusKey = 'applied' | 'decision' | 'paid'

export const STATUS_FIELDS: {
  key: StatusKey
  at: 'applied_at' | 'decision_at' | 'paid_at'
  label: string
  short: string
}[] = [
  { key: 'applied', at: 'applied_at', label: '申請した', short: '申請' },
  { key: 'decision', at: 'decision_at', label: '決定通知書', short: '決定' },
  { key: 'paid', at: 'paid_at', label: '振込確認', short: '振込' },
]
