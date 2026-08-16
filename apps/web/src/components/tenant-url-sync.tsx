'use client'
import { useEffect } from 'react'
import { getTenant, isSharedAdmin } from '@/lib/runtime-config'

/**
 * Keep the tenant identity visible in the address bar at all times (shared
 * admin only).
 *
 * Why: one account can hold several L Harness contracts, and operators paste
 * admin URLs into docs and chat. A URL without the tenant would open whichever
 * tenant that browser happened to touch last — the wrong data, silently. So
 * every URL must name its tenant.
 *
 * How: the app is a static export served from a single origin, so the tenant
 * lives in `?tenant=`. Next's client router calls history.pushState /
 * replaceState on navigation and would drop the query, so we wrap both to
 * re-attach it, and fix up the current URL on mount.
 *
 * Per-tenant installs (no TENANT_BASE_DOMAIN) render nothing.
 */
export default function TenantUrlSync() {
  useEffect(() => {
    if (!isSharedAdmin()) return
    const tenant = getTenant()
    if (!tenant) return

    const withTenant = (urlLike: string | URL | null | undefined): string | undefined => {
      if (urlLike === null || urlLike === undefined) return undefined
      try {
        const u = new URL(String(urlLike), window.location.href)
        if (u.origin !== window.location.origin) return undefined // external: leave alone
        if (u.searchParams.get('tenant') === tenant) return undefined
        u.searchParams.set('tenant', tenant)
        return u.pathname + u.search + u.hash
      } catch {
        return undefined
      }
    }

    // 1) the URL we landed on
    const fixed = withTenant(window.location.href)
    if (fixed) window.history.replaceState(window.history.state, '', fixed)

    // 2) every client-side navigation after that
    const origPush = window.history.pushState.bind(window.history)
    const origReplace = window.history.replaceState.bind(window.history)
    window.history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
      return origPush(data, unused, withTenant(url) ?? url)
    }
    window.history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
      return origReplace(data, unused, withTenant(url) ?? url)
    }
    return () => {
      window.history.pushState = origPush
      window.history.replaceState = origReplace
    }
  }, [])

  return null
}
