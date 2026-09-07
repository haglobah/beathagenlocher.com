import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  hostOf,
  isAlive,
  isRouteHost,
  listRoutes,
  logPath,
  readRoute,
  removeRoute,
  routesDir,
  STATUS_HOST,
  writeRoute,
} from './routes.ts'

const tmp = () => mkdtempSync(join(tmpdir(), 'devproxy-'))

describe('isRouteHost', () => {
  test.each(['beathagenlocher.com.localhost', 'fix-header.beathagenlocher.com.localhost', 'a.localhost'])(
    'accepts %s',
    (host) => expect(isRouteHost(host)).toBe(true),
  )
  test.each(['localhost', STATUS_HOST, '../etc.localhost', 'Upper.localhost', 'a_b.localhost', '.localhost', 'example.com', 'x.localhost.example'])(
    'rejects %s',
    (host) => expect(isRouteHost(host)).toBe(false),
  )
})

describe('hostOf', () => {
  test('strips the port and lowercases', () => {
    expect(hostOf('Site.LOCALHOST:8080')).toBe('site.localhost')
  })
  test('keeps a bare name', () => expect(hostOf('site.localhost')).toBe('site.localhost'))
  test('is null without a header', () => expect(hostOf(undefined)).toBeNull())
})

describe('routesDir', () => {
  test('DEVPROXY_DIR wins', () => expect(routesDir({ DEVPROXY_DIR: '/x' })).toBe('/x'))
  test('falls back to XDG state', () =>
    expect(routesDir({ XDG_STATE_HOME: '/s' })).toBe('/s/devproxy/routes'))
})

describe('route files', () => {
  test('round-trips write, read, list, remove', () => {
    const dir = join(tmp(), 'routes')
    const route = { port: 20483, pid: 1, dir: '/w', proxyPort: 8099 }
    writeRoute(dir, 'site.localhost', route)
    expect(readRoute(dir, 'site.localhost')).toEqual(route)
    expect(listRoutes(dir)).toEqual([{ host: 'site.localhost', route }])
    removeRoute(dir, 'site.localhost')
    expect(readRoute(dir, 'site.localhost')).toBeNull()
    expect(listRoutes(dir)).toEqual([])
  })

  test('reading an unknown host is null, not an error', () => {
    expect(readRoute(tmp(), 'nothing.localhost')).toBeNull()
  })

  test('refuses hosts that are not route hosts, so a Host header cannot escape the directory', () => {
    const dir = tmp()
    expect(() => readRoute(dir, '../passwd')).toThrow()
    expect(() => writeRoute(dir, 'localhost', { port: 1, pid: 1, dir: '/', proxyPort: 1 })).toThrow()
  })

  test('a malformed file throws instead of routing somewhere', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'bad.localhost'), '{"port":"x"}')
    expect(() => readRoute(dir, 'bad.localhost')).toThrow()
    writeFileSync(join(dir, 'old.localhost'), '{"port":1,"pid":1,"dir":"/"}')
    expect(() => readRoute(dir, 'old.localhost')).toThrow()
  })
})

describe('logPath', () => {
  test('sits next to the routes directory, one file per proxy port', () => {
    expect(logPath('/s/devproxy/routes', 8099)).toBe('/s/devproxy/proxy-8099.log')
  })
})

describe('isAlive', () => {
  test('sees this process', () => expect(isAlive(process.pid)).toBe(true))
  test('does not see an impossible pid', () => expect(isAlive(2 ** 22 - 1)).toBe(false))
})
