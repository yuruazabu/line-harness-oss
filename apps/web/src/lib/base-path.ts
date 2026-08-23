/**
 * Base path helpers.
 *
 * `next/link` and `useRouter()` prefix `basePath` on their own. Full-page
 * navigations (`window.location.href = ...`) do not — they bypass the router
 * entirely, so a hard-coded absolute path lands outside the admin whenever the
 * app is served under a prefix. Build those URLs with `withBasePath()`.
 */

/** Configured prefix, or '' when the admin owns the root of its origin. */
export const basePath = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || ''

/** Absolute in-app path, prefixed when the admin is served under a sub-path. */
export function withBasePath(path: string): string {
  if (!path.startsWith('/')) throw new Error(`withBasePath expects an absolute path, got: ${path}`)
  return `${basePath}${path}`
}
