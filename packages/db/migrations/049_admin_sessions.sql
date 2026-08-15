-- Admin session store. Before this table, the lh_admin_session cookie carried
-- the API key itself, so a leaked cookie was a leaked credential and there was
-- no server-side way to revoke a single browser session. Login now issues an
-- opaque random token; only its SHA-256 lands here. Old cookies keep working
-- through a legacy fallback in the auth middleware, so upgrading does not log
-- anyone out.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id   TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  staff_role TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
