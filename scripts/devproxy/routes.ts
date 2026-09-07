// Route files: one file per hostname under the routes directory, holding the
// loopback port to proxy to. `with-route.ts` writes them, `server.ts` reads them.

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Backend `port` registered by process `pid` in `dir`, served by the proxy on `proxyPort`. */
export type Route = { port: number; pid: number; dir: string; proxyPort: number }

/** Reserved name: the proxy answers status on it, so no project may register it. */
export const STATUS_HOST = 'devproxy.localhost'

// Only names below .localhost, lowercase DNS labels. The Host header is
// untrusted input that becomes a file name, so this is a strict allowlist.
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const HOST = new RegExp(`^(?=.{1,253}$)(?:${LABEL}\\.)+localhost$`)

export const isRouteHost = (host: string): boolean => host !== STATUS_HOST && HOST.test(host)

export const hostOf = (header: string | undefined): string | null =>
  header === undefined ? null : header.replace(/:\d+$/, '').toLowerCase()

export const routesDir = (env: Record<string, string | undefined> = process.env): string =>
  env.DEVPROXY_DIR ??
  join(env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'devproxy', 'routes')

/** One log per proxy port, next to the routes directory. */
export const logPath = (dir: string, proxyPort: number): string =>
  join(dirname(dir), `proxy-${proxyPort}.log`)

const routePath = (dir: string, host: string): string => {
  if (!isRouteHost(host)) throw new Error(`not a route host: ${host}`)
  return join(dir, host)
}

const parseRoute = (host: string, text: string): Route => {
  const value: unknown = JSON.parse(text)
  if (
    typeof value !== 'object' ||
    value === null ||
    !Number.isInteger((value as Route).port) ||
    !Number.isInteger((value as Route).pid) ||
    typeof (value as Route).dir !== 'string' ||
    !Number.isInteger((value as Route).proxyPort)
  )
    throw new Error(`malformed route file for ${host}`)
  const { port, pid, dir, proxyPort } = value as Route
  return { port, pid, dir, proxyPort }
}

export const readRoute = (dir: string, host: string): Route | null => {
  const path = routePath(dir, host)
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  return parseRoute(host, text)
}

export const writeRoute = (dir: string, host: string, route: Route): void => {
  const path = routePath(dir, host)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(route) + '\n')
}

export const removeRoute = (dir: string, host: string): void => {
  rmSync(routePath(dir, host), { force: true })
}

export const listRoutes = (dir: string): { host: string; route: Route }[] => {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return names
    .filter(isRouteHost)
    .sort()
    .map((host) => ({ host, route: parseRoute(host, readFileSync(join(dir, host), 'utf8')) }))
}

export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
