import { useEffect, useMemo, useState } from 'react'
import type { Subsidy, Followup } from './types'
import { SubsidyList } from './components/SubsidyList'
import { SubsidyEditor } from './components/SubsidyEditor'
import { BaseupTab } from './components/BaseupTab'
import { Migrate } from './components/Migrate'
import DashboardTab from './dashboard/DashboardTab.jsx'
import { Gate } from './Gate'
import { cloudLoad, cloudSave, CLOUD_KEYS, clearPass } from './cloud'
import { yen } from './expiry'
import './App.css'

// 入り口は合言葉ひとつ（Gate）。
// データは合言葉で暗号化して Supabase に置くので、ログイン（メール＋パスワード）は使わない。
export default function App() {
  return (
    <Gate>
      <Main />
    </Gate>
  )
}

// 4つの道具を横並びにする（順番＝経営 → 調剤基本料 → ベースアップ → 補助金）
type Tab = 'dashboard' | 'kihonryo' | 'baseup' | 'hojokin'

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '経営ダッシュボード' },
  { key: 'kihonryo', label: '調剤基本料 判定' },
  { key: 'baseup', label: 'ベースアップ評価料' },
  { key: 'hojokin', label: '補助金管理' },
]

function Main() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [migrating, setMigrating] = useState(false)

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">
          <img
            className="brand-logo"
            src={import.meta.env.BASE_URL + 'sizucu-logo-color.png'}
            alt="株式会社しずく ロゴ"
          />
          <span className="brand-text">
            <span className="brand-name">sizucu compass</span>
            <span className="brand-sub">経営の羅針盤</span>
          </span>
        </h1>
        <div className="topbar-right">
          <button className="btn-ghost" onClick={() => setMigrating(true)}>
            以前のデータを取り込む
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              clearPass()
              location.reload()
            }}
          >
            合言葉を入れ直す
          </button>
        </div>
      </header>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'tab' + (tab === t.key ? ' tab-active' : '')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* 経営ダッシュボードと調剤基本料 判定は同じ土台（同じ月次データ）を使うので、
          同じ位置に DashboardTab を置いて view だけ切り替える（タブ往復で読み直しが起きない）。 */}
      {tab === 'dashboard' || tab === 'kihonryo' ? (
        <DashboardTab view={tab === 'kihonryo' ? 'kihonryo' : 'keiei'} />
      ) : tab === 'baseup' ? (
        <BaseupTab />
      ) : (
        <SubsidiesTab />
      )}

      {migrating && <Migrate onClose={() => setMigrating(false)} />}
    </div>
  )
}

// ── 補助金管理タブ ──────────────────────────────────────────────
// 保存先は Supabase の app_state（合言葉で暗号化した1件）。
// 件数が数十件の道具なので、絞り込み・並べ替えは画面側で行う。
function SubsidiesTab() {
  const [subsidies, setSubsidies] = useState<Subsidy[]>([])
  const [filter, setFilter] = useState<string>('すべて')
  const [sort, setSort] = useState<string>('deadline-asc')
  const [editing, setEditing] = useState<Subsidy | null>(null)
  const [creating, setCreating] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const rows = await cloudLoad<Subsidy[]>(CLOUD_KEYS.subsidies)
      if (!alive) return
      setSubsidies(Array.isArray(rows) ? rows : [])
      setDataLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  // 画面の内容をそのままクラウドへ（暗号化して保存）
  async function persist(next: Subsidy[]) {
    setSubsidies(next)
    const ok = await cloudSave(CLOUD_KEYS.subsidies, next)
    if (!ok) alert('保存に失敗しました。通信の状況をご確認ください。')
  }

  const filtered = useMemo(() => {
    if (filter === 'すべて') return subsidies
    return subsidies.filter((s) => s.department === filter)
  }, [subsidies, filter])

  // 区分の一覧は、登録済みデータに実在する値から作る
  const departments = useMemo(
    () => Array.from(new Set(subsidies.map((s) => s.department).filter(Boolean))),
    [subsidies],
  )

  // 並べ替え（期限・区分・名前）。期限は未設定を末尾に。
  const sorted = useMemo(() => {
    const arr = [...filtered]
    const byDeadline = (a: Subsidy, b: Subsidy) => {
      if (!a.deadline && !b.deadline) return 0
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return a.deadline.localeCompare(b.deadline)
    }
    if (sort === 'deadline-asc') arr.sort(byDeadline)
    else if (sort === 'deadline-desc') arr.sort((a, b) => -byDeadline(a, b))
    else if (sort === 'dept')
      arr.sort((a, b) => (a.department || '').localeCompare(b.department || '', 'ja'))
    else if (sort === 'name')
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'))
    return arr
  }, [filtered, sort])

  // まとめ（表示中の補助金の金額を集計）
  const summary = useMemo(() => {
    let appliedSum = 0
    let paidSum = 0
    filtered.forEach((s) => {
      const amt = Number(s.amount) || 0
      if (s.applied) appliedSum += amt
      if (s.paid) paidSum += amt
    })
    return { count: filtered.length, appliedSum, paidSum }
  }, [filtered])

  const newId = () =>
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'id-' + Math.abs(Date.now() ^ (performance.now() * 1000)).toString(36)

  function buildRow(form: Subsidy, followups: Followup[], id: string): Subsidy {
    return {
      ...form,
      id,
      amount: Number(form.amount) || 0,
      followups: followups.map((f) => ({
        ...f,
        id: f.id || newId(),
        subsidy_id: id,
      })),
      updated_at: new Date().toISOString(),
    }
  }

  async function handleSave(form: Subsidy, followups: Followup[]) {
    const isNew = !form.id
    const id = form.id || newId()
    const row = buildRow(form, followups, id)
    const next = isNew
      ? [...subsidies, { ...row, created_at: new Date().toISOString() }]
      : subsidies.map((s) => (s.id === id ? row : s))
    setEditing(null)
    setCreating(false)
    await persist(next)
  }

  async function handleDelete(id: string) {
    if (!confirm('この補助金を削除します。よろしいですか？')) return
    setEditing(null)
    await persist(subsidies.filter((s) => s.id !== id))
  }

  // いまの内容をコピーして新しい補助金を作り、そのコピーを編集画面で開く
  async function handleDuplicate(form: Subsidy, followups: Followup[]) {
    const id = newId()
    const copy = { ...buildRow(form, followups, id), created_at: new Date().toISOString() }
    setCreating(false)
    setEditing(copy)
    await persist([...subsidies, copy])
  }

  return (
    <>
      <div className="summary">
        <div className="sum-card sum-count">
          <div className="sum-latin">Total</div>
          <div className="sum-main">
            <div className="sum-label">件数{filter !== 'すべて' ? `・${filter}` : ''}</div>
            <div className="sum-value">
              {summary.count}
              <small> 件</small>
            </div>
          </div>
        </div>
        <div className="sum-card sum-applied">
          <div className="sum-latin">Applied</div>
          <div className="sum-main">
            <div className="sum-label">申請済の合計金額</div>
            <div className="sum-value">
              {yen(summary.appliedSum)}
              <small> 円</small>
            </div>
          </div>
        </div>
        <div className="sum-card sum-paid">
          <div className="sum-latin">Received</div>
          <div className="sum-main">
            <div className="sum-label">振込済の合計金額</div>
            <div className="sum-value">
              {yen(summary.paidSum)}
              <small> 円</small>
            </div>
          </div>
        </div>
        <div className="sum-card sum-unpaid">
          <div className="sum-latin">Pending</div>
          <div className="sum-main">
            <div className="sum-label">未入金（申請済−振込済）</div>
            <div className="sum-value">
              {yen(summary.appliedSum - summary.paidSum)}
              <small> 円</small>
            </div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filters">
          {['すべて', ...departments].map((d) => (
            <button
              key={d}
              className={'chip' + (filter === d ? ' chip-active' : '')}
              onClick={() => setFilter(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <select
            className="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="並べ替え"
          >
            <option value="deadline-asc">期限が近い順</option>
            <option value="deadline-desc">期限が遠い順</option>
            <option value="dept">区分順</option>
            <option value="name">名前順</option>
          </select>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            ＋ 新規追加
          </button>
        </div>
      </div>

      {dataLoading ? (
        <p className="muted center">読み込み中…</p>
      ) : (
        <SubsidyList subsidies={sorted} onEdit={(s) => setEditing(s)} />
      )}

      {(editing || creating) && (
        <SubsidyEditor
          key={editing?.id ?? 'new'}
          subsidy={editing}
          departments={departments}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSave={handleSave}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      )}
    </>
  )
}
