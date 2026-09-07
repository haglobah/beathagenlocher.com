import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STATUS_HOST, writeRoute } from './routes.ts'

const script = join(import.meta.dir, 'server.ts')
const dir = mkdtempSync(join(tmpdir(), 'devproxy-'))

let backend: ReturnType<typeof Bun.serve>
let proxy: ReturnType<typeof Bun.spawn>
let proxyPort = 0

beforeAll(async () => {
  backend = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request)) return undefined
      const url = new URL(request.url)
      return new Response(`backend saw ${request.method} ${url.pathname}${url.search} for ${request.headers.get('host')}`)
    },
    websocket: {
      message(ws, message) {
        ws.send(`echo ${message}`)
      },
    },
  })
  writeRoute(dir, 'site.localhost', { port: backend.port, pid: process.pid, dir: '/w', proxyPort: 0 })
  writeRoute(dir, 'dead.localhost', { port: 1, pid: process.pid, dir: '/w', proxyPort: 0 })

  proxy = Bun.spawn(['node', script], {
    env: { ...process.env, DEVPROXY_DIR: dir, DEVPROXY_PORT: '0' },
    stdout: 'pipe',
    stderr: 'inherit',
  })
  const reader = proxy.stdout.getReader()
  let out = ''
  while (!/listening on http:\/\/127\.0\.0\.1:(\d+)/.test(out)) {
    const { value, done } = await reader.read()
    if (done) throw new Error(`proxy exited before listening: ${out}`)
    out += new TextDecoder().decode(value)
  }
  proxyPort = Number(out.match(/127\.0\.0\.1:(\d+)/)![1])
})

afterAll(() => {
  proxy.kill()
  backend.stop(true)
})

const get = (host: string, path = '/') =>
  fetch(`http://127.0.0.1:${proxyPort}${path}`, { headers: { Host: host } })

describe('devproxy', () => {
  test('routes by Host to the registered port and keeps the Host header', async () => {
    const response = await get('site.localhost', '/notes?x=1')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('backend saw GET /notes?x=1 for site.localhost')
  })

  test('ignores the port in the Host header', async () => {
    expect((await get('site.localhost:80')).status).toBe(200)
  })

  test('answers 404 with the known routes for an unregistered name', async () => {
    const response = await get('other.localhost')
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('site.localhost')
  })

  test('answers 502 when the registered backend does not listen', async () => {
    const response = await get('dead.localhost')
    expect(response.status).toBe(502)
    expect(await response.text()).toContain('port 1')
  })

  test('reports itself and its routes on the reserved status name', async () => {
    const response = await get(STATUS_HOST, '/anything')
    expect(response.status).toBe(200)
    const status = await response.json()
    expect(status).toMatchObject({ devproxy: true, pid: proxy.pid, port: proxyPort })
    expect(status.routes.map((r: { host: string }) => r.host)).toEqual(['dead.localhost', 'site.localhost'])
  })

  test('proxies WebSocket upgrades, as Vite HMR needs', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${proxyPort}/ws`, {
      headers: { Host: 'site.localhost' },
    } as never)
    const reply = new Promise<string>((resolve, reject) => {
      socket.onmessage = (event) => resolve(String(event.data))
      socket.onerror = () => reject(new Error('socket error'))
      socket.onclose = (event) => reject(new Error(`closed ${event.code}`))
    })
    await new Promise<void>((resolve) => (socket.onopen = () => resolve()))
    socket.send('hi')
    expect(await reply).toBe('echo hi')
    socket.close()
  })
})
