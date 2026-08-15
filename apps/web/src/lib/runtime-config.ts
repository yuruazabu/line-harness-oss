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

const BUILD_TIME_API_URL = process.env.NEXT_PUBLIC_API_URL || ''
const TENANT_BASE_DOMAIN = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || ''

/** Subdomain label only — anything else is rejected to keep the URL mapping safe. */
const TENANT_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

function resolveTenant(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const fromQuery = new URLSearchParams(window.location.search).get(TENANT_PARAM)
    if (fromQuery && TENANT_RE.test(fromQuery)) {
      sessionStorage.setItem(TENANT_SESSION_KEY, fromQuery)
      localStorage.setItem(TENANT_LAST_KEY, fromQuery)
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
 * Resolve the API base URL. Returns '' during prerender (no window) when no
 * build-time URL exists — callers that render URLs should go through
 * `useApiBase()` instead to avoid hydration mismatches.
 */
export function getApiBase(): string {
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
 * Hydration-safe API base for components that render URLs: '' on the server
 * pass and during the first client render, then the resolved value.
 */
export function useApiBase(): string {
  const [base, setBase] = useState(BUILD_TIME_API_URL)
  useEffect(() => {
    setBase(getApiBase())
  }, [])
  return base
}
