/**
 * 送信Webhook の配送処理。
 *
 * イベント発火時（`event-bus.ts`）と管理画面からのテスト送信
 * （`routes/webhooks.ts` の `/api/webhooks/outgoing/:id/test`）で
 * **同じ経路を通す**ために切り出している。
 * テストボタンが本番と別経路だと「テストは成功するのに本番では飛ばない」を
 * 作り込むため、整形・署名・宛先判定はここに1本化する。
 */

import { jstNow } from '@line-crm/db';
import {
  buildSlackPayload,
  isSlackIncomingWebhook,
  resolveDisplayName,
  shouldNotifySlack,
} from './slack-webhook.js';

/** 配送に必要な最小限の送信Webhook情報 */
export interface OutgoingWebhookTarget {
  id: string;
  url: string;
  secret: string | null;
}

/**
 * 配送するペイロード。`event-bus` の `EventPayload` をそのまま渡せるように
 * 必要な項目だけを要求する（Slack以外の宛先には受け取ったオブジェクト全体が
 * `data` として載るので、ここに書いていない項目も欠落しない）。
 */
export interface DeliveryPayload {
  friendId?: string;
  eventData?: Record<string, unknown>;
}

export interface DeliveryOptions {
  /**
   * レスポンスボディを読むか。管理画面のテスト送信は Slack のエラー内容
   * （`no_team` / `invalid_token` 等）をそのまま画面に出したいので true。
   * イベント発火時は失敗時のみ読む（正常時に第三者のレスポンスを
   * 読み込まない従来の挙動を保つ）。
   */
  captureBody?: boolean;
  /** 表示名の上書き。省略時は payload.friendId から D1 を引く */
  displayName?: string | null;
}

export type DeliveryResult =
  | { kind: 'skipped'; reason: 'slack_auto_reply' }
  | { kind: 'sent'; slack: boolean; status: number; ok: boolean; body: string };

/** レスポンスボディは画面表示・ログ用なので長すぎるものは切る */
const MAX_BODY_LENGTH = 500;

async function readBody(res: Response, capture: boolean): Promise<string> {
  if (!capture && res.ok) return '';
  try {
    return (await res.text()).slice(0, MAX_BODY_LENGTH);
  } catch {
    return '';
  }
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 送信Webhook 1件へ配送する。
 *
 * - 宛先が Slack の Incoming Webhook → Slack が読める形に整形して POST（署名なし。URL自体が秘密）
 * - それ以外 → 素のペイロード `{event, timestamp, data}` + `X-Webhook-Signature`
 *
 * fetch 自体の例外は呼び出し側に投げる（発火時は握り潰し、テスト送信は画面に出す）。
 */
export async function deliverOutgoingWebhook(
  db: D1Database,
  wh: OutgoingWebhookTarget,
  eventType: string,
  payload: DeliveryPayload,
  opts: DeliveryOptions = {},
): Promise<DeliveryResult> {
  const capture = opts.captureBody === true;

  if (isSlackIncomingWebhook(wh.url)) {
    if (!shouldNotifySlack(eventType, payload.eventData)) {
      return { kind: 'skipped', reason: 'slack_auto_reply' };
    }
    const displayName =
      opts.displayName !== undefined
        ? opts.displayName
        : await resolveDisplayName(db, payload.friendId);
    const body = JSON.stringify(
      buildSlackPayload({
        eventType,
        timestamp: jstNow(),
        displayName,
        eventData: payload.eventData,
      }),
    );
    const res = await fetch(wh.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return {
      kind: 'sent',
      slack: true,
      status: res.status,
      ok: res.ok,
      body: await readBody(res, capture),
    };
  }

  const body = JSON.stringify({ event: eventType, timestamp: jstNow(), data: payload });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (wh.secret) {
    headers['X-Webhook-Signature'] = await hmacSha256Hex(wh.secret, body);
  }
  const res = await fetch(wh.url, { method: 'POST', headers, body });
  return {
    kind: 'sent',
    slack: false,
    status: res.status,
    ok: res.ok,
    body: await readBody(res, capture),
  };
}
