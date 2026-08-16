'use client'
import { useEffect, useState } from 'react'
import { getTenant, isSharedAdmin, knownTenants, portalOrigin } from '@/lib/runtime-config'

/**
 * Tenant switcher for accounts holding several L Harness contracts.
 *
 * The admin authenticates per tenant, so it cannot enumerate a customer's
 * contracts by itself — the authoritative list lives in the portal (マイページ).
 * What it can show is the set of tenants that have been opened in this browser,
 * which covers the everyday "switch between my two accounts" case, plus a link
 * to the portal for the full list.
 *
 * Switching navigates with `?tenant=` so the destination is unambiguous, and a
 * full page load re-resolves the session cookie for that tenant.
 */
export default function TenantSwitcher() {
  const [open, setOpen] = useState(false)
  const [tenants, setTenants] = useState<string[]>([])
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    if (!isSharedAdmin()) return
    setCurrent(getTenant())
    setTenants(knownTenants())
  }, [])

  if (!isSharedAdmin() || !current) return null

  const others = tenants.filter((t) => t !== current)

  return (
    <div className="relative px-3 py-2 border-b border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
        title="別の L Harness に切り替える"
      >
        <span className="min-w-0">
          <span className="block text-[10px] text-gray-500">接続中</span>
          <span className="block truncate text-sm font-semibold text-gray-900">{current}</span>
        </span>
        <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-3 right-3 z-30 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {others.length > 0 ? (
            others.map((t) => (
              <a
                key={t}
                href={`/?tenant=${encodeURIComponent(t)}`}
                className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t}
              </a>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-gray-500">
              このブラウザで開いた他の契約はありません
            </p>
          )}
          <a
            href={portalOrigin()}
            className="block border-t border-gray-100 px-3 py-2 text-xs text-green-700 hover:bg-gray-50"
          >
            すべての契約をマイページで見る →
          </a>
        </div>
      )}
    </div>
  )
}
