// Derive stable development ports from the checkout path, so several
// worktrees can run `just dev` at the same time without coordination.
//
// Usage: node scripts/dev-ports.ts <astro|bsky|comment> [path]
// Without a path, the real path of the current directory is used.

import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'

// Above the well-known and registered range that local tools tend to pick,
// below the Linux ephemeral range (32768+ on many systems is avoided too).
export const PORT_RANGE = { min: 20000, max: 29999 } as const

export type DevPorts = { astro: number; bsky: number; comment: number }

const SERVICES = ['astro', 'bsky', 'comment'] as const
type Service = (typeof SERVICES)[number]

export const derivePorts = (path: string): DevPorts => {
  const digest = createHash('sha256').update(path).digest()
  const span = Math.floor((PORT_RANGE.max - PORT_RANGE.min + 1) / SERVICES.length)
  const astro = PORT_RANGE.min + (digest.readUInt32BE(0) % span) * SERVICES.length
  return { astro, bsky: astro + 1, comment: astro + 2 }
}

const isService = (value: string): value is Service => (SERVICES as readonly string[]).includes(value)

const main = (argv: string[]): void => {
  const [service, path = process.cwd()] = argv
  if (service === undefined || !isService(service)) {
    console.error(`usage: dev-ports.ts <${SERVICES.join('|')}> [path]`)
    process.exit(2)
  }
  console.log(derivePorts(realpathSync(path))[service])
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2))
