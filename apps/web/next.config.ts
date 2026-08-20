import type { NextConfig } from 'next'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
const repoRoot = resolve(__dirname, '../..')

function readGitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

const buildSha =
  process.env.APP_COMMIT_SHA || process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || readGitSha() || 'local'
const buildTime = process.env.APP_BUILD_TIME || new Date().toISOString()

// Serve the admin under a sub-path (e.g. `/console`) when the deployment puts
// it behind the same origin as the Worker API. Unset means the previous
// behaviour: the admin owns the root of its origin.
const basePath = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || ''
if (basePath && !/^\/[a-z0-9-]+$/.test(basePath)) {
  throw new Error(
    `NEXT_PUBLIC_ADMIN_BASE_PATH must be a single leading-slash path segment, got: ${basePath}`,
  )
}

const nextConfig: NextConfig = {
  output: 'export',
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  transpilePackages: ['@line-crm/shared'],
  env: {
    APP_VERSION: pkg.version,
    APP_COMMIT_SHA: buildSha.slice(0, 12),
    APP_BUILD_TIME: buildTime,
  },
}
export default nextConfig
