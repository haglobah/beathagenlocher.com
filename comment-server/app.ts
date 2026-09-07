import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { type EmailConfig, type SendEmail, type Msg, parseComment, init, update } from './core'

type Dependencies = {
  emailConfig: EmailConfig
  sendEmail: (cmd: SendEmail) => Promise<void>
  now?: () => number
}

const PRODUCTION_ORIGIN = 'https://beathagenlocher.com'

/** Development origins: `localhost` or any name below `.localhost`, on any port. */
export const isLocalOrigin = (origin: string): boolean => {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  const host = url.hostname
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    (host === 'localhost' || host.endsWith('.localhost'))
  )
}

const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60_000

export const createApp = ({ emailConfig, sendEmail, now = Date.now }: Dependencies) => {
  const app = new Hono()
  // Best-effort per-process/isolate limit; each app owns its own window.
  const requests = new Map<string, number[]>()
  const isRateLimited = (ip: string): boolean => {
    const time = now()
    for (const [key, timestamps] of requests) {
      if (timestamps.every((timestamp) => time - timestamp >= RATE_WINDOW_MS)) requests.delete(key)
    }
    const timestamps = (requests.get(ip) ?? []).filter((t) => time - t < RATE_WINDOW_MS)
    requests.set(ip, timestamps)
    if (timestamps.length >= RATE_LIMIT) return true
    timestamps.push(time)
    return false
  }

  const execute = async (cmd: SendEmail): Promise<Msg> => {
    try {
      await sendEmail(cmd)
      return { tag: 'email_sent' }
    } catch {
      // Provider errors may contain credentials or transport details.
      return { tag: 'failed', error: 'Could not deliver comment. Try again later.' }
    }
  }

  app.use(
    '/*',
    cors({
      origin: (origin) =>
        origin === PRODUCTION_ORIGIN || isLocalOrigin(origin) ? origin : null,
      allowMethods: ['POST'],
      allowHeaders: ['Content-Type'],
    }),
  )
  app.onError((_error, c) => c.json({ success: false, message: 'Internal error' }, 500))

  app.post('/comment', async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'
    if (isRateLimited(ip))
      return c.json({ success: false, message: 'Rate limited. Try again later.' }, 429)

    let raw: unknown
    try {
      raw = await c.req.json<unknown>()
    } catch {
      return c.json({ success: false, message: 'Invalid JSON' }, 400)
    }
    const parsed = parseComment(raw)
    if (parsed.tag === 'error')
      return c.json({ success: false, message: parsed.error.message }, 400)

    const [model, cmd] = init(parsed.value, emailConfig)
    const [final] = update(model, await execute(cmd))
    switch (final.tag) {
      case 'done':
        return c.json({ success: true, message: final.message })
      case 'failed':
        return c.json({ success: false, message: final.error }, 502)
    }
  })

  return app
}
