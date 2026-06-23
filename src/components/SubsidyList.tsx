import type { Subsidy } from '../types'
import { STATUS_FIELDS } from '../types'
import { deadlineLevel, daysLabel, formatDate, yen } from '../expiry'

type Props = {
  subsidies: Subsidy[]
  onEdit: (s: Subsidy) => void
}

export function SubsidyList({ subsidies, onEdit }: Props) {
  if (!subsidies.length) {
    return (
      <p className="muted center empty-note">
        補助金がまだありません。「＋ 新規追加」から登録してください。
      </p>
    )
  }

  return (
    <div className="card-grid">
      {subsidies.map((s) => {
        const level = deadlineLevel(s.deadline)
        const fus = s.followups ?? []
        const doneFu = fus.filter((f) => f.done).length
        const allDone = s.applied && s.decision && s.paid && fus.every((f) => f.done)
        const cardLevel = allDone ? 'done' : level

        return (
          <button
            key={s.id}
            className={'subsidy-card lvl-' + cardLevel}
            onClick={() => onEdit(s)}
          >
            <div className="card-head">
              <span className="dept-badge">{s.department || '—'}</span>
              <span className={'deadline-tag tag-' + (allDone ? 'done' : level)}>
                {allDone ? '完了' : daysLabel(s.deadline)}
              </span>
            </div>

            <div className="card-name">{s.name || '(名称未設定)'}</div>
            <div className="card-deadline">申請期限：{formatDate(s.deadline)}</div>
            {(Number(s.amount) || 0) > 0 && (
              <div className="card-amount">金額：{yen(s.amount)} 円</div>
            )}

            <div className="status-row">
              {STATUS_FIELDS.map((f) => (
                <span
                  key={f.key}
                  className={'status-pill' + (s[f.key] ? ' on' : '')}
                >
                  {s[f.key] ? '✓' : '・'} {f.short}
                </span>
              ))}
              <span
                className={
                  'status-pill' +
                  (fus.length > 0 && doneFu === fus.length ? ' on' : '')
                }
              >
                後追い {doneFu}/{fus.length}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
