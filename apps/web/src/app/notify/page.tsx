'use client'

// 通知の設定。**この画面から出ずに、Slack連携から条件の指定まで済む。**
//
// ★ 裏側は control-plane にある(OAuthの戻り先は app.hrns.jp 固定でしか登録できず、
//   設定の正本もあちら)。だが**顧客に2つの画面を行き来させない**
//   (2026-08-23 ひろさん指示)。ラッパーの `/api/__notify/*` が中継する。
//
// ★ **テナントIDはこの画面から送らない。** ラッパーが付ける。
//   送らせると、値を書き換えて他人の契約の設定を触られる。
//
// ★ 見た目は既存ページ(auto-replies 等)の作法に合わせる(2026-08-23 ひろさん指摘)。
//   ページ側では幅も余白も持たない(余白は上位レイアウトが、見出し下は Header の mb-8 が持つ)。
//   幅100%で使うぶん、一覧は既存と同じテーブルにし、チェックボックスは画面幅に応じて
//   カラムを増やして、横に間延びしないようにしている。

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
  const [adding, setAdding] = useState(false)

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
      // ★ 失敗したらポップアップを閉じる。開いたままだと、
      //   その裏に出るお知らせに気づけない
      setAdding(false)
      setMsg(e instanceof Error ? e.message : '連携を始められませんでした')
      setBusy(false)
    }
  }

  return (
    <div>
      <Header
        title="通知の連携"
        // ★ ページの主操作は Header の action に置く(既存ページは全部この形。
        //   空状態のカードの中にだけボタンを置くと、このページだけ操作の場所が変わる)。
        //   連携済みでも同じボタンで別チャンネルを足せるので、常時ここに出す
        action={
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 通知先を追加
          </button>
        }
      />

      {msg && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {msg}
        </div>
      )}

      {/* ★ ページの説明は青の案内ボックスで(既存ページの補足説明と同じ形。
            素の段落だと、幅100%のページでは1行が伸びすぎて浮く) */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        <p>
          友だちが増えたときや、フォーム・予約が入ったときに Slack へお知らせします。
          <strong>どの出来事を、どこへ送るか</strong>を分けて決められます。
        </p>
      </div>

      {/* ── 通知先 ────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">通知先</h2>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">通知先</th>
                  {/* ★ **何が送られるかを表で見せる。** 別の節に置くと、
                        通知先とルールを目で突き合わせることになる(2026-08-23 ひろさん指摘) */}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">送る出来事</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">読み込み中...</td></tr>
                ) : !cfg || cfg.targets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                      {cfg && !cfg.slackConfigured
                        ? '通知先がありません(Slack連携は準備中です)'
                        : 'まだ通知先がありません'}
                    </td>
                  </tr>
                ) : (
                  cfg.targets.map((t) => (
                    <TargetRow key={t.id} target={t} rules={cfg.rules} events={cfg.events} onChange={load} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {adding && (
        <AddTargetDialog
          slackConfigured={cfg?.slackConfigured ?? false}
          busy={busy}
          onClose={() => setAdding(false)}
          onPickSlack={connectSlack}
        />
      )}
    </div>
  )
}

/**
 * 通知先の種類を選ぶ。
 *
 * ★★ **Slack以外も増える**(Chatwork・メールなど。2026-08-23 ひろさん)。
 *   だから「Slackと連携する」ボタンを直接置かず、**種類を選ばせる一段**を挟む。
 *   増えたときに、この一覧に行を足すだけで済む。
 *
 * ★ まだ使えない種類も**灰色で見せる**。隠すと「Slackしか無いのか」と思われるが、
 *   出しておけば「これから増える」と伝わる。
 */
function AddTargetDialog({
  slackConfigured,
  busy,
  onClose,
  onPickSlack,
}: {
  slackConfigured: boolean
  busy: boolean
  onClose: () => void
  onPickSlack: () => void
}) {
  const kinds = [
    {
      key: 'slack',
      label: 'Slack',
      desc: 'チャンネルを選ぶだけ。ボタンひとつでつながります',
      ready: slackConfigured,
      onPick: onPickSlack,
    },
    { key: 'chatwork', label: 'Chatwork', desc: '準備中です', ready: false },
    { key: 'email', label: 'メール', desc: '準備中です', ready: false },
    { key: 'webhook', label: 'Webhook', desc: '準備中です', ready: false },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">通知先を追加</h2>
        <p className="text-sm text-gray-600 mb-4">どこへお知らせしますか。</p>
        <div className="space-y-2">
          {kinds.map((k) => (
            <button
              key={k.key}
              onClick={k.ready ? k.onPick : undefined}
              disabled={!k.ready || busy}
              className={
                k.ready
                  ? 'w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50'
                  : 'w-full text-left px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 cursor-not-allowed'
              }
            >
              <div className={k.ready ? 'text-sm font-medium text-gray-900' : 'text-sm font-medium text-gray-400'}>
                {k.label}
              </div>
              <div className="text-xs text-gray-500">{k.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 通知先の1行。
 *
 * ★ **何を送るかを、この行で見せて、この行から直せる。**
 *   以前は「通知先の表」と「どの出来事を送るか」を別の節に分けていたが、
 *   通知先が増えると目で突き合わせることになる(2026-08-23 ひろさん指摘)。
 */
function TargetRow({
  target,
  rules,
  events,
  onChange,
}: {
  target: Target
  rules: Rule[]
  events: NotifyEvent[]
  onChange: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // この通知先に紐づくルール。**1通知先につき1本**にする(複数あると何が送られるか読めない)
  const rule = rules.find((r) => r.targetId === target.id)
  const selected = rule?.eventTypes ?? []

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
    const warn =
      selected.length > 0
        ? 'この通知先を消すと、送る出来事の設定も消えます。よろしいですか。'
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
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3">
          <div className="text-sm font-medium text-gray-900">{target.label}</div>
          <div className="text-xs text-gray-500">
            {KIND_LABEL[target.kind] ?? target.kind}
            {result && <span className="ml-2 font-medium text-gray-700">{result}</span>}
          </div>
        </td>
        <td className="px-4 py-3">
          {selected.length === 0 ? (
            // ★ 何も送らない状態を**はっきり出す**。空欄だと「設定済み」に見える
            <span className="text-sm text-gray-400">まだ何も送りません</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selected.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700"
                >
                  {events.find((e) => e.key === k)?.label ?? k}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing((v) => !v)}
              disabled={busy}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {editing ? '閉じる' : '送る出来事を選ぶ'}
            </button>
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
        </td>
      </tr>
      {editing && (
        <tr className="bg-gray-50">
          <td colSpan={3} className="px-4 py-4">
            <EventEditor
              targetId={target.id}
              rule={rule}
              events={events}
              onDone={async () => {
                setEditing(false)
                await onChange()
              }}
            />
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * 送る出来事を選ぶ。
 *
 * ★ ルールがまだ無ければ作り、あれば直す。**画面には「ルール」という言葉を出さない**
 *   (顧客にとっては「この通知先に何を送るか」でしかない)。
 */
function EventEditor({
  targetId,
  rule,
  events,
  onDone,
}: {
  targetId: string
  rule: Rule | undefined
  events: NotifyEvent[]
  onDone: () => Promise<void>
}) {
  const [sel, setSel] = useState<string[]>(rule?.eventTypes ?? [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      if (sel.length === 0) {
        // ★ 全部外したら「送らない」。ルールを消すのが素直
        if (rule) await callApi(`/rules/${rule.id}`, { method: 'DELETE' })
      } else if (rule) {
        await callApi(`/rules/${rule.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ eventTypes: sel }),
        })
      } else {
        await callApi('/rules', {
          method: 'POST',
          body: JSON.stringify({ targetId, eventTypes: sel }),
        })
      }
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存できませんでした')
      setBusy(false)
    }
  }

  return (
    <div>
      <EventPicker
        events={events}
        selected={sel}
        onToggle={(k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}
      />
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: '#06C755' }}
        >
          {busy ? '保存中...' : '保存する'}
        </button>
        {sel.length === 0 && (
          <span className="text-xs text-gray-500">
            何も選ばずに保存すると、この通知先には送らなくなります
          </span>
        )}
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

  // ★ 幅100%のページに置くので、広い画面ではカラムを増やす
  //   (2カラム固定のまま横に伸ばすと、チェックボックスの間だけが間延びする)
  const grid = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4'

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
      <div className={grid}>{common.map(box)}</div>
      {(open || restSelected) && (
        <div className={`${grid} mt-2 pt-2 border-t border-gray-100`}>
          {rest.map(box)}
        </div>
      )}
      {!open && !restSelected && (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 text-xs text-gray-600 hover:text-gray-900 underline"
        >
          ほかの出来事も見る({rest.length}件)
        </button>
      )}
    </div>
  )
}

