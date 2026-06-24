import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Subsidy, Followup, StatusKey } from '../types'
import { STATUS_FIELDS } from '../types'
import { formatDateTime } from '../expiry'

const EMPTY: Subsidy = {
  id: '',
  name: '',
  department: '',
  deadline: null,
  applied: false,
  applied_at: null,
  decision: false,
  decision_at: null,
  paid: false,
  paid_at: null,
  amount: 0,
  note: '',
  followups: [],
}

type StatusState = Pick<
  Subsidy,
  'applied' | 'applied_at' | 'decision' | 'decision_at' | 'paid' | 'paid_at'
>

type Props = {
  subsidy: Subsidy | null
  departments: string[]
  onClose: () => void
  onSave: (form: Subsidy, followups: Followup[]) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onDuplicate: (form: Subsidy, followups: Followup[]) => void | Promise<void>
}

export function SubsidyEditor({
  subsidy,
  departments,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
}: Props) {
  const init = subsidy ?? EMPTY
  const isNew = !init.id

  const [name, setName] = useState(init.name)
  const [department, setDepartment] = useState(init.department || '')
  const [deadline, setDeadline] = useState(init.deadline ?? '')
  const [amount, setAmount] = useState(init.amount || 0)
  const [note, setNote] = useState(init.note)
  const [status, setStatus] = useState<StatusState>({
    applied: init.applied,
    applied_at: init.applied_at,
    decision: init.decision,
    decision_at: init.decision_at,
    paid: init.paid,
    paid_at: init.paid_at,
  })
  const [followups, setFollowups] = useState<Followup[]>(init.followups ?? [])
  const [busy, setBusy] = useState(false)

  // 入力内容が初期状態から変わっているか（未保存の変更があるか）を判定。
  // 枠外クリック・キャンセル・Esc で閉じる前に、これを見て確認ダイアログを出す。
  const dirty = useMemo(() => {
    const fi = init.followups ?? []
    if (
      name !== init.name ||
      (department || '') !== (init.department || '') ||
      (deadline || '') !== (init.deadline ?? '') ||
      (amount || 0) !== (init.amount || 0) ||
      note !== (init.note || '') ||
      status.applied !== init.applied ||
      status.decision !== init.decision ||
      status.paid !== init.paid ||
      followups.length !== fi.length
    ) {
      return true
    }
    return followups.some((f, i) => {
      const b = fi[i]
      return f.name !== b.name || (f.due_date ?? '') !== (b.due_date ?? '') || f.done !== b.done
    })
  }, [name, department, deadline, amount, note, status, followups, init])

  // 閉じる要求。未保存の変更があるときだけ確認する（無ければそのまま閉じる）。
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('入力した内容はまだ保存されていません。閉じてもよろしいですか？')) {
      return
    }
    onClose()
  }, [dirty, onClose])

  // Esc キーでも同じガードを通して閉じる。
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  // 枠外クリックでの誤クローズ防止：押し始めが本当にオーバーレイ上だった場合のみ閉じる
  // （入力欄から枠外へドラッグして選択 → 離した瞬間に閉じる、という事故を防ぐ）。
  const downOnOverlay = useRef(false)

  // ステータスのチェックを切り替え。ON にした瞬間、確認日時が空なら現在時刻を記録。
  function toggleStatus(key: StatusKey, atKey: keyof StatusState) {
    setStatus((s) => {
      const on = !s[key]
      return {
        ...s,
        [key]: on,
        [atKey]: on ? (s[atKey] ?? new Date().toISOString()) : null,
      }
    })
  }

  function addFollowup() {
    setFollowups((f) => [
      ...f,
      { id: '', subsidy_id: init.id, name: '', due_date: null, done: false, done_at: null },
    ])
  }

  function updateFollowup(i: number, patch: Partial<Followup>) {
    setFollowups((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }

  function toggleFollowupDone(i: number) {
    setFollowups((f) =>
      f.map((x, idx) => {
        if (idx !== i) return x
        const done = !x.done
        return { ...x, done, done_at: done ? (x.done_at ?? new Date().toISOString()) : null }
      }),
    )
  }

  function removeFollowup(i: number) {
    setFollowups((f) => f.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      alert('補助金名を入力してください')
      return
    }
    setBusy(true)
    const form: Subsidy = {
      ...init,
      id: init.id,
      name: name.trim(),
      department,
      deadline: deadline || null,
      amount,
      note,
      ...status,
    }
    await onSave(form, followups.filter((f) => f.name.trim()))
    setBusy(false)
  }

  // いま表示中の内容をコピーして新しい補助金を作る（区分違いの登録などに便利）
  async function handleDuplicate() {
    if (!name.trim()) {
      alert('補助金名を入力してください')
      return
    }
    setBusy(true)
    const form: Subsidy = {
      ...init,
      id: init.id,
      name: name.trim(),
      department,
      deadline: deadline || null,
      amount,
      note,
      ...status,
    }
    await onDuplicate(form, followups.filter((f) => f.name.trim()))
    setBusy(false)
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnOverlay.current) requestClose()
        downOnOverlay.current = false
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-head">
            <h2>{isNew ? '補助金を追加' : '補助金を編集'}</h2>
            <button type="button" className="icon-btn" onClick={requestClose} aria-label="閉じる">
              ×
            </button>
          </div>

          <div className="modal-body">
            <label className="field">
              <span>補助金の名前</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>

            <div className="field-row">
              <label className="field">
                <span>区分（部署・店舗など・任意）</span>
                <input
                  list="dept-options"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="例：本店、法人、〇〇店"
                />
                <datalist id="dept-options">
                  {departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </label>

              <label className="field">
                <span>申請期限</span>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
            </div>

            <label className="field">
              <span>金額（円）</span>
              <input
                type="number"
                min="0"
                value={amount || ''}
                placeholder="0"
                aria-label="補助金の金額"
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
              />
            </label>

            <div className="status-block">
              <div className="block-label">進捗（チェックすると確認日時を自動記録）</div>
              {STATUS_FIELDS.map((f) => (
                <div key={f.key} className="status-line">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={status[f.key]}
                      onChange={() => toggleStatus(f.key, f.at)}
                    />
                    <span>{f.label}</span>
                  </label>
                  <span className="checked-at">
                    {status[f.key] ? formatDateTime(status[f.at]) : '未'}
                  </span>
                </div>
              ))}
            </div>

            <div className="status-block">
              <div className="block-label">
                後追いの提出物
                <button type="button" className="btn-mini" onClick={addFollowup}>
                  ＋ 追加
                </button>
              </div>
              {followups.length === 0 && <p className="muted small">（なし）</p>}
              {followups.map((f, i) => (
                <div key={i} className="followup-row">
                  <label className="check fu-check">
                    <input
                      type="checkbox"
                      checked={f.done}
                      onChange={() => toggleFollowupDone(i)}
                    />
                  </label>
                  <input
                    className="fu-name"
                    placeholder="提出物の名前"
                    value={f.name}
                    onChange={(e) => updateFollowup(i, { name: e.target.value })}
                  />
                  <input
                    className="fu-date"
                    type="date"
                    value={f.due_date ?? ''}
                    onChange={(e) => updateFollowup(i, { due_date: e.target.value || null })}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeFollowup(i)}
                    aria-label="削除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <label className="field">
              <span>メモ</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </label>
          </div>

          <div className="modal-foot">
            {!isNew && (
              <button
                type="button"
                className="btn-danger"
                onClick={() => onDelete(init.id)}
              >
                削除
              </button>
            )}
            <div className="foot-right">
              {!isNew && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleDuplicate}
                  disabled={busy}
                >
                  複製
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={requestClose}>
                キャンセル
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
