import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isAlive, readRoute, STATUS_HOST, writeRoute } from './routes.ts'

const script = join(import.meta.dir, 'with-route.ts')
const tmp = () => mkdtempSync(join(tmpdir(), 'devproxy-'))
const until = async (check: () => boolean | Promise<boolean>, ms = 5000) => {
  const deadline = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('timed out')
    await Bun.sleep(25)
  }
}
const freePort = () => {
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() })
  const port = server.port
  server.stop(true)
  return port
}
type Probe = { state: 'absent' } | { state: 'running'; pid: number } | { state: 'foreign' }
const probe = async (port: number): Promise<Probe> => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { headers: { Host: STATUS_HOST } })
    const body = (await response.json()) as { devproxy?: boolean; pid: number }
    return body.devproxy === true ? { state: 'running', pid: body.pid } : { state: 'foreign' }
  } catch {
    return { state: 'absent' }
  }
}
const run = (dir: string, proxyPort: number, ...args: string[]) =>
  Bun.spawn(['node', script, '--proxy-port', String(proxyPort), ...args], {
    env: { ...process.env, DEVPROXY_DIR: dir },
    stdout: 'pipe',
    stderr: 'pipe',
  })

describe('with-route', () => {
  test('registers while the command runs and removes the route on SIGTERM', async () => {
    const dir = tmp()
    const port = freePort()
    const child = run(dir, port, 'site.localhost', '20483', '--', 'sleep', '30')
    await until(() => readRoute(dir, 'site.localhost') !== null)
    expect(readRoute(dir, 'site.localhost')).toMatchObject({ port: 20483, pid: child.pid, proxyPort: port })
    child.kill('SIGTERM')
    await child.exited
    expect(readRoute(dir, 'site.localhost')).toBeNull()
  })

  test('removes the route when the command exits by itself and passes its exit code on', async () => {
    const dir = tmp()
    const child = run(dir, freePort(), 'site.localhost', '20483', '--', 'sh', '-c', 'exit 3')
    expect(await child.exited).toBe(3)
    expect(readRoute(dir, 'site.localhost')).toBeNull()
  })

  test('refuses a name held by a live process', async () => {
    const dir = tmp()
    writeRoute(dir, 'site.localhost', { port: 1, pid: process.pid, dir: '/elsewhere', proxyPort: 1 })
    const child = run(dir, freePort(), 'site.localhost', '20483', '--', 'sleep', '30')
    expect(await child.exited).not.toBe(0)
    expect(await new Response(child.stderr).text()).toContain('/elsewhere')
    expect(readRoute(dir, 'site.localhost')).toMatchObject({ port: 1, pid: process.pid })
  })

  test('replaces a stale route whose process is gone', async () => {
    const dir = tmp()
    writeRoute(dir, 'site.localhost', { port: 1, pid: 2 ** 22 - 1, dir: '/gone', proxyPort: 1 })
    const child = run(dir, freePort(), 'site.localhost', '20483', '--', 'sleep', '30')
    await until(() => readRoute(dir, 'site.localhost')?.port === 20483)
    child.kill('SIGTERM')
    await child.exited
  })

  test('rejects a bad host or port before starting anything', async () => {
    const dir = tmp()
    const port = freePort()
    expect(await run(dir, port, 'localhost', '20483', '--', 'sleep', '30').exited).toBe(2)
    expect(await run(dir, port, 'site.localhost', 'x', '--', 'sleep', '30').exited).toBe(2)
    expect(await run(dir, port, 'site.localhost', '20483').exited).toBe(2)
    const noProxy = Bun.spawn(['node', script, 'site.localhost', '20483', '--', 'sleep', '30'], {
      env: { ...process.env, DEVPROXY_DIR: dir },
      stderr: 'pipe',
    })
    expect(await noProxy.exited).toBe(2)
    expect(await probe(port)).toEqual({ state: 'absent' })
  })

  test('starts the proxy with the first route and the proxy leaves with the last', async () => {
    const dir = tmp()
    const port = freePort()
    expect(await probe(port)).toEqual({ state: 'absent' })

    const first = run(dir, port, 'a.localhost', '20483', '--', 'sleep', '30')
    await until(async () => (await probe(port)).state === 'running', 10000)
    const proxyPid = ((await probe(port)) as { pid: number }).pid

    const second = run(dir, port, 'b.localhost', '20484', '--', 'sleep', '30')
    await until(() => readRoute(dir, 'b.localhost') !== null)
    expect(await probe(port)).toEqual({ state: 'running', pid: proxyPid })

    first.kill('SIGTERM')
    await first.exited
    await Bun.sleep(4500)
    expect(await probe(port)).toEqual({ state: 'running', pid: proxyPid })

    second.kill('SIGTERM')
    await second.exited
    await until(() => !isAlive(proxyPid), 10000)
    expect(await probe(port)).toEqual({ state: 'absent' })
  }, 30000)

  test('two registrations racing for the first start both succeed', async () => {
    const dir = tmp()
    const port = freePort()
    const a = run(dir, port, 'a.localhost', '20483', '--', 'sleep', '30')
    const b = run(dir, port, 'b.localhost', '20484', '--', 'sleep', '30')
    await until(() => readRoute(dir, 'a.localhost') !== null && readRoute(dir, 'b.localhost') !== null)
    await Bun.sleep(1500)
    expect(await probe(port)).toMatchObject({ state: 'running' })
    expect(isAlive(a.pid) && isAlive(b.pid)).toBe(true)
    a.kill('SIGTERM')
    b.kill('SIGTERM')
    await Promise.all([a.exited, b.exited])
  }, 20000)

  test('refuses a proxy port that something else holds', async () => {
    const dir = tmp()
    const other = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('OK') })
    const child = run(dir, other.port, 'site.localhost', '20483', '--', 'sleep', '30')
    expect(await child.exited).toBe(1)
    expect(await new Response(child.stderr).text()).toContain(String(other.port))
    expect(readRoute(dir, 'site.localhost')).toBeNull()
    other.stop(true)
  })
})
