import { describe, expect, test } from 'bun:test'
import { deriveHost } from './host.ts'

describe('deriveHost', () => {
  const base = 'beathagenlocher.com'

  test('primary checkout gets the bare name', () => {
    expect(deriveHost(base, { linked: false, branch: 'main', dir: '/w/site' })).toBe(
      'beathagenlocher.com.localhost',
    )
  })

  test('a linked worktree is prefixed with its branch slug', () => {
    expect(deriveHost(base, { linked: true, branch: 'fix/Header Bug', dir: '/w/x' })).toBe(
      'fix-header-bug.beathagenlocher.com.localhost',
    )
  })

  test('a detached worktree falls back to its directory name', () => {
    expect(deriveHost(base, { linked: true, branch: null, dir: '/w/site-wt2' })).toBe(
      'site-wt2.beathagenlocher.com.localhost',
    )
  })

  test('never produces an empty or overlong label', () => {
    expect(deriveHost(base, { linked: true, branch: '///', dir: '/w/---' })).toBe(
      'worktree.beathagenlocher.com.localhost',
    )
    const long = deriveHost(base, { linked: true, branch: 'a'.repeat(100), dir: '/w' })
    expect(long.split('.')[0]).toHaveLength(63)
  })
})
