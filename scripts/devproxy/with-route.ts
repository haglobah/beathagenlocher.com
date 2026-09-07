// Register a hostname for the lifetime of a command.
//
// Usage: node scripts/devproxy/with-route.ts --proxy-port <n> <host> <port> -- <command...>
//
// Writes the route file, makes sure the project's proxy runs on <n> (starting
// it detached, in exit-when-idle mode, if nothing answers there), runs the
// command with the caller's environment and working directory, forwards
// SIGINT/SIGTERM/SIGHUP, and removes the route when the command exits. Exits
// with the command's exit code. The proxy leaves by itself with the last route.

import { spawn, type ChildProcess } from 'node:child_process'
import { openSync } from 'node:fs'
import http from 'node:http'
import { join } from 'node:path'
import {
  isAlive,
  isRouteHost,
  logPath,
  readRoute,
  removeRoute,
  routesDir,
  STATUS_HOST,
  writeRoute,
} from './routes.ts'

const START_TIMEOUT_MS = 10000
const START_POLL_MS = 100

const usage = (message: string): never => {
  console.error(
    `with-route: ${message}\nusage: with-route.ts --proxy-port <n> <host> <port> -- <command...>`,
  )
  process.exit(2)
}

const isPort = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= 65535

type Probe = { state: 'absent' } | { state: 'running'; pid: number } | { state: 'foreign'; detail: string }

/** Ask whoever listens on the port to identify itself as devproxy. */
const probe = (port: number): Promise<Probe> =>
  new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/', headers: { host: STATUS_HOST }, timeout: 1000 },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => (body += chunk))
        response.on('end', () => {
          try {
            const value = JSON.parse(body) as { devproxy?: boolean; pid?: number }
            if (value.devproxy === true && typeof value.pid === 'number')
              return resolve({ state: 'running', pid: value.pid })
          } catch {}
          resolve({ state: 'foreign', detail: `answered HTTP ${response.statusCode} but is not devproxy` })
        })
      },
    )
    request.on('error', (error: NodeJS.ErrnoException) =>
      resolve(error.code === 'ECONNREFUSED' ? { state: 'absent' } : { state: 'foreign', detail: error.message }),
    )
    request.on('timeout', () => {
      request.destroy()
      resolve({ state: 'foreign', detail: 'did not answer within 1s' })
    })
  })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Start the proxy detached from this process group so it outlives this command. */
const startProxy = (dir: string, proxyPort: number): ChildProcess => {
  const log = openSync(logPath(dir, proxyPort), 'a')
  const child = spawn(
    process.execPath,
    [join(import.meta.dirname, 'server.ts'), '--exit-when-idle'],
    {
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, DEVPROXY_DIR: dir, DEVPROXY_PORT: String(proxyPort) },
    },
  )
  child.unref()
  return child
}

/** Resolve once devproxy answers on the port; throw if something else holds it. */
const ensureProxy = async (dir: string, proxyPort: number): Promise<void> => {
  let found = await probe(proxyPort)
  if (found.state === 'absent') {
    const proxy = startProxy(dir, proxyPort)
    let exited = false
    proxy.on('exit', () => (exited = true))
    const deadline = Date.now() + START_TIMEOUT_MS
    while (found.state === 'absent' && Date.now() < deadline) {
      await sleep(START_POLL_MS)
      found = await probe(proxyPort)
      // A sibling registration may have won the port; its proxy serves us too.
      if (exited && found.state === 'absent') throw new Error(`proxy exited at start, see ${logPath(dir, proxyPort)}`)
    }
    if (found.state === 'absent') throw new Error(`proxy did not start within ${START_TIMEOUT_MS} ms, see ${logPath(dir, proxyPort)}`)
  }
  if (found.state === 'foreign') throw new Error(`port ${proxyPort} is held by something that is not devproxy (${found.detail})`)
}

const main = async (argv: string[]): Promise<void> => {
  const separator = argv.indexOf('--')
  const options = separator === -1 ? argv : argv.slice(0, separator)
  const command = separator === -1 ? [] : argv.slice(separator + 1)
  const flag = options.indexOf('--proxy-port')
  if (flag === -1 || options[flag + 1] === undefined) return usage('missing --proxy-port')
  const proxyPort = Number(options[flag + 1])
  if (!isPort(proxyPort)) return usage(`--proxy-port must be 1-65535, got ${options[flag + 1]}`)
  const [host, portText] = [...options.slice(0, flag), ...options.slice(flag + 2)]
  if (host === undefined || !isRouteHost(host)) return usage(`host must be a lowercase name below .localhost, got ${host}`)
  const port = Number(portText)
  if (!isPort(port)) return usage(`port must be 1-65535, got ${portText}`)
  if (command.length === 0) return usage('missing command after --')

  const dir = routesDir()
  const existing = readRoute(dir, host)
  if (existing !== null && isAlive(existing.pid)) {
    console.error(
      `with-route: ${host} is already registered by pid ${existing.pid} in ${existing.dir} (port ${existing.port})`,
    )
    process.exit(1)
  }
  // Handlers go in before the route exists: a signal in between must still
  // remove the file instead of taking the default action and leaving it behind.
  let child: ChildProcess | null = null
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      if (child !== null) return void child.kill(signal)
      removeRoute(dir, host)
      process.exit(signal === 'SIGINT' ? 130 : 143)
    })
  }
  writeRoute(dir, host, { port, pid: process.pid, dir: process.cwd(), proxyPort })
  try {
    await ensureProxy(dir, proxyPort)
  } catch (error) {
    removeRoute(dir, host)
    console.error(`with-route: ${(error as Error).message}`)
    process.exit(1)
  }
  console.error(`with-route: http://${host}:${proxyPort} -> port ${port}`)

  child = spawn(command[0]!, command.slice(1), { stdio: 'inherit' })
  child.on('error', (error) => {
    removeRoute(dir, host)
    console.error(`with-route: cannot start ${command[0]}: ${error.message}`)
    process.exit(1)
  })
  child.on('exit', (code, signal) => {
    removeRoute(dir, host)
    process.exit(code ?? (signal === 'SIGINT' ? 130 : 1))
  })
}

main(process.argv.slice(2))
