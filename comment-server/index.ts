import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { Resend } from 'resend'
import {
  type Cmd,
  type Msg,
  type Model,
  type CommentPayload,
  validatePayload,
  init,
  update,
} from './core'

// ============================================================================
// Config
// ============================================================================

const COMMENT_FROM = process.env.COMMENT_FROM!
const COMMENT_RECIPIENT = process.env.COMMENT_RECIPIENT!
const RESEND_API_KEY = process.env.RESEND_API_KEY!

const emailConfig = { from: COMMENT_FROM, to: COMMENT_RECIPIENT }

// ============================================================================
// Rate limiter — Simple in-memory sliding window
// ============================================================================

const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60_000

const isRateLimited = (ip: string): boolean => {
  const now = Date.now()
  const timestamps = (rateLimitMap.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  rateLimitMap.set(ip, timestamps)
  if (timestamps.length >= RATE_LIMIT) return true
  timestamps.push(now)
  return false
}

// ============================================================================
// Execute — Effect interpreter
// ============================================================================

const resend = new Resend(RESEND_API_KEY)

const execute = async (cmd: Cmd): Promise<Msg> => {
  try {
    switch (cmd.tag) {
      case 'done':
        throw new Error('Cannot execute terminal cmd')

      case 'validate_payload': {
        const error = validatePayload(cmd.payload)
        if (error) return { tag: 'failed', error }
        return { tag: 'payload_valid', payload: cmd.payload }
      }

      case 'send_email': {
        const { error } = await resend.emails.send({
          from: cmd.from,
          to: cmd.to,
          subject: cmd.subject,
          text: cmd.body,
        })
        if (error) return { tag: 'failed', error: error.message }
        return { tag: 'email_sent' }
      }
    }
  } catch (e) {
    return { tag: 'failed', error: String(e) }
  }
}

// ============================================================================
// Run — Recursive dispatch loop
// ============================================================================

const run = async (model: Model, cmd: Cmd): Promise<Model> => {
  if (cmd.tag === 'done') return model

  console.log(`[${model.tag}] → ${cmd.tag}`)
  const msg = await execute(cmd)
  const [nextModel, nextCmd] = update(model, msg, emailConfig)
  return run(nextModel, nextCmd)
}

// ============================================================================
// Respond — Terminal Model → HTTP Response
// ============================================================================

const respond = (c: Context, model: Model): Response => {
  switch (model.tag) {
    case 'done':
      console.log(model.message)
      return c.json({ success: true, message: model.message })
    case 'failed':
      console.error(model.error)
      return c.json({ success: false, message: model.error }, 400)
    default:
      return c.json({ success: false, message: `Unexpected terminal state: ${model.tag}` }, 500)
  }
}

// ============================================================================
// Application
// ============================================================================

const app = new Hono()

app.use(
  '/*',
  cors({
    origin: ['https://beathagenlocher.com', 'http://localhost:4321'],
    allowMethods: ['POST'],
    allowHeaders: ['Content-Type'],
  }),
)

app.post('/comment', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'
  if (isRateLimited(ip)) {
    return c.json({ success: false, message: 'Rate limited. Try again later.' }, 429)
  }

  const payload = (await c.req.json()) as CommentPayload
  const [model, cmd] = init(payload)
  const final = await run(model, cmd)
  return respond(c, final)
})

export default {
  port: 3001,
  fetch: app.fetch,
}
