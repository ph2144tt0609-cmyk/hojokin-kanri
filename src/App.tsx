import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useSession, Login } from './auth'
import type { Subsidy, Followup } from './types'
import { SubsidyList } from './components/SubsidyList'
import { SubsidyEditor } from './components/SubsidyEditor'
import { BaseupTab } from './components/BaseupTab'
import './App.css'

export default function App() {
  const { session, loading } = useSession()
  if (loading) return <div className="full-center muted">読み込み中…</div>
  if (!session) return <Login />
  return <Main email={session.user.email ?? ''} />
}

type Tab = 'hojokin' | 'baseup'

function Main({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>('hojokin')

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">薬局管理ツール</h1>
        <div className="topbar-right">
          <span className="user-email">{email}</span>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
            ログアウト
          </button>
        </div>
      </header>

      <nav className="tabbar">
        <button
          className={'tab' + (tab === 'hojokin' ? ' tab-active' : '')}
          onClick={() => setTab('hojokin')}
        >
          補助金管理
        </button>
        <button
          className={'tab' + (tab === 'baseup' ? ' tab-active' : '')}
          onClick={() => setTab('baseup')}
        >
          ベースアップ評価料
        </button>
      </nav>

      {tab === 'hojokin' ? <SubsidiesTab /> : <BaseupTab />}
    </div>
  )
}

// ── 補助金管理タブ ──────────────────────────────────────────────
function SubsidiesTab() {
  const [subsidies, setSubsidies] = useState<Subsidy[]>([])
  const [filter, setFilter] = useState<string>('すべて')
  const [editing, setEditing] = useState<Subsidy | null>(null)
  const [creating, setCreating] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)

  const load = useCallback(async () => {
    setDataLoading(true)
    const { data, error } = await supabase
      .from('subsidies')
      .select('*, followups(*)')
      .order('deadline', { ascending: true, nullsFirst: false })
    if (error) {
      console.error(error)
      alert('データの読み込みに失敗しました。接続情報やネットワークをご確認ください。')
    } else {
      setSubsidies((data ?? []) as Subsidy[])
    }
    setDataLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'すべて') return subsidies
    return subsidies.filter((s) => s.department === filter)
  }, [subsidies, filter])

  // 区分の一覧は、登録済みデータに実在する値から作る（ユーザーごとに自動で変わる）
  const departments = useMemo(
    () => Array.from(new Set(subsidies.map((s) => s.department).filter(Boolean))),
    [subsidies],
  )

  async function handleSave(form: Subsidy, followups: Followup[]) {
    const isNew = !form.id
    const row = {
      name: form.name,
      department: form.department,
      deadline: form.deadline,
      applied: form.applied,
      applied_at: form.applied_at,
      decision: form.decision,
      decision_at: form.decision_at,
      paid: form.paid,
      paid_at: form.paid_at,
      note: form.note,
      updated_at: new Date().toISOString(),
    }

    let id = form.id
    if (isNew) {
      const { data, error } = await supabase
        .from('subsidies')
        .insert(row)
        .select('id')
        .single()
      if (error || !data) {
        console.error(error)
        alert('保存に失敗しました')
        return
      }
      id = data.id as string
    } else {
      const { error } = await supabase.from('subsidies').update(row).eq('id', id)
      if (error) {
        console.error(error)
        alert('保存に失敗しました')
        return
      }
    }

    // 後追い提出物は「全削除 → 現在の内容を挿入」で入れ替える
    await supabase.from('followups').delete().eq('subsidy_id', id)
    if (followups.length) {
      const rows = followups.map((f) => ({
        subsidy_id: id,
        name: f.name,
        due_date: f.due_date,
        done: f.done,
        done_at: f.done_at,
      }))
      const { error } = await supabase.from('followups').insert(rows)
      if (error) {
        console.error(error)
        alert('後追い提出物の保存に失敗しました')
        return
      }
    }

    setEditing(null)
    setCreating(false)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('この補助金を削除します。よろしいですか？')) return
    const { error } = await supabase.from('subsidies').delete().eq('id', id)
    if (error) {
      console.error(error)
      alert('削除に失敗しました')
      return
    }
    setEditing(null)
    await load()
  }

  return (
    <>
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
        <button className="btn-primary" onClick={() => setCreating(true)}>
          ＋ 新規追加
        </button>
      </div>

      {dataLoading ? (
        <p className="muted center">読み込み中…</p>
      ) : (
        <SubsidyList subsidies={filtered} onEdit={(s) => setEditing(s)} />
      )}

      {(editing || creating) && (
        <SubsidyEditor
          subsidy={editing}
          departments={departments}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}

