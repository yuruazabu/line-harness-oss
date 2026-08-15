'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getApiBase, storageKey } from '@/lib/runtime-config'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (pathname === '/login') {
      setChecked(true)
      return () => { cancelled = true }
    }

    // Verify the session via the HttpOnly cookie. /api/auth/session returns the
    // staff identity and refreshes the CSRF token if it was lost (e.g. reload).
    //
    // A thrown fetch (TypeError) is a NETWORK failure, not "unauthenticated" —
    // treating it as a logout kicks users with a valid session to /login on a
    // transient connection hiccup (first request to a cold host, flaky mobile
    // networks). Retry once before giving up; only an explicit non-OK status
    // or a malformed body means the session is actually invalid.
    const fetchSession = async (apiUrl: string): Promise<Response> => {
      const delays = [0, 700, 2000]
      let lastErr: unknown
      for (const delay of delays) {
        if (delay) await new Promise((r) => setTimeout(r, delay))
        try {
          return await fetch(`${apiUrl}/api/auth/session`, { credentials: 'include' })
        } catch (err) {
          lastErr = err
        }
      }
      throw lastErr
    }

    const checkSession = async () => {
      try {
        localStorage.removeItem('lh_api_key')
        // Resolved at call time: baked URL on per-tenant installs, tenant
        // subdomain on the shared admin. Unresolved (no tenant picked yet)
        // means we cannot have a session — treat as unauthenticated.
        const apiUrl = getApiBase()
        if (!apiUrl) throw new Error('unauthenticated')
        const res = await fetchSession(apiUrl)
        if (!res.ok) throw new Error('unauthenticated')
        const data = await res.json()
        if (!data?.success || !data?.data) throw new Error('unauthenticated')
        if (data.data.name) localStorage.setItem(storageKey('lh_staff_name'), data.data.name)
        if (data.data.role) localStorage.setItem(storageKey('lh_staff_role'), data.data.role)
        if (data.csrfToken) localStorage.setItem(storageKey('lh_csrf'), data.csrfToken)
        if (!cancelled) setChecked(true)
      } catch {
        if (!cancelled) router.replace('/login')
      }
    }

    checkSession()
    return () => { cancelled = true }
  }, [pathname, router])

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-green-500 rounded-full" />
      </div>
    )
  }

  return <>{children}</>
}
