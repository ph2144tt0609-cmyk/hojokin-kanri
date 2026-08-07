// 給与ソフトが出力する「賃金台帳」CSV（1人1ファイル・列＝○月度）を読み解く。
//
// 形はこうなっている（Shift-JIS / 改行はLF）。
//   賃金台帳
//   集計期間,（2025年05月01日 ～ 2026年04月30日）
//   事業所,株式会社しずく
//   部門,緑ヶ丘
//   氏名,藤田 耕成
//   ," 5月度⏎4/11 - 5/10"," 6月度⏎5/11 - 6/10", … ,合計
//   総出勤日数,22.0,27.0, … ,292.0
//   残業時間,32:21,45:20, … ,439:17
//   基本給(支給),330000,330000, …
//
//   ・見出しのセルには改行が入るので、素朴な split(',') では壊れる（引用符を見る）。
//   ・最後の列は「合計」なので月の集計からは外す。
//   ・時間は "32:21"（32時間21分）表記。金額は整数、日数は小数。
// 読み取りはすべてブラウザの中で完結させる（台帳の原本はどこにも送らない）。

export interface LedgerPerson {
  fileName: string
  name: string // 氏名（台帳の表記のまま）
  dept: string // 部門
  period: string // 集計期間の表示用テキスト
  yms: string[] // 各列に対応する年月（YYYY-MM）
  labels: string[] // 行ラベル（出てきた順）
  rows: Record<string, (number | null)[]> // 行ラベル → 月ごとの値
}

// ── CSV本体の分解（引用符の中の , と改行を守る）──────────────────
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (c !== '\r') cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// Shift-JIS で書き出されるが、UTF-8 で保存し直された台帳も読めるようにする。
// UTF-8 として厳格に読めればUTF-8、読めなければ Shift-JIS とみなす。
export function decodeCsvBytes(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('shift_jis').decode(buf)
  }
}

// "32:21" → 32.35 / "1,234" → 1234 / "22.0" → 22 / "" → null
export function parseLedgerValue(raw: string): number | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const t = s.match(/^(-?\d+):(\d{1,2})$/)
  if (t) {
    const sign = t[1].startsWith('-') ? -1 : 1
    return sign * (Math.abs(Number(t[1])) + Number(t[2]) / 60)
  }
  const n = Number(s.replace(/[,¥\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

const cell = (rows: string[][], label: string) =>
  (rows.find((r) => (r[0] ?? '').trim() === label)?.[1] ?? '').trim()

// 集計期間「（2025年05月01日 ～ 2026年04月30日）」から開始年月を取り出す
function startFromPeriod(period: string): { y: number; m: number } | null {
  const m = period.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/)
  return m ? { y: Number(m[1]), m: Number(m[2]) } : null
}

// 見出し行の「○月度」から各列の年月を決める。
// 月が前の列より小さくなったら年をまたいだとみなす（5月度→…→12月度→1月度）。
function buildYms(monthNums: number[], start: { y: number; m: number } | null): string[] {
  let y = start?.y ?? new Date().getFullYear()
  // 集計期間の開始月と1列目の月度がずれている台帳でも、1列目を基準に合わせる
  if (start && monthNums.length && monthNums[0] !== start.m && monthNums[0] > start.m) y = start.y
  let prev = -1
  return monthNums.map((m) => {
    if (prev >= 0 && m < prev) y++
    prev = m
    return `${y}-${String(m).padStart(2, '0')}`
  })
}

// 賃金台帳CSV 1ファイル分を読む。形が違うファイルは null（呼び出し側で読み飛ばす）。
export function parseWageLedger(text: string, fileName = ''): LedgerPerson | null {
  const rows = parseCsv(text)
  if (!rows.length) return null

  const headIdx = rows.findIndex((r) => r.slice(1).some((c) => /\d+\s*月度/.test(c)))
  if (headIdx < 0) return null
  const head = rows[headIdx]

  // 月の列だけを拾う（末尾の「合計」列は除く）
  const cols: number[] = []
  const monthNums: number[] = []
  head.forEach((c, i) => {
    if (i === 0) return
    const m = c.match(/(\d+)\s*月度/)
    if (m) {
      cols.push(i)
      monthNums.push(Number(m[1]))
    }
  })
  if (!cols.length) return null

  const period = cell(rows, '集計期間')
  const yms = buildYms(monthNums, startFromPeriod(period))

  const labels: string[] = []
  const data: Record<string, (number | null)[]> = {}
  rows.slice(headIdx + 1).forEach((r) => {
    const label = (r[0] ?? '').trim()
    if (!label || label in data) return
    labels.push(label)
    data[label] = cols.map((i) => parseLedgerValue(r[i] ?? ''))
  })

  return {
    fileName,
    name: cell(rows, '氏名'),
    dept: cell(rows, '部門'),
    period: period.replace(/[（）]/g, ''),
    yms,
    labels,
    rows: data,
  }
}

// 氏名の表記ゆれ（全角/半角スペース・空白なし）を吸収して突き合わせる
export const normalizeName = (s: string) => (s || '').replace(/[\s\u3000]/g, '')

// 指定した行ラベル群の合計（1つも値が無ければ null＝その月はデータ無し）
export function sumRows(
  person: LedgerPerson,
  labels: string[],
  monthIndex: number,
): number | null {
  let sum = 0
  let found = false
  labels.forEach((l) => {
    const v = person.rows[l]?.[monthIndex]
    if (v != null) {
      sum += v
      found = true
    }
  })
  return found ? sum : null
}
