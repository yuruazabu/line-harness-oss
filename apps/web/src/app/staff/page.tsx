'use client'
import { useState, useEffect } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'
import type { ApiResponse } from '@line-crm/shared'
import type { StaffMember } from '@line-crm/shared'


function RoleBadge({ role }: { role: string }) {
  const styles =
    role === 'owner'
      ? 'bg-yellow-100 text-yellow-800'
      : role === 'admin'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-gray-100 text-gray-600'
  const label =
    role === 'owner' ? 'オーナー' : role === 'admin' ? '管理者' : 'スタッフ'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles}`}>
      {label}
    </span>
  )
}


/** 招待中の相手。control-plane が持つ(この画面は表示するだけ) */
interface PendingInvite {
  id: string
  email: string
  role: string
  // ★ control-plane はDBの列名のまま返す(スネークケース)。
  //   キャメルケースで受けようとして undefined を出した(2026-08-23)
  expires_at: string
}

/**
 * 招待まわりは control-plane が正本。
 *
 * ★ ラッパーが `/api/__staff/*` を control-plane へ中継する。
 *   **テナントIDはこの画面から送らない**(ラッパーが付ける)。
 *   送らせると、値を書き換えて他人の契約にスタッフを足せる。
 */
async function staffApi(path: string, init?: RequestInit) {
  const res = await fetch(`/api/__staff${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`)
  return body
}

export default function StaffPage() {
  const [members, setMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingInvite[]>([])
  const [error, setError] = useState('')

  // New API key banner

  // Create form
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<'admin' | 'staff'>('staff')
  const [formLoading, setFormLoading] = useState(false)

  const loadMembers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<ApiResponse<StaffMember[]>>('/api/staff')
      if (res.success) {
        setMembers(res.data)
      } else {
        setError(res.error ?? 'スタッフの読み込みに失敗しました')
      }
    } catch {
      setError('スタッフの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const loadPending = async () => {
    try {
      const r = (await staffApi('/members')) as { invitations?: PendingInvite[] }
      setPending(r.invitations ?? [])
    } catch {
      // ★ 招待の一覧が取れなくても**スタッフ一覧は出す**。
      //   ここで画面を止めると、既存のスタッフ管理まで使えなくなる
      setPending([])
    }
  }

  useEffect(() => {
    loadMembers()
    void loadPending()
  }, [])


  const handleToggleActive = async (member: StaffMember) => {
    try {
      await fetchApi<ApiResponse<StaffMember>>(`/api/staff/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !member.isActive }),
      })
      await loadMembers()
    } catch {
      setError('更新に失敗しました')
    }
  }


  const handleDelete = async (member: StaffMember) => {
    if (!confirm(`${member.name} を削除しますか？\nこの操作は元に戻せません。`)) return
    try {
      await fetchApi<ApiResponse<null>>(`/api/staff/${member.id}`, { method: 'DELETE' })
      await loadMembers()
    } catch {
      setError('削除に失敗しました')
    }
  }


  return (
    <div>
      <Header
        title="スタッフ管理"
        action={
          <button
            onClick={() => setInviting(true)}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + スタッフを招待
          </button>
        }
      />

      {/* ★ 鍵の手渡しはしない。**メールアドレスの招待に一本化**してある
          (鍵は機械だけが持つ)。招待の発行・受諾・権限の判定は control-plane が持つが、
          顧客に2つの画面を行き来させないので、この画面から招待できる
          (2026-08-23 ひろさん指示)。 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        <p>
          招待された方は、そのメールアドレスでログインするとこの画面に入れます。
        </p>
      </div>

      {msg && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {msg}
        </div>
      )}

      {/* ★ **本家にあったエラー表示を、作り直したときに落としていた**(2026-08-23)。
          setError は呼ばれていたのに画面に出る場所が無く、読み込みが 403 で失敗しても
          「スタッフがいません」とだけ出ていた。**失敗を空と同じ顔で見せない。** */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ★ 招待中を**スタッフ一覧とは別に出す**。混ぜると「もう入れる人」と
          「まだ入っていない人」の区別が付かない */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">招待中</h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">メール</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ロール</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">期限</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{inv.email}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.role === 'admin' ? '管理者' : 'スタッフ'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(inv.expires_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={async () => {
                          if (!confirm(`${inv.email} への招待を取り消しますか。`)) return
                          try {
                            await staffApi(`/invitations/${inv.id}/revoke`, { method: 'POST' })
                            setMsg('招待を取り消しました。')
                            await loadPending()
                          } catch (e) {
                            setError(e instanceof Error ? e.message : '取り消せませんでした')
                          }
                        }}
                        className="px-3 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        取り消す
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-32" />
                <div className="h-2 bg-gray-100 rounded w-48" />
              </div>
              <div className="h-5 bg-gray-100 rounded-full w-16" />
              <div className="h-5 bg-gray-100 rounded w-24" />
              <div className="h-8 bg-gray-100 rounded w-20" />
            </div>
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          {/* 読み込みに失敗しているなら「いません」ではない。上のエラーに任せる */}
          <p className="text-gray-500 text-sm">
            {error
              ? 'スタッフの一覧を表示できませんでした。'
              : 'スタッフがいません。右上の「+ スタッフを招待」から招待してください。'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">名前</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">メール</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ロール</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状態</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{member.name}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{member.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={member.role} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${member.isActive ? 'text-green-700' : 'text-gray-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${member.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                      {member.isActive ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {member.role !== 'owner' && (
                        <>
                          <button
                            onClick={() => handleToggleActive(member)}
                            className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                          >
                            {member.isActive ? '無効化' : '有効化'}
                          </button>
                          <button
                            onClick={() => handleDelete(member)}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
        </div>
      )}
      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onDone={async (email) => {
            setInviting(false)
            setMsg(`${email} に招待を送りました。`)
            await loadPending()
          }}
        />
      )}
    </div>
  )
}

/**
 * スタッフを招待する。
 *
 * ★ **鍵を作らない。** メールアドレスに招待を送り、相手がそのアドレスで
 *   ログインするとこの画面に入れる。鍵の手渡しは事故のもとなのでやめてある。
 */
function InviteDialog({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (email: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'staff'>('staff')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await staffApi('/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role }),
      })
      await onDone(email.trim())
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '招待を送れませんでした')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">スタッフを招待</h2>
        <p className="text-sm text-gray-600 mb-4">
          招待メールを送ります。相手がそのアドレスでログインすると、この画面に入れます。
        </p>

        <label className="block text-xs font-medium text-gray-600 mb-1">メールアドレス</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="staff@example.com"
          className="mb-4 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />

        <label className="block text-xs font-medium text-gray-600 mb-1">権限</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}
          className="mb-4 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="staff">スタッフ（日々の運用ができます）</option>
          <option value="admin">管理者（設定も変えられます）</option>
        </select>

        {err && <p className="mb-3 text-xs text-red-600">{err}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            やめる
          </button>
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {busy ? '送信中...' : '招待を送る'}
          </button>
        </div>
      </form>
    </div>
  )
}
