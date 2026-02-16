import { Hono, type Context } from 'hono'
import { AtpAgent, RichText } from '@atproto/api'
import { parsePngDimensions } from './utils'
import { captureScreenshot } from './typeshare'
import {
  type Cmd,
  type Msg,
  type Model,
  initTextPost,
  initImagePost,
  update,
} from './core'

// ============================================================================
// Execute — Effect interpreter
// ============================================================================

const execute =
  (agent: AtpAgent) =>
  async (cmd: Cmd): Promise<Msg> => {
    try {
      switch (cmd.tag) {
        case 'done':
          throw new Error('Cannot execute terminal cmd')

        case 'detect_facets': {
          const rt = new RichText({ text: cmd.text })
          await rt.detectFacets(agent)
          return { tag: 'facets_detected', text: rt.text, facets: rt.facets }
        }

        case 'take_screenshot': {
          const result = await captureScreenshot(cmd.config)
          if (!result.ok) return { tag: 'failed', error: result.error.message }
          return {
            tag: 'screenshot_taken',
            pngPath: result.value.pngPath,
            wasCropped: result.value.wasCropped,
          }
        }

        case 'read_png': {
          const file = Bun.file(cmd.path)
          const [bytes, header] = await Promise.all([
            file.arrayBuffer().then((buf) => new Uint8Array(buf)),
            file.slice(0, 24).arrayBuffer(),
          ])
          return {
            tag: 'png_read',
            bytes,
            dimensions: parsePngDimensions(header),
            encoding: file.type,
          }
        }

        case 'upload_blob': {
          const { data } = await agent.uploadBlob(cmd.bytes, { encoding: cmd.encoding })
          return { tag: 'blob_uploaded', blob: data.blob }
        }

        case 'post': {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resp = await agent.post(cmd.payload as any)
          if (resp.uri && resp.cid) {
            return { tag: 'posted', uri: resp.uri, cid: resp.cid }
          }
          return { tag: 'failed', error: 'Post succeeded but missing uri/cid' }
        }
      }
    } catch (e) {
      return { tag: 'failed', error: String(e) }
    }
  }

// ============================================================================
// Run — Recursive dispatch loop
// ============================================================================

const run = async (exec: (cmd: Cmd) => Promise<Msg>, model: Model, cmd: Cmd): Promise<Model> => {
  if (cmd.tag === 'done') return model

  console.log(`[${model.tag}] → ${cmd.tag}`)
  const msg = await exec(cmd)
  const [nextModel, nextCmd] = update(model, msg)
  return run(exec, nextModel, nextCmd)
}

// ============================================================================
// Respond — Terminal Model → HTTP Response
// ============================================================================

const respond = (c: Context, model: Model): Response => {
  switch (model.tag) {
    case 'done':
      console.log(model.message)
      return c.json({ success: true, message: model.message, uri: model.uri })
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

const agent = new AtpAgent({ service: 'https://bsky.social' })
await agent.login({
  identifier: 'beathagenlocher.com',
  password: process.env.BLUESKY_APP_SECRET!,
})

const exec = execute(agent)
const app = new Hono()

app.post('/post', async (c) => {
  const { text, facets } = await c.req.json()
  const [model, cmd] = initTextPost(text, facets)
  const final = await run(exec, model, cmd)
  return respond(c, final)
})

app.post('/post/as-image', async (c) => {
  const { text, alttext, link } = await c.req.json()
  const [model, cmd] = initImagePost(text, alttext, link)
  const final = await run(exec, model, cmd)
  return respond(c, final)
})

export default {
  port: 3000,
  fetch: app.fetch,
}
