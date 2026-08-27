import { jstNow } from './utils.js';

/**
 * Server-side admin sessions. The cookie holds an opaque random token; the DB
 * stores only its SHA-256, so a DB read can't be replayed as a cookie. The
 * staff identity is denormalized at login time — a session stays valid for its
 * lifetime even if the staff row is edited (role changes apply on next login),
 * and env-owner logins (no staff row) need no FK.
 */
export interface AdminSession {
  token_hash: string;
  staff_id: string;
  staff_name: string;
  staff_role: 'owner' | 'admin' | 'staff';
  expires_at: string;
  created_at: string;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `lhs_${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function createAdminSession(
  db: D1Database,
  staff: { id: string; name: string; role: 'owner' | 'admin' | 'staff' },
  maxAgeSeconds: number,
): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
  await db
    .prepare(
      'INSERT INTO admin_sessions (token_hash, staff_id, staff_name, staff_role, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(await sha256Hex(token), staff.id, staff.name, staff.role, expiresAt, jstNow())
    .run();
  return token;
}

export async function getAdminSession(
  db: D1Database,
  token: string,
): Promise<AdminSession | null> {
  const row = await db
    .prepare('SELECT * FROM admin_sessions WHERE token_hash = ?')
    .bind(await sha256Hex(token))
    .first<AdminSession>();
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    await db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(row.token_hash).run();
    return null;
  }
  return row;
}

export async function deleteAdminSession(db: D1Database, token: string): Promise<void> {
  await db
    .prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
    .bind(await sha256Hex(token))
    .run();
}

/** Opportunistic cleanup — called on login so the table never needs a cron. */
export async function purgeExpiredAdminSessions(db: D1Database): Promise<void> {
  await db
    .prepare('DELETE FROM admin_sessions WHERE expires_at < ?')
    .bind(new Date().toISOString())
    .run();
}

/**
 * Revoke every session belonging to a staff member.
 *
 * Before opaque tokens the session cookie *was* the API key, so disabling a
 * staff member, deleting them, or rotating their key logged them out
 * immediately as a side effect. With a separate session store that link is
 * gone, so those operations have to revoke explicitly — otherwise a disabled
 * account keeps working until the cookie expires (up to 7 days).
 */
export async function deleteAdminSessionsForStaff(
  db: D1Database,
  staffId: string,
): Promise<void> {
  await db.prepare('DELETE FROM admin_sessions WHERE staff_id = ?').bind(staffId).run();
}
