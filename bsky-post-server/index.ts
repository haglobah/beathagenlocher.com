import { Hono, type Context } from 'hono'
import { AtpAgent, RichText } from '@atproto/api'
import { slug } from 'github-slugger'
import {
  merge,
  graphemeLength,
  buildImageEmbed,
  buildReplyRef,
  buildReplyText,
  parsePngDimensions,
} from './utils'
import {
  captureScreenshot,
  buildStreamConfig,
  buildArticleConfig,
  type ScreenshotConfig,
} from './typeshare'

// ============================================================================
// Cmd — Effects as data
// ============================================================================

type Cmd =
  | { tag: 'done' }
  | { tag: 'detect_facets'; text: string }
  | { tag: 'take_screenshot'; config: ScreenshotConfig }
  | { tag: 'read_png'; path: string }
  | { tag: 'upload_blob'; bytes: Uint8Array; encoding: string }
  | { tag: 'post'; payload: object }

// ============================================================================
// Msg — Results from executed effects
// ============================================================================

type Msg =
  | { tag: 'facets_detected'; text: string; facets: unknown[] | undefined }
  | { tag: 'screenshot_taken'; pngPath: string; wasCropped: boolean }
  | {
      tag: 'png_read'
      bytes: Uint8Array
      dimensions: { width: number; height: number }
      encoding: string
    }
  | { tag: 'blob_uploaded'; blob: unknown }
  | { tag: 'posted'; uri: string; cid: string }
  | { tag: 'failed'; error: string }

// ============================================================================
// Model — Discriminated union of all states
// ============================================================================

type Model =
  // Text flow
  | { tag: 'text_detecting_facets'; userFacets: unknown[] | undefined }
  | { tag: 'text_posting' }
  // Image flow
  | { tag: 'img_screenshotting'; text: string; alttext: string; linkPath: string }
  | { tag: 'img_reading_png'; text: string; alttext: string; linkPath: string; wasCropped: boolean }
  | {
      tag: 'img_uploading_blob'
      text: string
      alttext: string
      linkPath: string
      wasCropped: boolean
      dimensions: { width: number; height: number }
    }
  | {
      tag: 'img_detecting_facets'
      alttext: string
      linkPath: string
      wasCropped: boolean
      dimensions: { width: number; height: number }
      blob: unknown
    }
  | { tag: 'img_posting_image'; linkPath: string; wasCropped: boolean }
  | { tag: 'img_detecting_reply_facets'; imagePost: { uri: string; cid: string } }
  | { tag: 'img_posting_reply'; imagePost: { uri: string; cid: string } }
  // Terminal
  | { tag: 'done'; message: string }
  | { tag: 'failed'; error: string }

// ============================================================================
// Link Parsing
// ============================================================================

type LinkType = { kind: 'stream'; streamId: string } | { kind: 'article'; slugPath: string }

const parseLink = (link: string): LinkType => {
  if (link.startsWith('stream#')) {
    return { kind: 'stream', streamId: link.replace('stream#', '') }
  }
  return { kind: 'article', slugPath: slug(link) }
}

const getPadding = (linkType: LinkType) =>
  linkType.kind === 'stream'
    ? { left: 10, top: 10, right: 10, bottom: 10 }
    : { left: 30, top: -10, right: 30, bottom: 40 }

const getLinkPath = (linkType: LinkType, link: string) =>
  linkType.kind === 'stream' ? link : linkType.slugPath

// ============================================================================
// Init
// ============================================================================

const initTextPost = (text: string, userFacets?: unknown[]): [Model, Cmd] => [
  { tag: 'text_detecting_facets', userFacets },
  { tag: 'detect_facets', text },
]

const initImagePost = (text: string, alttext: string, link: string): [Model, Cmd] => {
  const linkType = parseLink(link)
  const padding = getPadding(linkType)
  const linkPath = getLinkPath(linkType, link)
  const config =
    linkType.kind === 'stream'
      ? buildStreamConfig(linkType.streamId, padding)
      : buildArticleConfig(linkType.slugPath, padding)

  return [
    { tag: 'img_screenshotting', text, alttext, linkPath },
    { tag: 'take_screenshot', config },
  ]
}

// ============================================================================
// Update — Pure state transitions
// ============================================================================

const update = (model: Model, msg: Msg): [Model, Cmd] => {
  if (msg.tag === 'failed') {
    return [{ tag: 'failed', error: msg.error }, { tag: 'done' }]
  }

  switch (model.tag) {
    // --- Text flow ---

    case 'text_detecting_facets': {
      if (msg.tag !== 'facets_detected')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      const length = graphemeLength(msg.text)
      if (length > 300) {
        return [
          { tag: 'failed', error: `Text is too long: ${length} graphemes (max 300)` },
          { tag: 'done' },
        ]
      }

      return [
        { tag: 'text_posting' },
        { tag: 'post', payload: { text: msg.text, facets: merge(model.userFacets, msg.facets) } },
      ]
    }

    case 'text_posting': {
      if (msg.tag !== 'posted')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      return [
        { tag: 'done', message: `Successfully posted text to Bluesky (URI: ${msg.uri})` },
        { tag: 'done' },
      ]
    }

    // --- Image flow ---

    case 'img_screenshotting': {
      if (msg.tag !== 'screenshot_taken')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      return [
        {
          tag: 'img_reading_png',
          text: model.text,
          alttext: model.alttext,
          linkPath: model.linkPath,
          wasCropped: msg.wasCropped,
        },
        { tag: 'read_png', path: msg.pngPath },
      ]
    }

    case 'img_reading_png': {
      if (msg.tag !== 'png_read')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      return [
        {
          tag: 'img_uploading_blob',
          text: model.text,
          alttext: model.alttext,
          linkPath: model.linkPath,
          wasCropped: model.wasCropped,
          dimensions: msg.dimensions,
        },
        { tag: 'upload_blob', bytes: msg.bytes, encoding: msg.encoding },
      ]
    }

    case 'img_uploading_blob': {
      if (msg.tag !== 'blob_uploaded')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      return [
        {
          tag: 'img_detecting_facets',
          alttext: model.alttext,
          linkPath: model.linkPath,
          wasCropped: model.wasCropped,
          dimensions: model.dimensions,
          blob: msg.blob,
        },
        { tag: 'detect_facets', text: model.text },
      ]
    }

    case 'img_detecting_facets': {
      if (msg.tag !== 'facets_detected')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      const embed = buildImageEmbed(model.blob, model.alttext, model.dimensions)
      return [
        { tag: 'img_posting_image', linkPath: model.linkPath, wasCropped: model.wasCropped },
        { tag: 'post', payload: { text: msg.text, facets: msg.facets, embed } },
      ]
    }

    case 'img_posting_image': {
      if (msg.tag !== 'posted')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      const replyText = buildReplyText(model.linkPath, model.wasCropped)
      return [
        { tag: 'img_detecting_reply_facets', imagePost: { uri: msg.uri, cid: msg.cid } },
        { tag: 'detect_facets', text: replyText },
      ]
    }

    case 'img_detecting_reply_facets': {
      if (msg.tag !== 'facets_detected')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      return [
        { tag: 'img_posting_reply', imagePost: model.imagePost },
        {
          tag: 'post',
          payload: {
            $type: 'app.bsky.feed.post',
            text: msg.text,
            facets: msg.facets,
            reply: buildReplyRef(model.imagePost.uri, model.imagePost.cid),
          },
        },
      ]
    }

    case 'img_posting_reply': {
      if (msg.tag !== 'posted')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      return [
        {
          tag: 'done',
          message: `Successfully posted image (URI: ${model.imagePost.uri}) and reply (URI: ${msg.uri})`,
        },
        { tag: 'done' },
      ]
    }

    case 'done':
    case 'failed':
      return [model, { tag: 'done' }]
  }
}

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
