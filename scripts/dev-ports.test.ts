import { describe, expect, test } from 'bun:test'
import { derivePorts, PORT_RANGE } from './dev-ports'

describe('derivePorts', () => {
  test('is deterministic for a path', () => {
    expect(derivePorts('/home/x/site')).toEqual(derivePorts('/home/x/site'))
  })

  test('gives distinct paths distinct ports', () => {
    expect(derivePorts('/home/x/site').astro).not.toBe(derivePorts('/home/x/site-wt1').astro)
  })

  test('keeps the three ports consecutive so one hash decides the set', () => {
    const ports = derivePorts('/home/x/site')
    expect(ports.bsky).toBe(ports.astro + 1)
    expect(ports.comment).toBe(ports.astro + 2)
  })

  test('stays inside the unprivileged, non-ephemeral range for every input', () => {
    for (let i = 0; i < 2000; i++) {
      const { astro, comment } = derivePorts(`/tmp/worktree-${i}`)
      expect(astro).toBeGreaterThanOrEqual(PORT_RANGE.min)
      expect(comment).toBeLessThanOrEqual(PORT_RANGE.max)
    }
  })
})
