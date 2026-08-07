import { Fragment } from 'react'
import type { Subsidy } from '../types'
import { STATUS_FIELDS } from '../types'
import { deadlineLevel, daysLabel, formatDate, formatDay, yen } from '../expiry'
import { progressOf, groupRankOf } from '../subsidyStatus'

type Props = {
  subsidies: Subsidy[]
  /** 「やること → 決定通知が来たもの → 完了」の順に並んでいるとき、塊の頭に区切りを入れる */
  grouped?: boolean
  onEdit: (s: Subsidy) => void
}

const GROUP_HEAD: Record<1 | 2, { cls: string; label: string }> = {
  1: { cls: 'dv-decided', label: '¥ 決定通知が来たもの' },
  2: { cls: 'dv-done', label: '✓ 完了したもの' },
}

// カードの2行目。いまの段階に合わせて「いつ・次に何を待っているか」を出す。
// （申請してしまえば申請期限はもう用がないので、そこは段階の日付に差し替える）
function stageLine(label: string, ts: string | null, next?: string): string {
  const d = formatDay(ts)
  const head = d === '—' ? label : `${label}：${d}`
  return next ? `${head} ・ ${next}` : head
}

export function SubsidyList({ subsidies, grouped = false, onEdit }: Props) {
  if (!subsidies.length) {
    return (
      <p className="muted center empty-note">
        該当する補助金がありません。「＋ 新規追加」から登録するか、絞り込みを変えてください。
      </p>
    )
  }

  const rows = subsidies.map((s) => ({ s, p: progressOf(s), rank: groupRankOf(progressOf(s).stage) }))
  // 塊ごとの件数（区切りの見出しに出す）
  const countOf = (r: 1 | 2) => rows.filter((x) => x.rank === r).length

  return (
    <div className="card-grid">
      {rows.map(({ s, p, rank }, i) => {
        // 並びは App 側で「やること → 決定通知が来たもの → 完了」に整えてある。
        // ここでは順位が切り替わった位置に見出しを差し込むだけ。
        const head =
          grouped && rank > 0 && (i === 0 || rows[i - 1].rank !== rank)
            ? GROUP_HEAD[rank as 1 | 2]
            : null

        // 申請期限＝「申請するまでの期限」なので、申請済みなら期限の緊急度・カウントダウンは出さない。
        // 未申請＝期限の色（赤・金・灰青）、申請済＝淡い青、決定済＝青の面、完了＝緑の面。
        // 色の意味を1つに保つため、緑は「完了」だけに使う。
        const cardLevel =
          p.stage === 'done'
            ? 'done'
            : p.stage === 'decided'
              ? 'decided'
              : p.stage === 'applied'
                ? 'waiting'
                : deadlineLevel(s.deadline)

        const tagText =
          p.stage === 'done'
            ? '✓ 完了'
            : p.stage === 'decided'
              ? '決定済'
              : p.stage === 'applied'
                ? '申請済'
                : daysLabel(s.deadline)

        const subLine =
          p.stage === 'done'
            ? stageLine('完了', p.doneAt)
            : p.stage === 'decided'
              ? stageLine('決定通知', s.decision_at, '入金待ち')
              : p.stage === 'applied'
                ? stageLine('申請', s.applied_at, '決定通知待ち')
                : `申請期限：${formatDate(s.deadline)}`

        return (
          <Fragment key={s.id}>
            {head && (
              <div className={'grid-divider ' + head.cls}>
                <span>
                  {head.label} {countOf(rank as 1 | 2)} 件
                </span>
              </div>
            )}

            <button
              className={'subsidy-card lvl-' + cardLevel}
              onClick={() => onEdit(s)}
            >
              <div className="card-head">
                <span className="dept-badge">{s.department || '—'}</span>
                <span className={'deadline-tag tag-' + cardLevel}>{tagText}</span>
              </div>

              <div className="card-name">{s.name || '(名称未設定)'}</div>
              <div className="card-deadline">{subLine}</div>
              {(Number(s.amount) || 0) > 0 && (
                <div className="card-amount">金額：{yen(s.amount)} 円</div>
              )}

              <div className="card-progress" aria-hidden="true">
                <span style={{ width: p.percent + '%' }} />
              </div>

              <div className="status-row">
                {STATUS_FIELDS.map((f) => (
                  <span key={f.key} className={'status-pill' + (s[f.key] ? ' on' : '')}>
                    {s[f.key] ? '✓' : '・'} {f.short}
                  </span>
                ))}
                <span
                  className={
                    'status-pill' +
                    (p.followupTotal > 0 && p.followupDone === p.followupTotal ? ' on' : '')
                  }
                >
                  後追い {p.followupDone}/{p.followupTotal}
                </span>
              </div>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
