import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('@line-crm/db', () => ({
  getIncomingWebhooks: vi.fn(),
  getIncomingWebhookById: vi.fn(),
  createIncomingWebhook: vi.fn(),
  updateIncomingWebhook: vi.fn(),
  deleteIncomingWebhook: vi.fn(),
  getOutgoingWebhooks: vi.fn(),
  getOutgoingWebhookById: vi.fn(),
  createOutgoingWebhook: vi.fn(),
  updateOutgoingWebhook: vi.fn(),
  deleteOutgoingWebhook: vi.fn(),
}));

// Stub fireEvent to keep receive-endpoint tests focused on signature
// verification rather than the full event-bus + DB graph.
vi.mock('../services/event-bus.js', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

// 配送そのものは outgoing-webhook-delivery.test.ts で見ている。
// ここではルートの契約（404・レスポンス形・エラーの出し方）だけを確認する。
vi.mock('../services/outgoing-webhook-delivery.js', () => ({
  deliverOutgoingWebhook: vi.fn(),
}));

import { deliverOutgoingWebhook } from '../services/outgoing-webhook-delivery.js';
import {
  getIncomingWebhooks,
  getIncomingWebhookById,
  createIncomingWebhook,
  updateIncomingWebhook,
  getOutgoingWebhooks,
  getOutgoingWebhookById,
  createOutgoingWebhook,
  updateOutgoingWebhook,
} from '@line-crm/db';
import { webhooks } from './webhooks.js';

const VALID_SECRET = 'a'.repeat(32);
const SHORT_SECRET = 'a'.repeat(31);

function setupApp() {
  const app = new Hono();
  app.route('/', webhooks);
  return app;
}

const baseEnv = { DB: {} as D1Database } as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================
// POST /api/webhooks/outgoing — validation
// =====================================================

describe('POST /api/webhooks/outgoing — validation', () => {
  test('rejects missing secret with 400', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', url: 'https://example.com/hook', eventTypes: ['*'] }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(createOutgoingWebhook).not.toHaveBeenCalled();
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/secret/i);
  });

  test('rejects secret shorter than 32 chars with 400', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test',
          url: 'https://example.com/hook',
          eventTypes: ['*'],
          secret: SHORT_SECRET,
        }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(createOutgoingWebhook).not.toHaveBeenCalled();
  });

  test('rejects http:// URL with 400', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test',
          url: 'http://example.com/hook',
          eventTypes: ['*'],
          secret: VALID_SECRET,
        }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(createOutgoingWebhook).not.toHaveBeenCalled();
  });

  test('rejects malformed URL with 400', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test',
          url: 'not-a-url',
          eventTypes: ['*'],
          secret: VALID_SECRET,
        }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(createOutgoingWebhook).not.toHaveBeenCalled();
  });

  test('accepts https:// + 32-char secret with 201, returns secret only on create', async () => {
    vi.mocked(createOutgoingWebhook).mockResolvedValue({
      id: 'wh-1',
      name: 'test',
      url: 'https://example.com/hook',
      event_types: '["*"]',
      secret: VALID_SECRET,
      is_active: 1,
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test',
          url: 'https://example.com/hook',
          eventTypes: ['*'],
          secret: VALID_SECRET,
        }),
      },
      baseEnv,
    );
    expect(res.status).toBe(201);
    expect(createOutgoingWebhook).toHaveBeenCalledOnce();
    const body = (await res.json()) as {
      success: boolean;
      data: { id: string; secret: string; name: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.secret).toBe(VALID_SECRET);
    expect(body.data.id).toBe('wh-1');
  });
});

// =====================================================
// PUT /api/webhooks/outgoing/:id — validation
// =====================================================

describe('PUT /api/webhooks/outgoing/:id — validation', () => {
  test('rejects updating to http:// URL with 400', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing/wh-1',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://evil.example.com/' }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(updateOutgoingWebhook).not.toHaveBeenCalled();
  });

  test('rejects updating secret to fewer than 32 chars with 400', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing/wh-1',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: SHORT_SECRET }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(updateOutgoingWebhook).not.toHaveBeenCalled();
  });

  test('rejects truthy non-boolean isActive with 400 (migration bypass)', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing/wh-legacy',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: 1 }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(updateOutgoingWebhook).not.toHaveBeenCalled();
    expect(getOutgoingWebhookById).not.toHaveBeenCalled();
  });

  test('rejects re-activating webhook whose stored secret is too short (migration bypass)', async () => {
    vi.mocked(getOutgoingWebhookById).mockResolvedValue({
      id: 'wh-legacy',
      name: 'legacy',
      url: 'https://example.com/hook',
      event_types: '["*"]',
      secret: null,
      is_active: 0,
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing/wh-legacy',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(updateOutgoingWebhook).not.toHaveBeenCalled();
  });

  test('rejects re-activating webhook whose stored URL is http:// (migration bypass)', async () => {
    vi.mocked(getOutgoingWebhookById).mockResolvedValue({
      id: 'wh-legacy-http',
      name: 'legacy-http',
      url: 'http://example.com/hook',
      event_types: '["*"]',
      secret: VALID_SECRET,
      is_active: 0,
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing/wh-legacy-http',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(updateOutgoingWebhook).not.toHaveBeenCalled();
  });

  test('accepts partial update without secret/url change', async () => {
    vi.mocked(getOutgoingWebhookById).mockResolvedValue({
      id: 'wh-1',
      name: 'renamed',
      url: 'https://example.com/hook',
      event_types: '["*"]',
      secret: VALID_SECRET,
      is_active: 1,
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/outgoing/wh-1',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'renamed' }),
      },
      baseEnv,
    );
    expect(res.status).toBe(200);
    expect(updateOutgoingWebhook).toHaveBeenCalledOnce();
  });
});

// =====================================================
// GET /api/webhooks/outgoing — secret must NOT be exposed
// =====================================================

describe('GET /api/webhooks/outgoing — secret exposure', () => {
  test('does not include secret in response payload', async () => {
    vi.mocked(getOutgoingWebhooks).mockResolvedValue([
      {
        id: 'wh-1',
        name: 'test',
        url: 'https://example.com/hook',
        event_types: '["*"]',
        secret: VALID_SECRET,
        is_active: 1,
        created_at: '2026-05-08T00:00:00.000+09:00',
        updated_at: '2026-05-08T00:00:00.000+09:00',
      },
    ]);

    const app = setupApp();
    const res = await app.request('/api/webhooks/outgoing', { method: 'GET' }, baseEnv);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(VALID_SECRET);
    const body = JSON.parse(text) as { data: Array<Record<string, unknown>> };
    expect(body.data[0]).not.toHaveProperty('secret');
    // Caller should be told a secret IS configured, just not its value
    expect(body.data[0].hasSecret).toBe(true);
  });

  test('hasSecret is false when secret is null in DB', async () => {
    vi.mocked(getOutgoingWebhooks).mockResolvedValue([
      {
        id: 'wh-2',
        name: 'legacy',
        url: 'https://example.com/hook',
        event_types: '["*"]',
        secret: null,
        is_active: 0,
        created_at: '2026-05-08T00:00:00.000+09:00',
        updated_at: '2026-05-08T00:00:00.000+09:00',
      },
    ]);

    const app = setupApp();
    const res = await app.request('/api/webhooks/outgoing', { method: 'GET' }, baseEnv);
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(body.data[0]).not.toHaveProperty('secret');
    expect(body.data[0].hasSecret).toBe(false);
  });
});

// =====================================================
// POST /api/webhooks/incoming — validation
// =====================================================

describe('POST /api/webhooks/incoming — validation', () => {
  test('rejects missing secret with 400', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/incoming',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(createIncomingWebhook).not.toHaveBeenCalled();
  });

  test('rejects secret shorter than 32 chars with 400', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/incoming',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', secret: SHORT_SECRET }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(createIncomingWebhook).not.toHaveBeenCalled();
  });

  test('accepts 32-char secret with 201, returns secret on create only', async () => {
    vi.mocked(createIncomingWebhook).mockResolvedValue({
      id: 'iwh-1',
      name: 'test',
      source_type: 'custom',
      secret: VALID_SECRET,
      is_active: 1,
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/incoming',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', secret: VALID_SECRET }),
      },
      baseEnv,
    );
    expect(res.status).toBe(201);
    expect(createIncomingWebhook).toHaveBeenCalledOnce();
    const body = (await res.json()) as { data: { id: string; secret: string } };
    expect(body.data.secret).toBe(VALID_SECRET);
  });
});

// =====================================================
// PUT /api/webhooks/incoming/:id — validation
// =====================================================

describe('PUT /api/webhooks/incoming/:id — validation', () => {
  test('rejects updating secret to fewer than 32 chars with 400', async () => {
    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/incoming/iwh-1',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: SHORT_SECRET }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(updateIncomingWebhook).not.toHaveBeenCalled();
  });

  test('rejects re-activating webhook whose stored secret is too short (migration bypass)', async () => {
    vi.mocked(getIncomingWebhookById).mockResolvedValue({
      id: 'iwh-legacy',
      name: 'legacy',
      source_type: 'custom',
      secret: null,
      is_active: 0,
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/incoming/iwh-legacy',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    expect(updateIncomingWebhook).not.toHaveBeenCalled();
  });
});

// =====================================================
// GET /api/webhooks/incoming — secret must NOT be exposed
// =====================================================

describe('GET /api/webhooks/incoming — secret exposure', () => {
  test('does not include secret in response payload', async () => {
    vi.mocked(getIncomingWebhooks).mockResolvedValue([
      {
        id: 'iwh-1',
        name: 'test',
        source_type: 'custom',
        secret: VALID_SECRET,
        is_active: 1,
        created_at: '2026-05-08T00:00:00.000+09:00',
        updated_at: '2026-05-08T00:00:00.000+09:00',
      },
    ]);

    const app = setupApp();
    const res = await app.request('/api/webhooks/incoming', { method: 'GET' }, baseEnv);
    const text = await res.text();
    expect(text).not.toContain(VALID_SECRET);
    const body = JSON.parse(text) as { data: Array<Record<string, unknown>> };
    expect(body.data[0]).not.toHaveProperty('secret');
    expect(body.data[0].hasSecret).toBe(true);
  });
});

// =====================================================
// POST /api/webhooks/incoming/:id/receive — signature verification
// =====================================================

describe('POST /api/webhooks/incoming/:id/receive — signature', () => {
  test('rejects request without X-Webhook-Signature with 401', async () => {
    vi.mocked(getIncomingWebhookById).mockResolvedValue({
      id: 'iwh-1',
      name: 'test',
      source_type: 'custom',
      secret: VALID_SECRET,
      is_active: 1,
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/incoming/iwh-1/receive',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: true }),
      },
      baseEnv,
    );
    expect(res.status).toBe(401);
  });

  test('rejects invalid signature with 401', async () => {
    vi.mocked(getIncomingWebhookById).mockResolvedValue({
      id: 'iwh-1',
      name: 'test',
      source_type: 'custom',
      secret: VALID_SECRET,
      is_active: 1,
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/incoming/iwh-1/receive',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': 'deadbeef',
        },
        body: JSON.stringify({ ping: true }),
      },
      baseEnv,
    );
    expect(res.status).toBe(401);
  });

  test('accepts valid HMAC-SHA256 hex signature', async () => {
    vi.mocked(getIncomingWebhookById).mockResolvedValue({
      id: 'iwh-1',
      name: 'test',
      source_type: 'custom',
      secret: VALID_SECRET,
      is_active: 1,
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const body = JSON.stringify({ ping: true });
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(VALID_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const hexSignature = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const app = setupApp();
    const res = await app.request(
      '/api/webhooks/incoming/iwh-1/receive',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': hexSignature,
        },
        body,
      },
      baseEnv,
    );
    expect(res.status).toBe(200);
  });
});

// =====================================================
// POST /api/webhooks/outgoing/:id/test — テスト送信
// =====================================================

describe('POST /api/webhooks/outgoing/:id/test', () => {
  const mockDeliver = deliverOutgoingWebhook as unknown as {
    mockResolvedValue: (v: unknown) => void;
    mockRejectedValue: (v: unknown) => void;
    mock: { calls: unknown[][] };
  };

  test('存在しないIDは404', async () => {
    (getOutgoingWebhookById as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      null,
    );
    const app = setupApp();
    const res = await app.request('/api/webhooks/outgoing/nope/test', { method: 'POST' }, baseEnv);
    expect(res.status).toBe(404);
  });

  test('宛先が成功したら ok:true を返す', async () => {
    (getOutgoingWebhookById as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      { id: 'wh-1', url: 'https://hooks.slack.com/services/T1/B2/x', secret: VALID_SECRET, is_active: 1 },
    );
    mockDeliver.mockResolvedValue({ kind: 'sent', slack: true, status: 200, ok: true, body: 'ok' });

    const app = setupApp();
    const res = await app.request('/api/webhooks/outgoing/wh-1/test', { method: 'POST' }, baseEnv);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ sent: true, slack: true, ok: true, isActive: true });
  });

  test('宛先が失敗しても200で返し、宛先の応答をそのまま載せる', async () => {
    (getOutgoingWebhookById as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      { id: 'wh-1', url: 'https://hooks.slack.com/services/T1/B2/x', secret: VALID_SECRET, is_active: 0 },
    );
    mockDeliver.mockResolvedValue({
      kind: 'sent',
      slack: true,
      status: 404,
      ok: false,
      body: 'no_team',
    });

    const app = setupApp();
    const res = await app.request('/api/webhooks/outgoing/wh-1/test', { method: 'POST' }, baseEnv);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    // 無効化中でもテスト送信はできる。画面側が注意を出せるよう isActive を返す
    expect(json.data).toMatchObject({ ok: false, status: 404, body: 'no_team', isActive: false });
  });

  test('宛先に到達できない（fetchが例外）ときも200で理由を返す', async () => {
    (getOutgoingWebhookById as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      { id: 'wh-1', url: 'https://hooks.slack.com/services/T1/B2/x', secret: VALID_SECRET, is_active: 1 },
    );
    mockDeliver.mockRejectedValue(new Error('network down'));

    const app = setupApp();
    const res = await app.request('/api/webhooks/outgoing/wh-1/test', { method: 'POST' }, baseEnv);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data.ok).toBe(false);
    expect(String(json.data.body)).toContain('network down');
  });

  test('本番と同じ配送関数に、テスト用の疑似イベントで渡す', async () => {
    (getOutgoingWebhookById as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      { id: 'wh-1', url: 'https://hooks.slack.com/services/T1/B2/x', secret: VALID_SECRET, is_active: 1 },
    );
    mockDeliver.mockResolvedValue({ kind: 'sent', slack: true, status: 200, ok: true, body: 'ok' });

    const app = setupApp();
    await app.request('/api/webhooks/outgoing/wh-1/test', { method: 'POST' }, baseEnv);

    const call = mockDeliver.mock.calls[0];
    expect(call[2]).toBe('test_notification');
    expect(call[4]).toMatchObject({ captureBody: true, displayName: null });
  });
});
