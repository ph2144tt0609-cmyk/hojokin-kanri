// 賃金台帳（給与ソフトのCSV）を読み込んで、職員ごと・月ごとの実績に変換する画面。
//
// 目的は「増えた残業代が毎月同じ額になってしまう」のをやめること。
// 台帳から月別の実残業時間（と、ベースアップとして支給した手当・事業主負担額）を取り込めば、
// 残業代増額分も増加分法定福利費も月ごとの実績で自動計算される。
//
// 台帳の中身はブラウザの中だけで処理し、原本ファイルはどこにも送らない。
// 取り込んだ数字（氏名・月別の時間と金額）は、他のデータと同じく合言葉で暗号化して保存する。
import { useMemo, useRef, useState } from 'react'
import {
  DEFAULT_HOURS,
  FIRST_YM,
  type BLedgerMonth,
  type BStaff,
  type LedgerMap,
  type StaffLedger,
} from '../baseupCalc'
import {
  decodeCsvBytes,
  normalizeName,
  parseWageLedger,
  sumRows,
  type LedgerPerson,
} from '../wageLedger'

const SKIP = '__skip__'
const NEW = '__new__'

export interface ImportResult {
  ledger: Record<string, StaffLedger>
  addedStaff: BStaff[]
  map: LedgerMap
  months: string[]
  people: number
}

export function WageLedgerImport({
  staff,
  map,
  onApply,
  onCancel,
}: {
  staff: BStaff[]
  map: LedgerMap
  onApply: (r: ImportResult) => void
  onCancel: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [people, setPeople] = useState<LedgerPerson[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [assign, setAssign] = useState<Record<number, string>>({})
  const [draft, setDraft] = useState<LedgerMap>(map)

  // 読み込んだ台帳に出てくる行ラベル（重複なし・出現順）
  const labels = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    people.forEach((p) => p.labels.forEach((l) => {
      if (!seen.has(l)) {
        seen.add(l)
        out.push(l)
      }
    }))
    return out
  }, [people])

  const payLabels = useMemo(() => labels.filter((l) => l.includes('(支給)')), [labels])
  const companyLabels = useMemo(() => labels.filter((l) => l.includes('(会社)')), [labels])

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return
    const parsed: LedgerPerson[] = []
    const errs: string[] = []
    for (const f of Array.from(files)) {
      try {
        const p = parseWageLedger(decodeCsvBytes(await f.arrayBuffer()), f.name)
        if (!p) errs.push(`${f.name}：賃金台帳の形式として読めませんでした`)
        else if (!p.name) errs.push(`${f.name}：氏名が見つかりませんでした`)
        else parsed.push(p)
      } catch {
        errs.push(`${f.name}：読み込みに失敗しました`)
      }
    }
    // 同じ人の別期間ファイルも並べて持つ（月がずれるだけなので、あとで統合する）
    const next = [...people, ...parsed]
    setPeople(next)
    setErrors(errs)

    // 氏名で既存職員に自動で結びつける。見つからない人は「新しく追加」を初期値にする。
    const a: Record<number, string> = { ...assign }
    next.forEach((p, i) => {
      if (a[i]) return
      const hit = staff.find((s) => normalizeName(s.name) === normalizeName(p.name))
      a[i] = hit ? String(hit.id) : NEW
    })
    setAssign(a)
    if (fileRef.current) fileRef.current.value = ''
  }

  // 取り込み結果の下ごしらえ（プレビューと確定で同じものを使う）
  const built = useMemo(() => {
    let nextId = staff.reduce((a, s) => Math.max(a, s.id), 0)
    const addedByName = new Map<string, BStaff>()
    const ledger: Record<string, StaffLedger> = {}
    const monthSet = new Set<string>()
    const perPerson: { person: LedgerPerson; target: string; months: number }[] = []

    people.forEach((p, i) => {
      const choice = assign[i] ?? NEW
      if (choice === SKIP) {
        perPerson.push({ person: p, target: '取り込まない', months: 0 })
        return
      }
      let id: number
      let targetName: string
      if (choice === NEW) {
        const key = normalizeName(p.name)
        const already = addedByName.get(key)
        if (already) {
          id = already.id
          targetName = `新規追加：${already.name}`
        } else {
          id = ++nextId
          const s: BStaff = {
            id,
            name: p.name,
            role: '薬剤師',
            baseUp: 0,
            allowance: 0,
            monthlyHours: DEFAULT_HOURS,
            overtimeHours: 0,
            startYm: p.yms.find((y) => y >= FIRST_YM) ?? FIRST_YM,
            origin: p.dept || undefined,
          }
          addedByName.set(key, s)
          targetName = `新規追加：${p.name}`
        }
      } else {
        id = Number(choice)
        targetName = staff.find((s) => s.id === id)?.name || '（無名の職員）'
      }

      const key = String(id)
      const months: StaffLedger = ledger[key] ?? {}
      let count = 0
      p.yms.forEach((ym, mi) => {
        const paid = p.rows[draft.paid]?.[mi] ?? null
        const overtimeHours = p.rows[draft.overtime]?.[mi] ?? null
        const employerIns = sumRows(p, draft.employer, mi)
        // その月の列がまるごと空＝在籍前・未支給の月なので取り込まない
        if (paid == null && overtimeHours == null && employerIns == null) return
        const row: BLedgerMonth = {
          overtimeHours,
          // 「ベア／手当として読む行」を指定していないときは null＝職員マスタの固定額を使う
          baseUp: draft.baseUp.length ? (sumRows(p, draft.baseUp, mi) ?? 0) : null,
          allowance: draft.allowance.length ? (sumRows(p, draft.allowance, mi) ?? 0) : null,
          employerIns,
          paid,
        }
        months[ym] = row
        monthSet.add(ym)
        count++
      })
      ledger[key] = months
      perPerson.push({ person: p, target: targetName, months: count })
    })

    return {
      ledger,
      addedStaff: [...addedByName.values()],
      months: [...monthSet].sort(),
      perPerson,
    }
  }, [people, assign, draft, staff])

  const toggle = (key: 'baseUp' | 'allowance' | 'employer', label: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(label) ? d[key].filter((x) => x !== label) : [...d[key], label],
    }))

  const canApply = people.length > 0 && built.months.length > 0

  return (
    <section className="card ledger-import">
      <h2>賃金台帳を読み込む</h2>
      <p className="note">
        給与ソフトが出力した<b>賃金台帳のCSV（1人1ファイル）</b>をそのまま選んでください。
        月ごとの<b>実残業時間</b>を取り込むので、残業代増額分が毎月同じ額になることがなくなります。
        ファイルはこの画面の中だけで読み取り、原本はどこにも送りません。
      </p>

      <div className="row-actions">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          aria-label="賃金台帳CSVを選ぶ"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {people.length > 0 && (
          <button
            className="btn ghost"
            onClick={() => {
              setPeople([])
              setAssign({})
              setErrors([])
            }}
          >
            選び直す
          </button>
        )}
      </div>

      {errors.length > 0 && (
        <ul className="ledger-errors">
          {errors.map((e) => (
            <li key={e}>⚠ {e}</li>
          ))}
        </ul>
      )}

      {people.length > 0 && (
        <>
          <h3>1. 読み込んだ台帳と、対応する職員</h3>
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>ファイル</th>
                  <th>氏名</th>
                  <th>部門</th>
                  <th>集計期間</th>
                  <th>この台帳を割り当てる職員</th>
                  <th>取り込む月数</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={p.fileName + i}>
                    <td data-label="ファイル" className="ellipsis">{p.fileName}</td>
                    <td data-label="氏名">{p.name}</td>
                    <td data-label="部門">{p.dept || '—'}</td>
                    <td data-label="集計期間">{p.period || '—'}</td>
                    <td data-label="割り当て">
                      <select
                        aria-label={`${p.name} の割り当て先`}
                        value={assign[i] ?? NEW}
                        onChange={(e) => setAssign({ ...assign, [i]: e.target.value })}
                      >
                        {staff.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name || `職員${s.id}`}
                          </option>
                        ))}
                        <option value={NEW}>＋ 新しい職員として追加</option>
                        <option value={SKIP}>取り込まない</option>
                      </select>
                    </td>
                    <td data-label="取り込む月数">
                      {built.perPerson[i]?.months ? `${built.perPerson[i].months} か月` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>2. 台帳のどの行を「ベースアップ分」として読むか</h3>
          <p className="note">
            ベースアップ評価料として支給している手当の行にチェックを入れてください。
            <b>チェックしなかった場合は、下の職員表に入れてある固定額</b>をそのまま使います
            （その場合でも残業時間だけは台帳の実績になります）。
          </p>
          <div className="pick-grid">
            <div>
              <div className="pick-title">ベア相当額として読む行</div>
              {payLabels.map((l) => (
                <label key={'b' + l} className="chk">
                  <input
                    type="checkbox"
                    checked={draft.baseUp.includes(l)}
                    onChange={() => toggle('baseUp', l)}
                  />
                  {l}
                </label>
              ))}
            </div>
            <div>
              <div className="pick-title">ベースアップ手当として読む行</div>
              {payLabels.map((l) => (
                <label key={'a' + l} className="chk">
                  <input
                    type="checkbox"
                    checked={draft.allowance.includes(l)}
                    onChange={() => toggle('allowance', l)}
                  />
                  {l}
                </label>
              ))}
            </div>
            <div>
              <div className="pick-title">事業主負担（実額の法定福利費に使う行）</div>
              {companyLabels.length === 0 && <div className="note">（会社負担の行が見つかりませんでした）</div>}
              {companyLabels.map((l) => (
                <label key={'e' + l} className="chk">
                  <input
                    type="checkbox"
                    checked={draft.employer.includes(l)}
                    onChange={() => toggle('employer', l)}
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>

          <div className="pick-rows">
            <label className="field-row">
              残業時間の行
              <select
                aria-label="残業時間の行"
                value={draft.overtime}
                onChange={(e) => setDraft({ ...draft, overtime: e.target.value })}
              >
                {labels.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="field-row">
              支給合計の行（実額の負担率の分母）
              <select
                aria-label="支給合計の行"
                value={draft.paid}
                onChange={(e) => setDraft({ ...draft, paid: e.target.value })}
              >
                {labels.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>

          <h3>3. 取り込む内容の確認</h3>
          {built.months.length === 0 ? (
            <p className="note">
              ⚠ 取り込める月がありません。「残業時間の行」「支給合計の行」の指定をご確認ください。
            </p>
          ) : (
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>職員</th>
                    {built.months.map((m) => (
                      <th key={m}>{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(built.ledger).map(([id, months]) => {
                    const name =
                      staff.find((s) => String(s.id) === id)?.name ??
                      built.addedStaff.find((s) => String(s.id) === id)?.name ??
                      id
                    return (
                      <tr key={id}>
                        <td data-label="職員">{name}</td>
                        {built.months.map((m) => (
                          <td key={m} data-label={m}>
                            {months[m]?.overtimeHours != null
                              ? `${months[m].overtimeHours!.toFixed(1)}h`
                              : '—'}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="note">表の数字は、その月の<b>実残業時間</b>です。金額の行も同時に取り込まれます。</p>

          <div className="row-actions">
            <button
              className="btn primary"
              disabled={!canApply}
              onClick={() =>
                onApply({
                  ledger: built.ledger,
                  addedStaff: built.addedStaff,
                  map: draft,
                  months: built.months,
                  people: people.length,
                })
              }
            >
              この内容で取り込む
            </button>
            <button className="btn ghost" onClick={onCancel}>
              閉じる
            </button>
          </div>
        </>
      )}

      {people.length === 0 && (
        <div className="row-actions">
          <button className="btn ghost" onClick={onCancel}>
            閉じる
          </button>
        </div>
      )}
    </section>
  )
}
