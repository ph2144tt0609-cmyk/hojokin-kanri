// 補助金1件の「進み具合」をまとめて出す。
// 一覧の見た目・絞り込み・件数の集計で同じ判定を使いたいので、判定はここ1か所だけに置く。
import type { Subsidy } from './types'

/** いまどこまで進んだか。todo=未申請 / applied=申請済（結果待ち） /
 *  decided=決定通知あり（入金待ち） / done=すべて完了 */
export type Stage = 'todo' | 'applied' | 'decided' | 'done'

export type Progress = {
  /** 申請・決定・振込・後追いの提出物がすべて済んでいる＝完了 */
  done: boolean
  stage: Stage
  doneSteps: number
  totalSteps: number
  /** 進捗バーの割合（0〜100） */
  percent: number
  followupDone: number
  followupTotal: number
  /** 完了した日（最後にチェックを入れた日時）。未完了なら null */
  doneAt: string | null
}

export function progressOf(s: Subsidy): Progress {
  const fus = s.followups ?? []
  const followupTotal = fus.length
  const followupDone = fus.filter((f) => f.done).length

  // 3ステータス（申請・決定・振込）＋後追いの提出物
  const totalSteps = 3 + followupTotal
  const doneSteps = (s.applied ? 1 : 0) + (s.decision ? 1 : 0) + (s.paid ? 1 : 0) + followupDone
  const done = s.applied && s.decision && s.paid && followupDone === followupTotal

  // 完了日は、記録された確認日時のうち最も新しいもの（＝最後の1件を確認した日）
  const stamps = [s.applied_at, s.decision_at, s.paid_at, ...fus.map((f) => f.done_at)].filter(
    (t): t is string => !!t,
  )
  const doneAt = done && stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null

  // 決定通知が来ていれば、まだ振込・後追いが残っていても「決定済（入金待ち）」として扱う
  const stage: Stage = done ? 'done' : s.decision ? 'decided' : s.applied ? 'applied' : 'todo'

  return {
    done,
    stage,
    doneSteps,
    totalSteps,
    percent: totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0,
    followupDone,
    followupTotal,
    doneAt,
  }
}
