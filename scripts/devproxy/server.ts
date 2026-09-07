// Reverse proxy from `<name>.localhost` on port 80 to the loopback port that
// `with-route.ts` registered for that name. One instance serves every checkout.
//
// Usage: node scripts/devproxy/server.ts [--exit-when-idle]
// Environment: DEVPROXY_PORT (default 80), DEVPROXY_DIR (see routes.ts).
//
// With --exit-when-idle the proxy leaves once no live route names its port,
// which is how `with-route.ts` keeps exactly one proxy per project alive.

import { watch } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { hostOf, isAlive, listRoutes, readRoute, routesDir, STATUS_HOST, type Route } from './routes.ts'

const IDLE_GRACE_MS = 3000
const IDLE_POLL_MS = 1000

type Lookup = { ok: true; route: Route } | { ok: false; status: number; message: string }

const lookup = (dir: string, header: string | undefined): Lookup => {
  const host = hostOf(header)
  if (host === null) return { ok: false, status: 400, message: 'Missing Host header.' }
  let route: Route | null
  try {
    route = readRoute(dir, host)
  } catch (error) {
    return { ok: false, status: 500, message: `Cannot read route for ${host}: ${(error as Error).message}` }
  }
  if (route === null) {
    let known: string[]
    try {
      known = listRoutes(dir).map(({ host, route }) => `  ${host} -> port ${route.port} (${route.dir})`)
    } catch (error) {
      return { ok: false, status: 500, message: `Cannot list routes: ${(error as Error).message}` }
    }
    return {
      ok: false,
      status: 404,
      message: `No route for ${host}.\nRegistered routes:\n${known.length ? known.join('\n') : '  (none)'}\n`,
    }
  }
  return { ok: true, route }
}

const backendDown = (route: Route, error: Error): string =>
  `Backend for this name is not answering on port ${route.port} (${error.message}).\nIt was registered by pid ${route.pid} in ${route.dir}; start it, or remove the stale route.\n`

const status = (dir: string, port: number): string =>
  JSON.stringify({
    devproxy: true,
    pid: process.pid,
    port,
    routes: listRoutes(dir).map(({ host, route }) => ({ host, ...route, alive: isAlive(route.pid) })),
  })

const onRequest =
  (dir: string, port: () => number) =>
  (request: http.IncomingMessage, response: http.ServerResponse): void => {
    if (hostOf(request.headers.host) === STATUS_HOST) {
      try {
        const body = status(dir, port())
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(body)
      } catch (error) {
        response.writeHead(500, { 'content-type': 'text/plain' })
        response.end(`Cannot list routes: ${(error as Error).message}\n`)
      }
      return
    }
    const found = lookup(dir, request.headers.host)
    if (!found.ok) {
      response.writeHead(found.status, { 'content-type': 'text/plain' })
      response.end(found.message)
      return
    }
    const upstream = http.request(
      {
        host: 'localhost',
        port: found.route.port,
        method: request.method,
        path: request.url,
        headers: request.headers,
      },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.statusMessage, reply.headers)
        reply.pipe(response)
      },
    )
    upstream.on('error', (error) => {
      if (response.headersSent) return response.destroy()
      response.writeHead(502, { 'content-type': 'text/plain' })
      response.end(backendDown(found.route, error))
    })
    request.pipe(upstream)
  }

const onUpgrade =
  (dir: string) =>
  (request: http.IncomingMessage, socket: net.Socket, head: Buffer): void => {
    const found = lookup(dir, request.headers.host)
    if (!found.ok) {
      socket.end(`HTTP/1.1 ${found.status} \r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n${found.message}`)
      return
    }
    const upstream = net.connect({ host: 'localhost', port: found.route.port }, () => {
      const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`]
      for (let i = 0; i < request.rawHeaders.length; i += 2)
        lines.push(`${request.rawHeaders[i]}: ${request.rawHeaders[i + 1]}`)
      upstream.write(lines.join('\r\n') + '\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  }

const listen = (server: http.Server, host: string, port: number): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve((server.address() as net.AddressInfo).port))
  })

// Exit once no live route names this proxy for IDLE_GRACE_MS. A short grace
// keeps the proxy through a server restart. Errors keep it alive, never kill it.
const exitWhenIdle = (dir: string, port: number): void => {
  let idleSince: number | null = null
  const check = () => {
    let live: number
    try {
      live = listRoutes(dir).filter(({ route }) => route.proxyPort === port && isAlive(route.pid)).length
    } catch (error) {
      console.error(`devproxy: cannot count routes: ${(error as Error).message}`)
      return
    }
    if (live > 0) {
      idleSince = null
      return
    }
    idleSince ??= Date.now()
    if (Date.now() - idleSince >= IDLE_GRACE_MS) {
      console.log('devproxy: no routes left, exiting')
      process.exit(0)
    }
  }
  setInterval(check, IDLE_POLL_MS)
  try {
    watch(dir, check)
  } catch (error) {
    console.error(`devproxy: not watching ${dir} (${(error as Error).message}), polling only`)
  }
}

const main = async (): Promise<void> => {
  const dir = routesDir()
  const port = Number(process.env.DEVPROXY_PORT ?? 80)
  const idle = process.argv.includes('--exit-when-idle')
  let boundPort = port
  const create = () => {
    const server = http.createServer(onRequest(dir, () => boundPort))
    server.on('upgrade', onUpgrade(dir))
    return server
  }
  try {
    boundPort = await listen(create(), '127.0.0.1', port)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    console.error(`devproxy: cannot listen on 127.0.0.1:${port} (${code}).`)
    if (code === 'EACCES')
      console.error(
        'Ports below 1024 need permission. On Linux set sysctl net.ipv4.ip_unprivileged_port_start=80, or run with DEVPROXY_PORT=8080.',
      )
    process.exit(1)
  }
  console.log(`devproxy: listening on http://127.0.0.1:${boundPort}, routes in ${dir}${idle ? ', exits when idle' : ''}`)
  if (idle) exitWhenIdle(dir, boundPort)
  try {
    await listen(create(), '::1', boundPort)
    console.log(`devproxy: listening on http://[::1]:${boundPort}`)
  } catch (error) {
    console.error(`devproxy: not listening on ::1 (${(error as NodeJS.ErrnoException).code}); browsers that prefer IPv6 for *.localhost will not reach it.`)
  }
}

main()
