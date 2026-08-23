'use client'

// 通知の設定。**この画面から出ずに、Slack連携から条件の指定まで済む。**
//
// ★ 裏側は control-plane にある(OAuthの戻り先は app.hrns.jp 固定でしか登録できず、
//   設定の正本もあちら)。だが**顧客に2つの画面を行き来させない**
//   (2026-08-23 ひろさん指示)。ラッパーの `/api/__notify/*` が中継する。
//
// ★ **テナントIDはこの画面から送らない。** ラッパーが付ける。
//   送らせると、値を書き換えて他人の契約の設定を触られる。

import { useCallback, useEffect, useState } from 'react'
import Header from '@/components/layout/header'

interface NotifyEvent { key: string; label: string; common?: boolean }
interface Target { id: string; kind: string; label: string; meta: string; created_at: string }
interface Rule { id: string; targetId: string; eventTypes: string[]; isActive: boolean }
interface Config {
  slackConfigured: boolean
  events: NotifyEvent[]
  targets: Target[]
  rules: Rule[]
}

const KIND_LABEL: Record<string, string> = { slack: 'Slack' }

async function callApi(path: string, init?: RequestInit) {
  const res = await fetch(`/api/__notify${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`)
  return body
}

export default function NotifyPage() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setCfg((await callApi('')) as Config)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '設定を読み込めませんでした')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // ★ 連携から戻ってきたときの結果を出す。URLは読んだら消す
    //   (再読み込みで同じ通知が何度も出るのを防ぐ)
    const p = new URLSearchParams(location.search)
    const r = p.get('slack')
    if (r) {
      setMsg(p.get('msg') ?? (r === 'ok' ? '連携しました。' : '連携できませんでした。'))
      p.delete('slack')
      p.delete('msg')
      history.replaceState(null, '', location.pathname + (p.toString() ? `?${p}` : ''))
    }
  }, [load])

  const connectSlack = async () => {
    setBusy(true)
    try {
      // ★ **この画面に戻ってきてもらう。** 戻り先はサーバ側で
      //   「自分のテナントのホストか」を確かめている
      const r = (await callApi('/slack/start', {
        method: 'POST',
        body: JSON.stringify({ returnTo: `${location.origin}${location.pathname}` }),
      })) as { url: string }
      location.href = r.url
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '連携を始められませんでした')
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <>
        <Header title="通知" />
        <div className="p-6"><div className="h-24 bg-gray-100 rounded animate-pulse" /></div>
      </>
    )
  }

  return (
    <>
      <Header title="通知" />
      <div className="p-6 max-w-4xl">
        <p className="text-sm text-gray-600 mb-6">
          友だちが増えたときや、フォーム・予約が入ったときに Slack へお知らせします。
          <strong className="text-gray-900">どの出来事を、どこへ送るか</strong>を分けて決められます。
        </p>

        {msg && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium">
            {msg}
          </div>
        )}

        {/* ── 通知先 ────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">通知先</h2>
          {cfg?.targets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
              <p className="text-sm text-gray-600 mb-4">まだ通知先がありません。</p>
              {cfg.slackConfigured ? (
                <button
                  onClick={connectSlack}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-[#4A154B] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? '…' : 'Slack と連携する'}
                </button>
              ) : (
                <p className="text-sm text-gray-500">Slack連携は準備中です。</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {cfg?.targets.map((t) => (
                <TargetRow key={t.id} target={t} rules={cfg.rules} onChange={load} />
              ))}
              {cfg?.slackConfigured && (
                <button
                  onClick={connectSlack}
                  disabled={busy}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  別のチャンネルを追加する
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── ルール ────────────────────────────────── */}
        {cfg && cfg.targets.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-3">どの出来事を送るか</h2>
            <div className="space-y-3">
              {cfg.rules.map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  targets={cfg.targets}
                  events={cfg.events}
                  onChange={load}
                />
              ))}
              <NewRule targets={cfg.targets} events={cfg.events} onChange={load} />
            </div>
          </section>
        )}
      </div>
    </>
  )
}

/** 通知先の1行。試し送りと削除ができる */
function TargetRow({
  target,
  rules,
  onChange,
}: {
  target: Target
  rules: Rule[]
  onChange: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const used = rules.filter((r) => r.targetId === target.id).length

  const test = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = (await callApi(`/targets/${target.id}/test`, { method: 'POST' })) as {
        ok: boolean
        detail?: string
      }
      setResult(r.ok ? '届きました' : (r.detail ?? '届きませんでした'))
    } catch (e) {
      setResult(e instanceof Error ? e.message : '試せませんでした')
    }
    setBusy(false)
  }

  const remove = async () => {
    // ★ 何が消えるかを**押す前に**言う。ルールも一緒に消える(CASCADE)
    const warn =
      used > 0
        ? `この通知先を消すと、ひもづく${used}件の設定も消えます。よろしいですか。`
        : 'この通知先を消します。よろしいですか。'
    if (!confirm(warn)) return
    setBusy(true)
    try {
      await callApi(`/targets/${target.id}`, { method: 'DELETE' })
      await onChange()
    } catch (e) {
      setResult(e instanceof Error ? e.message : '消せませんでした')
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{target.label}</div>
        <div className="text-xs text-gray-500">
          {KIND_LABEL[target.kind] ?? target.kind}
          {result && <span className="ml-2 font-medium text-gray-700">{result}</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={test}
          disabled={busy}
          className="px-3 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          試し送り
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="px-3 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          削除
        </button>
      </div>
    </div>
  )
}

/** 出来事の選択。**よく使う5つを先に出し、残りは畳む**(2026-08-23 ひろさん指示) */
function EventPicker({
  events,
  selected,
  onToggle,
}: {
  events: NotifyEvent[]
  selected: string[]
  onToggle: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const common = events.filter((e) => e.common)
  const rest = events.filter((e) => !e.common)
  // ★ 畳んだ中に選択済みがあるなら開いておく(選んだものが見えないと不安になる)
  const restSelected = rest.some((e) => selected.includes(e.key))

  const box = (e: NotifyEvent) => (
    <label key={e.key} className="flex items-center gap-2 text-sm text-gray-700 py-1">
      <input
        type="checkbox"
        checked={selected.includes(e.key)}
        onChange={() => onToggle(e.key)}
        className="rounded border-gray-300"
      />
      <span>{e.label}</span>
    </label>
  )

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">{common.map(box)}</div>
      {(open || restSelected) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 mt-2 pt-2 border-t border-gray-100">
          {rest.map(box)}
        </div>
      )}
      {!open && !restSelected && (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 text-xs text-gray-600 hover:text-gray-900 underline"
        >
          ほかの出来事も見る（{rest.length}件）
        </button>
      )}
    </div>
  )
}

/** 既存のルール */
function RuleCard({
  rule,
  targets,
  events,
  onChange,
}: {
  rule: Rule
  targets: Target[]
  events: NotifyEvent[]
  onChange: () => Promise<void>
}) {
  const [sel, setSel] = useState<string[]>(rule.eventTypes)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const target = targets.find((t) => t.id === rule.targetId)
  const dirty = JSON.stringify([...sel].sort()) !== JSON.stringify([...rule.eventTypes].sort())

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      await callApi(`/rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ eventTypes: sel }),
      })
      await onChange()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存できませんでした')
    }
    setBusy(false)
  }

  const remove = async () => {
    if (!confirm('この設定を消します。よろしいですか。')) return
    setBusy(true)
    try {
      await callApi(`/rules/${rule.id}`, { method: 'DELETE' })
      await onChange()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '消せませんでした')
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-900">{target?.label ?? '(削除された通知先)'}</div>
        <button
          onClick={remove}
          disabled={busy}
          className="text-xs text-red-600 hover:underline disabled:opacity-50"
        >
          削除
        </button>
      </div>
      <EventPicker
        events={events}
        selected={sel}
        onToggle={(k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}
      />
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      {dirty && (
        <button
          onClick={save}
          disabled={busy || sel.length === 0}
          className="mt-3 px-4 py-2 rounded-lg bg-[#06C755] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存する'}
        </button>
      )}
    </div>
  )
}

/** 新しいルール */
function NewRule({
  targets,
  events,
  onChange,
}: {
  targets: Target[]
  events: NotifyEvent[]
  onChange: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-gray-300 bg-white py-3 text-sm text-gray-600 hover:bg-gray-50"
      >
        ＋ 送る出来事を追加する
      </button>
    )
  }

  const create = async () => {
    setBusy(true)
    setErr(null)
    try {
      await callApi('/rules', { method: 'POST', body: JSON.stringify({ targetId, eventTypes: sel }) })
      setOpen(false)
      setSel([])
      await onChange()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '追加できませんでした')
    }
    setBusy(false)
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <label className="block text-xs font-medium text-gray-600 mb-1">送り先</label>
      <select
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      >
        {targets.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
      <label className="block text-xs font-medium text-gray-600 mb-1">送る出来事</label>
      <EventPicker
        events={events}
        selected={sel}
        onToggle={(k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}
      />
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={create}
          disabled={busy || sel.length === 0 || !targetId}
          className="px-4 py-2 rounded-lg bg-[#06C755] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? '追加中…' : '追加する'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          やめる
        </button>
      </div>
    </div>
  )
}
