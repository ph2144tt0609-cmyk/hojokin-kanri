// 申請期限までの残日数と、そこから決まる「緊急度レベル」を扱う。

export type Level = 'overdue' | 'soon' | 'near' | 'ok' | 'none'

// 今日（0時基準）から対象日までの日数。過ぎていればマイナス。
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

// 残日数から色分けレベルを決める。
//   overdue: 期限超過 / soon: 7日以内 / near: 30日以内 / ok: それ以上 / none: 期限なし
export function deadlineLevel(dateStr: string | null): Level {
  const d = daysUntil(dateStr)
  if (d === null) return 'none'
  if (d < 0) return 'overdue'
  if (d <= 7) return 'soon'
  if (d <= 30) return 'near'
  return 'ok'
}

// 残日数を「あと3日」「2日超過」のような短い日本語にする。
export function daysLabel(dateStr: string | null): string {
  const d = daysUntil(dateStr)
  if (d === null) return '期限なし'
  if (d < 0) return `${-d}日超過`
  if (d === 0) return '本日締切'
  return `あと${d}日`
}

// 'YYYY-MM-DD' を 'YYYY/MM/DD' 表示に。
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return dateStr.replaceAll('-', '/')
}

// 金額を「1,234,567」のような3桁区切りに（円表示用）。
export const yen = (n: number) => Math.round(Number(n) || 0).toLocaleString('ja-JP')

// ISO タイムスタンプを 'YYYY/MM/DD HH:mm' 表示に。
export function formatDateTime(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
