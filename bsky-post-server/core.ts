import { slug } from 'github-slugger'
import {
  merge,
  graphemeLength,
  buildImageEmbed,
  buildReplyRef,
  buildReplyText,
} from './utils'
import {
  buildStreamConfig,
  buildArticleConfig,
  type ScreenshotConfig,
} from './typeshare'

// ============================================================================
// Cmd — Effects as data
// ============================================================================

export type Cmd =
  | { tag: 'done' }
  | { tag: 'detect_facets'; text: string }
  | { tag: 'take_screenshot'; config: ScreenshotConfig }
  | { tag: 'read_png'; path: string }
  | { tag: 'upload_blob'; bytes: Uint8Array; encoding: string }
  | { tag: 'post'; payload: object }

// ============================================================================
// Msg — Results from executed effects
// ============================================================================

export type Msg =
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

export type Model =
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
  | { tag: 'done'; message: string; uri: string }
  | { tag: 'failed'; error: string }

// ============================================================================
// Link Parsing
// ============================================================================

export type LinkType = { kind: 'stream'; streamId: string } | { kind: 'article'; slugPath: string }

export const parseLink = (link: string): LinkType => {
  if (link.startsWith('stream#')) {
    return { kind: 'stream', streamId: link.replace('stream#', '') }
  }
  return { kind: 'article', slugPath: slug(link) }
}

export const getPadding = (linkType: LinkType) =>
  linkType.kind === 'stream'
    ? { left: 10, top: 10, right: 10, bottom: 10 }
    : { left: 30, top: -10, right: 30, bottom: 40 }

export const getLinkPath = (linkType: LinkType, link: string) =>
  linkType.kind === 'stream' ? link : linkType.slugPath

// ============================================================================
// Init
// ============================================================================

export const initTextPost = (text: string, userFacets?: unknown[]): [Model, Cmd] => [
  { tag: 'text_detecting_facets', userFacets },
  { tag: 'detect_facets', text },
]

export const initImagePost = (text: string, alttext: string, link: string): [Model, Cmd] => {
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

export const update = (model: Model, msg: Msg): [Model, Cmd] => {
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
        {
          tag: 'done',
          message: `Successfully posted text to Bluesky (URI: ${msg.uri})`,
          uri: msg.uri,
        },
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
          uri: msg.uri,
        },
        { tag: 'done' },
      ]
    }

    case 'done':
    case 'failed':
      return [model, { tag: 'done' }]
  }
}
