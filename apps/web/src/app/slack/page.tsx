'use client'

/**
 * Slack通知の設定画面。
 *
 * 裏側は汎用の「送信Webhook」（`outgoing_webhooks`）そのままで、専用テーブルは持たない。
 * 送信先が hooks.slack.com のとき Worker が Slack 形式に整形して送る仕組みなので、
 * この画面は「Slack宛の送信Webhook 1件」を分かりやすく扱うための皮。
 *
 * 汎用Webhookページで手作業だった次の3点を吸収する:
 *   1. イベント名（`message_received` 等のアンダースコア表記）を手打ちしない
 *   2. Slackでは使われない secret を自動生成する（APIが32文字以上を要求するため必須）
 *   3. 宛先がSlackのURLかを検証する（違うと整形されず素のペイロードが飛ぶ）
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/header'
import { api } from '@/lib/api'
import CcPromptButton from '@/components/cc-prompt-button'
import type { OutgoingWebhook, OutgoingWebhookTestResult } from '@line-crm/shared'

const SLACK_HOSTNAME = 'hooks.slack.com'
const WEBHOOK_NAME = 'Slack通知'

/**
 * 通知できるイベント。
 * value は **Worker が実際に発火する名前**（アンダースコア表記）。
 * 汎用Webhookページのプレースホルダはドット表記だが、あれは誤りで一切発火しない。
 */
const EVENT_CHOICES = [
  {
    value: 'message_received',
    label: '友だちからのメッセージ',
    note: 'テキストのみ。自動応答が返したものは通知しない',
  },
  { value: 'friend_add', label: '友だち追加', note: '新しく友だちになったとき' },
  { value: 'cv_fire', label: 'コンバージョン', note: 'CV計測が発火したとき' },
  { value: 'tag_change', label: 'タグの変更', note: 'タグが付いた・外れたとき' },
] as const

const ccPrompts = [
  {
    title: 'Slack通知の設定',
    prompt: `LINE受信メッセージのSlack通知を設定したいです。
1. Slack の Incoming Webhook URL の発行手順（api.slack.com でのアプリ作成から）
2. 通知対象イベントの選び方
3. 届かないときの調べ方
手順を示してください。`,
  },
  {
    title: 'Slack通知が届かない',
    prompt: `Slack通知が届きません。原因を切り分けてください。
1. 送信Webhookの登録内容（URL・イベント名・有効フラグ）の確認
2. テスト送信の結果の読み方（Slackが返すエラー本文の意味）
3. Worker のログの見方
手順を示してください。`,
  },
]

/**
 * 32文字のURLセーフなランダム文字列。Slack宛では使われないが API が必須にしている。
 * webhooks ページと同じ生成方法（24バイト → base64で正確に32文字）。
 */
function generateSecret(): string {
  const buf = new Uint8Array(24)
  crypto.getRandomValues(buf)
  let s = ''
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function isSlackUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.hostname === SLACK_HOSTNAME
  } catch {
    return false
  }
}

/** 保存済みURLはそのまま出さない（URLを知られると誰でも投稿できるため） */
function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const head = parts.slice(0, 2).join('/')
    return `${u.origin}/${head}/••••••••`
  } catch {
    return '••••••••'
  }
}

export default function SlackPage() {
  const [hook, setHook] = useState<OutgoingWebhook | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [testResult, setTestResult] = useState<OutgoingWebhookTestResult | null>(null)

  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['message_received'])
  const [editingUrl, setEditingUrl] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await api.webhooks.outgoing.list()
    if (!res.success) {
      setError('Slack通知の設定を取得できませんでした')
      setLoading(false)
      return
    }
    // Slack宛の送信Webhookを拾う。複数あっても先頭を設定対象として扱う
    // （複数チャンネルに送りたい場合は汎用Webhookページで足す運用）。
    const slack = res.data.filter((w) => {
      try {
        return new URL(w.url).hostname === SLACK_HOSTNAME
      } catch {
        return false
      }
    })
    const target = slack[0] ?? null
    setHook(target)
    setEvents(target?.eventTypes?.length ? target.eventTypes : ['message_received'])
    setEditingUrl(target === null)
    setUrl('')
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleEvent = (value: string) => {
    setEvents((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  const save = async () => {
    setError('')
    setNotice('')
    setTestResult(null)

    if (events.length === 0) {
      setError('通知するイベントを1つ以上選んでください')
      return
    }
    // URLは新規登録時、または「変更する」を押したときだけ検証・送信する。
    const urlChanged = editingUrl && url.trim().length > 0
    if (!hook && !urlChanged) {
      setError('Slack の Incoming Webhook URL を入力してください')
      return
    }
    if (urlChanged && !isSlackUrl(url.trim())) {
      setError(`URLが Slack のものではありません（https://${SLACK_HOSTNAME}/services/... の形式）`)
      return
    }

    setSaving(true)
    try {
      if (!hook) {
        const res = await api.webhooks.outgoing.create({
          name: WEBHOOK_NAME,
          url: url.trim(),
          eventTypes: events,
          secret: generateSecret(),
        })
        if (!res.success) {
          setError(res.error ?? '保存に失敗しました')
          return
        }
        setNotice('Slack通知を有効にしました')
      } else {
        const res = await api.webhooks.outgoing.update(hook.id, {
          eventTypes: events,
          ...(urlChanged ? { url: url.trim() } : {}),
        })
        if (!res.success) {
          setError(res.error ?? '保存に失敗しました')
          return
        }
        setNotice('設定を保存しました')
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  const setActive = async (isActive: boolean) => {
    if (!hook) return
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const res = await api.webhooks.outgoing.update(hook.id, { isActive })
      if (!res.success) {
        setError(res.error ?? '切り替えに失敗しました')
        return
      }
      setNotice(isActive ? '通知を再開しました' : '通知を停止しました')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    if (!hook) return
    setError('')
    setNotice('')
    setTestResult(null)
    setTesting(true)
    try {
      const res = await api.webhooks.outgoing.test(hook.id)
      if (!res.success) {
        setError(res.error ?? 'テスト送信に失敗しました')
        return
      }
      setTestResult(res.data)
    } finally {
      setTesting(false)
    }
  }

  const remove = async () => {
    if (!hook) return
    if (!confirm('Slack通知を解除します。よろしいですか？')) return
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const res = await api.webhooks.outgoing.delete(hook.id)
      if (!res.success) {
        setError(res.error ?? '解除に失敗しました')
        return
      }
      setNotice('Slack通知を解除しました')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const status = !hook ? 'unset' : hook.isActive ? 'active' : 'paused'

  return (
    <div>
      <Header
        title="Slack通知"
        description="LINEで起きたことを Slack チャンネルに通知します。"
      />

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 rounded bg-green-50 border border-green-200 text-green-700 text-sm mb-4">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          読み込み中...
        </div>
      ) : (
        <div className="space-y-6">
          {/* 状態 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    status === 'active'
                      ? 'bg-green-500'
                      : status === 'paused'
                        ? 'bg-yellow-500'
                        : 'bg-gray-300'
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {status === 'active' ? '通知中' : status === 'paused' ? '停止中' : '未設定'}
                  </p>
                  {hook && (
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{maskUrl(hook.url)}</p>
                  )}
                </div>
              </div>
              {hook && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={sendTest}
                    disabled={testing || saving}
                    className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testing ? '送信中...' : 'テスト送信'}
                  </button>
                  <button
                    onClick={() => setActive(!hook.isActive)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {hook.isActive ? '停止' : '再開'}
                  </button>
                </div>
              )}
            </div>

            {testResult && (
              <div
                className={`mt-4 p-3 rounded text-sm border ${
                  testResult.ok
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {testResult.ok ? (
                  <p>Slack に送信しました。チャンネルに届いているか確認してください。</p>
                ) : (
                  <>
                    <p className="font-medium">送信できませんでした。</p>
                    <p className="mt-1 font-mono text-xs break-all">
                      status={testResult.status} {testResult.body}
                    </p>
                    <p className="mt-2 text-xs">
                      Slack が返した内容です。<code>no_team</code> や <code>invalid_token</code> は、URLが誤っているか、Slack 側でこの Incoming Webhook が削除されています。
                    </p>
                  </>
                )}
                {testResult.ok && testResult.isActive === false && (
                  <p className="mt-2 text-xs">
                    ※ 現在「停止中」です。実際のイベントは通知されません。「再開」を押してください。
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 設定 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slack の Incoming Webhook URL
              </label>
              {hook && !editingUrl ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-2 rounded border border-gray-200 bg-gray-50 text-sm text-gray-500 font-mono">
                    {maskUrl(hook.url)}
                  </span>
                  <button
                    onClick={() => setEditingUrl(true)}
                    className="px-3 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 shrink-0"
                  >
                    変更する
                  </button>
                </div>
              ) : (
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={`https://${SLACK_HOSTNAME}/services/T00000000/B00000000/xxxxxxxx`}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm font-mono"
                />
              )}
              <p className="mt-2 text-xs text-gray-500">
                {/* 日本語の途中で改行すると JSX が空白を挟むため、文は1行に保つ */}
                Slack の管理画面（api.slack.com/apps）でアプリを作り、「Incoming Webhooks」を有効にして通知先チャンネルを選ぶと発行されます。
                <strong className="text-gray-700">
                  このURLを知っていれば誰でもチャンネルに投稿できる
                </strong>
                ので、保存後は伏せて表示します。
              </p>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">通知するイベント</span>
              <div className="space-y-2">
                {EVENT_CHOICES.map((choice) => (
                  <label key={choice.value} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={events.includes(choice.value)}
                      onChange={() => toggleEvent(choice.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm text-gray-900">{choice.label}</span>
                      <span className="block text-xs text-gray-500">{choice.note}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : hook ? '保存' : '有効にする'}
              </button>
              {hook && (
                <button
                  onClick={remove}
                  disabled={saving}
                  className="px-3 py-2 rounded text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  解除
                </button>
              )}
            </div>
          </div>

          {/* 仕様の注意書き */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 text-sm text-gray-600 space-y-2">
            <p className="font-medium text-gray-700">仕様上の注意</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                通知されるのは<strong>テキストメッセージだけ</strong>です。画像・スタンプ・動画・位置情報は通知されません（受信箱には残ります）。
              </li>
              <li>
                <strong>自動応答が返したメッセージは通知しません</strong>。人の対応が要るものだけが流れます。
              </li>
              <li>
                再送はしません。Slack 側が一時的に落ちていた場合、その通知は失われます。
              </li>
              <li>
                この設定は{' '}
                <Link href="/webhooks" className="text-blue-600 hover:underline">
                  Webhook
                </Link>{' '}
                ページの「送信Webhook」一覧にも表示されます（同じものです）。
              </li>
            </ul>
          </div>
        </div>
      )}

      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
