import { describe, expect, mock, test } from 'bun:test'
import { createApp } from './app'
import type { SendEmail } from './core'
import { readConfig } from './config'

const payload = {
  pageUrl: 'https://beathagenlocher.com/note',
  paragraphId: 'p-1234abcd',
  paragraphText: 'A paragraph.',
  comment: 'A comment.',
}
const emailConfig = { from: 'comments@example.com', to: 'owner@example.com' }
const request = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })
const setup = (now = Date.now) => {
  const sendEmail = mock(async (_cmd: SendEmail) => {})
  return { app: createApp({ emailConfig, sendEmail, now }), sendEmail }
}

describe('POST /comment boundary', () => {
  test.each([
    '{',
    '',
    'null',
    'false',
    '42',
    '[]',
    '{}',
    JSON.stringify({ ...payload, comment: 42 }),
    JSON.stringify({ ...payload, pageUrl: null }),
    JSON.stringify({ ...payload, email: null }),
  ])('rejects malformed input without sending email: %s', async (body) => {
    const { app, sendEmail } = setup()
    const response = await app.request(request(body))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ success: false, message: expect.any(String) })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  test('sends parsed content once and preserves the success contract', async () => {
    const { app, sendEmail } = setup()
    const response = await app.request(
      request(JSON.stringify({ ...payload, email: 'reader@example.com', extra: 'ignored' })),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      message: `Comment received for ${payload.pageUrl}`,
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0]?.[0]).toEqual({
      tag: 'send_email',
      ...emailConfig,
      subject: 'Comment on /note',
      body: expect.stringContaining('From: reader@example.com'),
    })
  })

  test('returns 502 for delivery failures without exposing provider details', async () => {
    const app = createApp({
      emailConfig,
      sendEmail: async () => {
        throw new Error('provider-private-details')
      },
    })
    const response = await app.request(request(JSON.stringify(payload)))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Could not deliver comment. Try again later.',
    })
  })

  test('allows five requests per IP per minute and expires the sliding window', async () => {
    let time = 0
    const { app, sendEmail } = setup(() => time)
    const post = (ip = 'one') =>
      app.request(request(JSON.stringify(payload), { 'x-forwarded-for': ip }))
    for (let i = 0; i < 5; i++) expect((await post()).status).toBe(200)
    expect((await post()).status).toBe(429)
    expect((await post('two')).status).toBe(200)
    time = 59_999
    expect((await post()).status).toBe(429)
    time = 60_000
    expect((await post()).status).toBe(200)
    expect(sendEmail).toHaveBeenCalledTimes(7)
  })

  test('retains CORS on errors and preflight without calling the email provider', async () => {
    const { app, sendEmail } = setup()
    for (const origin of [
      'https://beathagenlocher.com',
      'http://localhost:20483',
      'http://beathagenlocher.com.localhost',
      'http://fix-header.beathagenlocher.com.localhost:8080',
    ]) {
      const response = await app.request(request('null', { Origin: origin }))
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
      const preflight = await app.request('http://localhost/comment', {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST')
    }
    for (const origin of [
      'https://other.example',
      'http://localhost.example',
      'http://evil.localhost.example',
      'https://beathagenlocher.com.evil',
    ]) {
      const untrusted = await app.request(request('null', { Origin: origin }))
      expect(untrusted.headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('startup configuration', () => {
  const env = {
    COMMENT_FROM: emailConfig.from,
    COMMENT_RECIPIENT: emailConfig.to,
    RESEND_API_KEY: 'test-key',
  }
  test('reads the configuration once into named fields', () => {
    expect(readConfig(env)).toEqual({ email: emailConfig, apiKey: 'test-key' })
  })
  test.each(['COMMENT_FROM', 'COMMENT_RECIPIENT', 'RESEND_API_KEY'])(
    'identifies missing or empty %s without printing values',
    (name) => {
      for (const value of [undefined, '', '  '])
        expect(() => readConfig({ ...env, [name]: value })).toThrow(
          `Missing required environment variable: ${name}`,
        )
    },
  )
})
