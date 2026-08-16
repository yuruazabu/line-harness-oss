/**
 * API base URL runtime resolution.
 *
 * Two deployment topologies share this admin build:
 *  1. Per-tenant install (OSS / create-line-harness): NEXT_PUBLIC_API_URL is
 *     baked at build time (or the __LH_WORKER_URL__ placeholder is replaced at
 *     install time). Behavior is unchanged.
 *  2. Shared admin (one deployment serving many tenants): no API URL is baked.
 *     The tenant is picked at runtime from `?tenant=<sub>` and mapped to
 *     `https://<sub>.<NEXT_PUBLIC_TENANT_BASE_DOMAIN>`. The selection sticks
 *     per-tab (sessionStorage) and falls back to the last-used tenant
 *     (localStorage) so deep links keep working after the first visit.
 *
 * Storage keys that hold per-tenant state (CSRF token, staff name/role,
 * selected LINE account) must be namespaced with `storageKey()` so tenants
 * don't bleed into each other on a shared admin origin.
 */

import { useEffect, useState } from 'react'

const TENANT_PARAM = 'tenant'
const TENANT_SESSION_KEY = 'lh_tenant'
const TENANT_LAST_KEY = 'lh_tenant_last'
const TENANT_KNOWN_KEY = 'lh_tenants_known'

const BUILD_TIME_API_URL = process.env.NEXT_PUBLIC_API_URL || ''
const TENANT_BASE_DOMAIN = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || ''
const PORTAL_ORIGIN = process.env.NEXT_PUBLIC_PORTAL_ORIGIN || ''

/** Subdomain label only — anything else is rejected to keep the URL mapping safe. */
const TENANT_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

/** Portal (マイページ) origin — where the authoritative contract list lives. */
export function portalOrigin(): string {
  if (PORTAL_ORIGIN) return PORTAL_ORIGIN
  // fall back to the sibling host of the admin origin
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/^https:\/\/admin\./, 'https://app.')
  }
  return ''
}

/**
 * Tenants this browser has opened. The admin authenticates per tenant and
 * cannot list a customer's contracts, so this local set powers the switcher;
 * the portal remains the authoritative list.
 */
export function knownTenants(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(TENANT_KNOWN_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === 'string' && TENANT_RE.test(t)) : []
  } catch {
    return []
  }
}

function rememberTenant(tenant: string): void {
  try {
    const next = [tenant, ...knownTenants().filter((t) => t !== tenant)].slice(0, 10)
    localStorage.setItem(TENANT_KNOWN_KEY, JSON.stringify(next))
  } catch {
    // storage unavailable — the switcher just shows fewer entries
  }
}

function resolveTenant(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const fromQuery = new URLSearchParams(window.location.search).get(TENANT_PARAM)
    if (fromQuery && TENANT_RE.test(fromQuery)) {
      sessionStorage.setItem(TENANT_SESSION_KEY, fromQuery)
      localStorage.setItem(TENANT_LAST_KEY, fromQuery)
      rememberTenant(fromQuery)
      return fromQuery
    }
    const fromSession = sessionStorage.getItem(TENANT_SESSION_KEY)
    if (fromSession && TENANT_RE.test(fromSession)) return fromSession
    const fromLast = localStorage.getItem(TENANT_LAST_KEY)
    if (fromLast && TENANT_RE.test(fromLast)) return fromLast
  } catch {
    // storage unavailable (privacy mode etc.) — fall through
  }
  return null
}

/**
 * API base for FETCH calls.
 *
 * Shared admin: a same-origin path prefix (`/t/<tenant>`), not the tenant's own
 * origin. The admin host proxies `/t/<tenant>/*` to that tenant's Worker, so the
 * browser only ever talks to one origin. That keeps the session cookie
 * first-party (no SameSite=None, no CORS preflight) and therefore working in
 * Safari/Firefox, which partition or block cross-site cookies.
 *
 * Per-tenant install: the baked NEXT_PUBLIC_API_URL, unchanged.
 *
 * Returns '' during prerender when neither is available — components that
 * render URLs should use `usePublicBase()` (the tenant's real origin) instead.
 */
export function getApiBase(): string {
  if (TENANT_BASE_DOMAIN) {
    const tenant = resolveTenant()
    if (tenant) return `/t/${tenant}`
  }
  return BUILD_TIME_API_URL
}

/**
 * Public origin of the tenant Worker — for URLs we SHOW to the operator so they
 * can paste them into LINE Developers or hand them to end users (webhook,
 * LIFF endpoint, tracking links, form URLs). These must be the tenant's real
 * host, never the admin proxy path.
 */
export function getPublicBase(): string {
  if (TENANT_BASE_DOMAIN) {
    const tenant = resolveTenant()
    if (tenant) return `https://${tenant}.${TENANT_BASE_DOMAIN}`
  }
  return BUILD_TIME_API_URL
}

/** True when this build runs as the shared (multi-tenant) admin. */
export function isSharedAdmin(): boolean {
  return !!TENANT_BASE_DOMAIN
}

/** Currently selected tenant subdomain (shared admin), else null. */
export function getTenant(): string | null {
  return TENANT_BASE_DOMAIN ? resolveTenant() : null
}

/**
 * Same resolution as getApiBase(), but throws when nothing is configured —
 * drop-in for the previous module-level `if (!API_URL) throw` guards, moved
 * to call time so a build without NEXT_PUBLIC_API_URL can prerender.
 */
export function requireApiBase(): string {
  const base = getApiBase()
  if (!base) {
    throw new Error(
      'API base URL is not resolved. Set NEXT_PUBLIC_API_URL at build time, ' +
        'or open the shared admin with ?tenant=<subdomain>.',
    )
  }
  return base
}

/**
 * Namespace a storage key with the tenant identity so a shared admin origin
 * keeps per-tenant state separate. Per-tenant installs (no tenant) keep the
 * legacy bare key, so existing logged-in sessions survive this change.
 */
export function storageKey(name: string): string {
  const tenant = getTenant()
  return tenant ? `${name}@${tenant}` : name
}

/**
 * Hydration-safe API base ('' on the server pass, resolved on the client).
 * For displayed URLs use `usePublicBase()` — see getPublicBase().
 */
export function useApiBase(): string {
  const [base, setBase] = useState(BUILD_TIME_API_URL)
  useEffect(() => {
    setBase(getApiBase())
  }, [])
  return base
}

/** Hydration-safe public origin of the tenant (for URLs shown to the user). */
export function usePublicBase(): string {
  const [base, setBase] = useState(BUILD_TIME_API_URL)
  useEffect(() => {
    setBase(getPublicBase())
  }, [])
  return base
}
