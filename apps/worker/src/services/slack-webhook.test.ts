import { describe, expect, it } from 'vitest';
import {
  buildSlackPayload,
  isSlackIncomingWebhook,
  resolveDisplayName,
  shouldNotifySlack,
} from './slack-webhook.js';

describe('isSlackIncomingWebhook', () => {
  it('hooks.slack.com を Slack と判定する', () => {
    expect(isSlackIncomingWebhook('https://hooks.slack.com/services/T1/B2/xxx')).toBe(true);
  });

  it('他ホストは Slack 扱いしない', () => {
    expect(isSlackIncomingWebhook('https://example.com/webhook')).toBe(false);
    // ホスト名の部分一致で誤判定しないこと
    expect(isSlackIncomingWebhook('https://hooks.slack.com.evil.test/x')).toBe(false);
  });

  it('URL として壊れていても落ちない', () => {
    expect(isSlackIncomingWebhook('not a url')).toBe(false);
  });
});

describe('shouldNotifySlack', () => {
  it('自動応答が返したメッセージは通知しない', () => {
    expect(shouldNotifySlack('message_received', { text: 'こんにちは', matched: true })).toBe(false);
  });

  it('自動応答にマッチしなかったメッセージは通知する', () => {
    expect(shouldNotifySlack('message_received', { text: 'こんにちは', matched: false })).toBe(true);
  });

  it('message_received 以外は matched に関係なく通知する', () => {
    expect(shouldNotifySlack('friend_add', { matched: true })).toBe(true);
  });
});

describe('buildSlackPayload', () => {
  it('受信メッセージを引用付きで組み立てる', () => {
    const payload = buildSlackPayload({
      eventType: 'message_received',
      timestamp: '2026-07-30T09:00:00.000',
      displayName: 'ゆる麻布',
      eventData: { text: '料金について知りたいです', matched: false },
    });
    const section = JSON.stringify(payload.blocks[0]);
    expect(section).toContain('*ゆる麻布* さんからLINEメッセージ');
    expect(section).toContain('> 料金について知りたいです');
    expect(payload.text).toContain('ゆる麻布');
  });

  it('mrkdwn の制御文字をエスケープする', () => {
    const payload = buildSlackPayload({
      eventType: 'message_received',
      timestamp: '2026-07-30T09:00:00.000',
      displayName: '<script>',
      eventData: { text: 'a & b <c>' },
    });
    const section = JSON.stringify(payload.blocks[0]);
    expect(section).toContain('&lt;script&gt;');
    expect(section).toContain('a &amp; b &lt;c&gt;');
    expect(section).not.toContain('<script>');
  });

  it('改行は各行を引用にする', () => {
    const payload = buildSlackPayload({
      eventType: 'message_received',
      timestamp: '',
      displayName: 'A',
      eventData: { text: '1行目\n2行目' },
    });
    expect(JSON.stringify(payload.blocks[0])).toContain('> 1行目\\n> 2行目');
  });

  it('長文は切り詰める', () => {
    const payload = buildSlackPayload({
      eventType: 'message_received',
      timestamp: '',
      displayName: 'A',
      eventData: { text: 'あ'.repeat(2500) },
    });
    expect(JSON.stringify(payload.blocks[0])).toContain('（以下略）');
  });

  it('表示名が無いときはフォールバックする', () => {
    const payload = buildSlackPayload({
      eventType: 'friend_add',
      timestamp: '',
      displayName: null,
    });
    expect(JSON.stringify(payload.blocks[0])).toContain('名前不明の友だち');
    expect(JSON.stringify(payload.blocks[0])).toContain('友だち追加しました');
  });

  it('未知のイベントでも本文を作る', () => {
    const payload = buildSlackPayload({
      eventType: 'something_new',
      timestamp: '',
      displayName: 'A',
    });
    expect(JSON.stringify(payload.blocks[0])).toContain('something_new');
  });

  it('timestamp が空なら context ブロックを付けない', () => {
    const payload = buildSlackPayload({
      eventType: 'friend_add',
      timestamp: '',
      displayName: 'A',
    });
    expect(payload.blocks).toHaveLength(1);
  });
});

describe('resolveDisplayName', () => {
  function fakeDb(row: { display_name: string | null } | null): D1Database {
    return {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            return row;
          },
        };
      },
    } as unknown as D1Database;
  }

  it('friends から表示名を引く', async () => {
    await expect(resolveDisplayName(fakeDb({ display_name: 'ゆる麻布' }), 'f1')).resolves.toBe(
      'ゆる麻布',
    );
  });

  it('friendId が無いときは null', async () => {
    await expect(resolveDisplayName(fakeDb(null), undefined)).resolves.toBeNull();
  });

  it('該当行が無いときは null', async () => {
    await expect(resolveDisplayName(fakeDb(null), 'f1')).resolves.toBeNull();
  });
});
