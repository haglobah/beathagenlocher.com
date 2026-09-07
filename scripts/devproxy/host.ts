// Derive this checkout's hostname: the primary checkout gets `<base>.localhost`,
// a linked Git worktree gets `<branch-slug>.<base>.localhost`.
//
// Usage: node scripts/devproxy/host.ts <base>

import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { basename } from 'node:path'

export type Checkout = { linked: boolean; branch: string | null; dir: string }

const label = (text: string): string => {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '')
  return slug === '' ? 'worktree' : slug
}

export const deriveHost = (base: string, checkout: Checkout): string =>
  checkout.linked
    ? `${label(checkout.branch ?? basename(checkout.dir))}.${base}.localhost`
    : `${base}.localhost`

const git = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()

export const currentCheckout = (): Checkout => {
  const gitDir = realpathSync(git('rev-parse', '--absolute-git-dir'))
  const commonDir = realpathSync(git('rev-parse', '--git-common-dir'))
  const branch = git('branch', '--show-current')
  return {
    linked: gitDir !== commonDir,
    branch: branch === '' ? null : branch,
    dir: realpathSync(git('rev-parse', '--show-toplevel')),
  }
}

const main = (argv: string[]): void => {
  const [base] = argv
  if (base === undefined || !/^[a-z0-9.-]+$/.test(base)) {
    console.error('usage: host.ts <base>')
    process.exit(2)
  }
  console.log(deriveHost(base, currentCheckout()))
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2))
