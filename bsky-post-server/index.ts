import { Hono, type Context } from 'hono'
import { AtpAgent, RichText } from '@atproto/api'
import { slug } from 'github-slugger'
import {
  ok,
  err,
  type Result,
  merge,
  validateTextLength,
  buildImageEmbed,
  buildReplyRef,
  buildReplyText,
  parsePngDimensions,
  inspect,
  type ValidationError,
} from './utils'
import {
  makeStreamshot,
  makeScreenshot,
  type ScreenshotResult,
  type ScreenshotError,
} from './typeshare'

// ============================================================================
// Types
// ============================================================================

type PostResult = { uri: string; cid: string }
type PostError = { type: 'post'; message: string }
type AppError = ValidationError | ScreenshotError | PostError

type PostPayload = {
  text: string
  facets?: unknown[]
  embed?: object
  reply?: object
  $type?: string
}

type BlueskyServices = {
  uploadBlob: (bytes: Uint8Array, encoding: string) => Promise<Result<unknown, PostError>>
  post: (payload: PostPayload) => Promise<Result<PostResult, PostError>>
  detectFacets: (text: string) => Promise<{ text: string; facets: unknown[] | undefined }>
}

type FileServices = {
  readPng: (
    path: string,
  ) => Promise<{
    bytes: Uint8Array
    dimensions: { width: number; height: number }
    encoding: string
  }>
}

// ============================================================================
// Pure Functions - Payload Builders
// ============================================================================

const buildTextPostPayload = (
  text: string,
  detectedFacets: unknown[] | undefined,
  userFacets: unknown[] | undefined,
) => ({
  text,
  facets: merge(userFacets as unknown[] | undefined, detectedFacets),
})

const buildImagePostPayload = (text: string, facets: unknown[] | undefined, embed: object) => ({
  text,
  facets,
  embed,
})

const buildReplyPostPayload = (
  text: string,
  facets: unknown[] | undefined,
  parentUri: string,
  parentCid: string,
) => ({
  $type: 'app.bsky.feed.post',
  text,
  facets,
  reply: buildReplyRef(parentUri, parentCid),
})

// ============================================================================
// Pure Functions - Response Builders
// ============================================================================

const successResponse = (c: Context, message: string) => {
  console.log(message)
  return c.json({ success: true, message })
}

const errorResponse = (c: Context, message: string) => {
  console.error(message)
  return c.json({ success: false, message }, 400)
}

const handleResult = <T>(
  c: Context,
  result: Result<T, AppError>,
  onSuccess: (value: T) => Response,
): Response => {
  if (result.ok) {
    return onSuccess(result.value)
  }
  return errorResponse(c, result.error.message)
}

// ============================================================================
// Pure Functions - Link Parsing
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
// Effect Layer - Service Implementations
// ============================================================================

const createBlueskyServices = (agent: AtpAgent): BlueskyServices => ({
  uploadBlob: async (bytes, encoding) => {
    try {
      const { data } = await agent.uploadBlob(bytes, { encoding })
      return ok(data.blob)
    } catch (e) {
      return err({ type: 'post', message: `Failed to upload blob: ${e}` })
    }
  },

  post: async (payload) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = await agent.post(payload as any)
      if (resp.uri && resp.cid) {
        return ok({ uri: resp.uri, cid: resp.cid })
      }
      return err({ type: 'post', message: 'Post succeeded but missing uri/cid' })
    } catch (e) {
      return err({ type: 'post', message: `Failed to post: ${e}` })
    }
  },

  detectFacets: async (text) => {
    const rt = new RichText({ text })
    await rt.detectFacets(agent)
    return { text: rt.text, facets: rt.facets }
  },
})

const createFileServices = (): FileServices => ({
  readPng: async (path) => {
    const file = Bun.file(path)
    const [bytes, header] = await Promise.all([
      file.arrayBuffer().then((buf) => new Uint8Array(buf)),
      file.slice(0, 24).arrayBuffer(),
    ])
    return {
      bytes,
      dimensions: parsePngDimensions(header),
      encoding: file.type,
    }
  },
})

// ============================================================================
// Use Cases - Orchestration Functions
// ============================================================================

const postText = async (
  services: BlueskyServices,
  text: string,
  userFacets: unknown[] | undefined,
): Promise<Result<PostResult, AppError>> => {
  const { text: processedText, facets } = await services.detectFacets(text)

  const validation = validateTextLength(processedText, 300)
  if (!validation.ok) return validation

  const payload = buildTextPostPayload(processedText, facets, userFacets)
  inspect(payload)
  return services.post(payload)
}

const postImage = async (
  services: BlueskyServices,
  fileServices: FileServices,
  pngPath: string,
  text: string,
  alttext: string,
): Promise<Result<PostResult, AppError>> => {
  const { bytes, dimensions, encoding } = await fileServices.readPng(pngPath)

  const blobResult = await services.uploadBlob(bytes, encoding)
  if (!blobResult.ok) return blobResult

  const { text: processedText, facets } = await services.detectFacets(text)
  const embed = buildImageEmbed(blobResult.value, alttext, dimensions)
  const payload = buildImagePostPayload(processedText, facets, embed)

  return services.post(payload)
}

const postReply = async (
  services: BlueskyServices,
  parentUri: string,
  parentCid: string,
  link: string,
  wasCropped: boolean,
): Promise<Result<PostResult, AppError>> => {
  const replyText = buildReplyText(link, wasCropped)
  const { text, facets } = await services.detectFacets(replyText)
  const payload = buildReplyPostPayload(text, facets, parentUri, parentCid)
  return services.post(payload)
}

const postImageWithReply = async (
  services: BlueskyServices,
  fileServices: FileServices,
  screenshotResult: ScreenshotResult,
  text: string,
  alttext: string,
  link: string,
): Promise<Result<{ imagePost: PostResult; replyPost: PostResult }, AppError>> => {
  const imageResult = await postImage(
    services,
    fileServices,
    screenshotResult.pngPath,
    text,
    alttext,
  )
  if (!imageResult.ok) return imageResult

  console.log(
    `Successfully posted image with text "${text}" to Bluesky (URI: ${imageResult.value.uri})`,
  )

  const replyResult = await postReply(
    services,
    imageResult.value.uri,
    imageResult.value.cid,
    link,
    screenshotResult.wasCropped,
  )
  if (!replyResult.ok) return replyResult

  console.log(`Successfully posted reply to image to Bluesky (URI: ${replyResult.value.uri})`)

  return ok({ imagePost: imageResult.value, replyPost: replyResult.value })
}

// ============================================================================
// Application Bootstrap
// ============================================================================

const createApp = (bluesky: BlueskyServices, files: FileServices) => {
  const app = new Hono()

  app.post('/post', async (c) => {
    const { text, facets } = await c.req.json()
    const result = await postText(bluesky, text, facets)

    return handleResult(c, result, () => successResponse(c, 'Successfully posted text to Bluesky'))
  })

  app.post('/post/as-image', async (c) => {
    const { text, alttext, link } = await c.req.json()
    const linkType = parseLink(link)
    const padding = getPadding(linkType)

    const screenshotResult =
      linkType.kind === 'stream'
        ? await makeStreamshot(linkType.streamId, padding)
        : await makeScreenshot(linkType.slugPath, padding)

    if (!screenshotResult.ok) {
      return errorResponse(c, screenshotResult.error.message)
    }

    const { pngPath, wasCropped } = screenshotResult.value
    const linkPath = getLinkPath(linkType, link)
    console.log(
      `created screenshot for "${linkPath}" at "${pngPath}"${wasCropped ? ' (cropped)' : ''}`,
    )

    const result = await postImageWithReply(
      bluesky,
      files,
      screenshotResult.value,
      text,
      alttext,
      linkPath,
    )

    return handleResult(c, result, ({ imagePost, replyPost }) =>
      successResponse(
        c,
        `Successfully posted image (URI: ${imagePost.uri}) and reply (URI: ${replyPost.uri})`,
      ),
    )
  })

  return app
}

// ============================================================================
// Entry Point - Effects at the Boundary
// ============================================================================

const agent = new AtpAgent({ service: 'https://bsky.social' })
await agent.login({
  identifier: 'beathagenlocher.com',
  password: process.env.BLUESKY_APP_SECRET!,
})

const app = createApp(createBlueskyServices(agent), createFileServices())

export default {
  port: 3000,
  fetch: app.fetch,
}
