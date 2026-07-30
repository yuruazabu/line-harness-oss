import { describe, expect, it, vi, afterEach } from 'vitest';
import { deliverOutgoingWebhook } from './outgoing-webhook-delivery.js';
import { TEST_EVENT_TYPE } from './slack-webhook.js';

const SLACK_URL = 'https://hooks.slack.com/services/T1/B2/xxx';
const OTHER_URL = 'https://example.com/hook';

function dbWithFriend(displayName: string | null): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async all<T>(): Promise<{ results: T[] }> {
          return { results: [] };
        },
        async first<T>(): Promise<T | null> {
          if (sql.includes('display_name')) return { display_name: displayName } as T;
          return null;
        },
        async run(): Promise<{ success: true }> {
          return { success: true };
        },
      };
    },
  } as unknown as D1Database;
}

describe('deliverOutgoingWebhook', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('Slack宛は Slack 形式に整形し、HMAC署名を付けない', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deliverOutgoingWebhook(
      dbWithFriend('ゆる麻布'),
      { id: 'wh-1', url: SLACK_URL, secret: 'unused-for-slack' },
      'message_received',
      { friendId: 'friend-1', eventData: { text: '料金を知りたい', matched: false } },
    );

    expect(result).toMatchObject({ kind: 'sent', slack: true, status: 200, ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-Webhook-Signature']).toBeUndefined();
    const body = JSON.parse(init.body as string);
    expect(JSON.stringify(body.blocks)).toContain('*ゆる麻布* さんからLINEメッセージ');
  });

  it('自動応答が返したメッセージは Slack に送らずスキップする', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await deliverOutgoingWebhook(
      dbWithFriend('ゆる麻布'),
      { id: 'wh-1', url: SLACK_URL, secret: null },
      'message_received',
      { friendId: 'friend-1', eventData: { text: '資料請求', matched: true } },
    );

    expect(result).toEqual({ kind: 'skipped', reason: 'slack_auto_reply' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Slack以外は素のペイロード + HMAC署名で送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deliverOutgoingWebhook(
      dbWithFriend(null),
      { id: 'wh-2', url: OTHER_URL, secret: 'a'.repeat(32) },
      'friend_add',
      { friendId: 'friend-1', eventData: { displayName: '田中' } },
    );

    expect(result).toMatchObject({ kind: 'sent', slack: false, status: 204, ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-Webhook-Signature']).toMatch(/^[0-9a-f]{64}$/);
    const body = JSON.parse(init.body as string);
    expect(body.event).toBe('friend_add');
    expect(body.data.eventData.displayName).toBe('田中');
  });

  it('captureBody=false のとき、成功レスポンスの本文は読まない', async () => {
    const text = vi.fn().mockResolvedValue('ok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text }));

    const result = await deliverOutgoingWebhook(
      dbWithFriend(null),
      { id: 'wh-1', url: SLACK_URL, secret: null },
      'message_received',
      { eventData: { text: 'こんにちは' } },
    );

    expect(result).toMatchObject({ ok: true, body: '' });
    expect(text).not.toHaveBeenCalled();
  });

  it('失敗レスポンスは captureBody=false でも本文を載せる（ログ用）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'no_team' }),
    );

    const result = await deliverOutgoingWebhook(
      dbWithFriend(null),
      { id: 'wh-1', url: SLACK_URL, secret: null },
      'message_received',
      { eventData: { text: 'こんにちは' } },
    );

    expect(result).toMatchObject({ kind: 'sent', slack: true, ok: false, status: 404, body: 'no_team' });
  });

  it('テスト送信の疑似イベントは専用の見出しになり、表示名の上書きが効く', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    vi.stubGlobal('fetch', fetchMock);

    await deliverOutgoingWebhook(
      dbWithFriend('引かれてはいけない名前'),
      { id: 'wh-1', url: SLACK_URL, secret: null },
      TEST_EVENT_TYPE,
      { eventData: { text: 'テストです' } },
      { captureBody: true, displayName: null },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toBe('line-harness からのテスト通知');
    const blocks = JSON.stringify(body.blocks);
    expect(blocks).toContain('*line-harness* からのテスト通知');
    expect(blocks).toContain('テスト送信 ');
    // displayName を明示したので D1 の表示名は使われない
    expect(blocks).not.toContain('引かれてはいけない名前');
  });
});
