/**
 * 送信Webhook の Slack 対応。
 *
 * Slack の Incoming Webhook は `{ text }` / `{ blocks }` 形式しか受け付けないため、
 * line-harness の素のペイロード `{ event, timestamp, data }` をそのまま POST すると
 * invalid_payload で拒否される（かつ送信Webhookは失敗を握り潰すので気づけない）。
 *
 * そこで送信先が Slack の Incoming Webhook のときだけ、Slack が読める形に整形する。
 * 管理画面の「送信Webhook」に hooks.slack.com の URL を登録するだけで通知が飛ぶ。
 */

/** Slack の Incoming Webhook URL か */
export function isSlackIncomingWebhook(url: string): boolean {
  try {
    return new URL(url).hostname === 'hooks.slack.com';
  } catch {
    return false;
  }
}

/** Slack の 1 block あたりのテキスト上限は 3000 文字。余裕をみて切る。 */
const MAX_TEXT_LENGTH = 2000;

export interface SlackNotificationInput {
  eventType: string;
  timestamp: string;
  displayName: string | null;
  eventData?: Record<string, unknown>;
}

/**
 * Slack に流すかどうか。
 *
 * 自動応答が返したメッセージは人間の対応が要らないため通知しない
 * （`eventData.matched` は webhook.ts が auto_replies にマッチしたかを載せている）。
 */
export function shouldNotifySlack(
  eventType: string,
  eventData?: Record<string, unknown>,
): boolean {
  if (eventType === 'message_received' && eventData?.matched === true) return false;
  return true;
}

/** Slack mrkdwn の制御文字をエスケープ（友だちが送った文面をそのまま埋め込むため） */
function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function quote(text: string): string {
  const truncated =
    text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…（以下略）` : text;
  return escapeSlack(truncated)
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/** イベント種別ごとの見出し。未知のイベントもそのまま名前を出して落とさない。 */
function headline(eventType: string, name: string): string {
  switch (eventType) {
    case 'message_received':
      return `*${name}* さんからLINEメッセージ`;
    case 'friend_add':
      return `*${name}* さんが友だち追加しました`;
    case 'tag_change':
      return `*${name}* さんのタグが変更されました`;
    case 'cv_fire':
      return `*${name}* さんがコンバージョンしました`;
    default:
      return `*${name}* / イベント \`${escapeSlack(eventType)}\``;
  }
}

export function buildSlackPayload(input: SlackNotificationInput): {
  text: string;
  blocks: unknown[];
} {
  const name = escapeSlack(input.displayName ?? '名前不明の友だち');
  const head = headline(input.eventType, name);

  const body: string[] = [head];
  const text = typeof input.eventData?.text === 'string' ? input.eventData.text : null;
  if (text) body.push(quote(text));

  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text: body.join('\n') } },
  ];
  if (input.timestamp) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `受信 ${escapeSlack(input.timestamp)}` }],
    });
  }

  // text は通知プレビュー / フォールバック用（Slack の必須項目）。装飾は入れない。
  return { text: `${input.displayName ?? '名前不明の友だち'} — ${input.eventType}`, blocks };
}

/** 送信Webhook のペイロードに表示名は入っていないので D1 から引く。失敗しても通知は止めない。 */
export async function resolveDisplayName(
  db: D1Database,
  friendId: string | undefined,
): Promise<string | null> {
  if (!friendId) return null;
  try {
    const row = await db
      .prepare('SELECT display_name FROM friends WHERE id = ?')
      .bind(friendId)
      .first<{ display_name: string | null }>();
    return row?.display_name ?? null;
  } catch (err) {
    console.error('Slack通知: 表示名の取得に失敗', err);
    return null;
  }
}
