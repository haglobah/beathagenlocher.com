import { describe, expect, test } from 'bun:test'
import {
  parseLink,
  getPadding,
  getLinkPath,
  initTextPost,
  initImagePost,
  update,
  type Model,
  type Msg,
} from './core'

// ============================================================================
// parseLink
// ============================================================================

describe('parseLink', () => {
  test('stream# prefix yields stream kind', () => {
    const result = parseLink('stream#abc-123')
    expect(result).toEqual({ kind: 'stream', streamId: 'abc-123' })
  })

  test('anything else yields article kind with slugified path', () => {
    const result = parseLink('My Cool Article')
    expect(result).toEqual({ kind: 'article', slugPath: 'my-cool-article' })
  })

  test('already-slugified article path is preserved', () => {
    const result = parseLink('already-slug')
    expect(result).toEqual({ kind: 'article', slugPath: 'already-slug' })
  })
})

// ============================================================================
// getPadding
// ============================================================================

describe('getPadding', () => {
  test('stream padding is uniform 10', () => {
    const pad = getPadding({ kind: 'stream', streamId: 'x' })
    expect(pad).toEqual({ left: 10, top: 10, right: 10, bottom: 10 })
  })

  test('article padding has negative top and larger sides', () => {
    const pad = getPadding({ kind: 'article', slugPath: 'x' })
    expect(pad).toEqual({ left: 30, top: -10, right: 30, bottom: 40 })
  })
})

// ============================================================================
// getLinkPath
// ============================================================================

describe('getLinkPath', () => {
  test('stream returns the raw link', () => {
    expect(getLinkPath({ kind: 'stream', streamId: 'abc' }, 'stream#abc')).toBe('stream#abc')
  })

  test('article returns the slugPath from linkType', () => {
    expect(getLinkPath({ kind: 'article', slugPath: 'my-slug' }, 'My Slug')).toBe('my-slug')
  })
})

// ============================================================================
// initTextPost
// ============================================================================

describe('initTextPost', () => {
  test('produces text_detecting_facets model and detect_facets cmd', () => {
    const [model, cmd] = initTextPost('hello world')
    expect(model).toEqual({ tag: 'text_detecting_facets', userFacets: undefined })
    expect(cmd).toEqual({ tag: 'detect_facets', text: 'hello world' })
  })

  test('passes through user facets', () => {
    const facets = [{ index: { byteStart: 0, byteEnd: 5 }, features: [] }]
    const [model] = initTextPost('hello', facets)
    expect(model).toEqual({ tag: 'text_detecting_facets', userFacets: facets })
  })
})

// ============================================================================
// initImagePost
// ============================================================================

describe('initImagePost', () => {
  test('stream link produces screenshot cmd for stream page', () => {
    const [model, cmd] = initImagePost('text', 'alt', 'stream#abc')
    expect(model.tag).toBe('img_screenshotting')
    if (model.tag === 'img_screenshotting') {
      expect(model.text).toBe('text')
      expect(model.alttext).toBe('alt')
      expect(model.linkPath).toBe('stream#abc')
    }
    expect(cmd.tag).toBe('take_screenshot')
    if (cmd.tag === 'take_screenshot') {
      expect(cmd.config.url).toBe('http://localhost:4321/stream')
    }
  })

  test('article link produces screenshot cmd for article page', () => {
    const [model, cmd] = initImagePost('text', 'alt', 'My Article')
    expect(model.tag).toBe('img_screenshotting')
    if (model.tag === 'img_screenshotting') {
      expect(model.linkPath).toBe('my-article')
    }
    expect(cmd.tag).toBe('take_screenshot')
    if (cmd.tag === 'take_screenshot') {
      expect(cmd.config.url).toBe('http://localhost:4321/my-article')
    }
  })
})

// ============================================================================
// update — Text Flow
// ============================================================================

describe('update — text flow', () => {
  test('text_detecting_facets + facets_detected → text_posting with post cmd', () => {
    const model: Model = { tag: 'text_detecting_facets', userFacets: undefined }
    const msg: Msg = { tag: 'facets_detected', text: 'hello', facets: [{ f: 1 }] }
    const [next, cmd] = update(model, msg)

    expect(next).toEqual({ tag: 'text_posting' })
    expect(cmd.tag).toBe('post')
    if (cmd.tag === 'post') {
      expect(cmd.payload).toEqual({ text: 'hello', facets: [{ f: 1 }] })
    }
  })

  test('merges user facets with detected facets', () => {
    const model: Model = { tag: 'text_detecting_facets', userFacets: [{ u: 1 }] }
    const msg: Msg = { tag: 'facets_detected', text: 'hello', facets: [{ d: 2 }] }
    const [, cmd] = update(model, msg)

    if (cmd.tag === 'post') {
      expect((cmd.payload as { facets: unknown[] }).facets).toEqual([{ u: 1 }, { d: 2 }])
    }
  })

  test('rejects text longer than 300 graphemes', () => {
    const model: Model = { tag: 'text_detecting_facets', userFacets: undefined }
    const longText = 'a'.repeat(301)
    const msg: Msg = { tag: 'facets_detected', text: longText, facets: undefined }
    const [next, cmd] = update(model, msg)

    expect(next.tag).toBe('failed')
    if (next.tag === 'failed') {
      expect(next.error).toContain('301 graphemes')
    }
    expect(cmd).toEqual({ tag: 'done' })
  })

  test('accepts text exactly 300 graphemes', () => {
    const model: Model = { tag: 'text_detecting_facets', userFacets: undefined }
    const text = 'a'.repeat(300)
    const msg: Msg = { tag: 'facets_detected', text, facets: undefined }
    const [next] = update(model, msg)

    expect(next.tag).toBe('text_posting')
  })

  test('text_posting + posted → done', () => {
    const model: Model = { tag: 'text_posting' }
    const msg: Msg = { tag: 'posted', uri: 'at://uri', cid: 'cid123' }
    const [next, cmd] = update(model, msg)

    expect(next.tag).toBe('done')
    if (next.tag === 'done') {
      expect(next.uri).toBe('at://uri')
      expect(next.message).toContain('at://uri')
    }
    expect(cmd).toEqual({ tag: 'done' })
  })
})

// ============================================================================
// update — Image Flow
// ============================================================================

describe('update — image flow', () => {
  test('img_screenshotting + screenshot_taken → img_reading_png', () => {
    const model: Model = { tag: 'img_screenshotting', text: 't', alttext: 'a', linkPath: 'lp' }
    const msg: Msg = { tag: 'screenshot_taken', pngPath: '/tmp/shot.png', wasCropped: true }
    const [next, cmd] = update(model, msg)

    expect(next).toEqual({
      tag: 'img_reading_png',
      text: 't',
      alttext: 'a',
      linkPath: 'lp',
      wasCropped: true,
    })
    expect(cmd).toEqual({ tag: 'read_png', path: '/tmp/shot.png' })
  })

  test('img_reading_png + png_read → img_uploading_blob', () => {
    const model: Model = {
      tag: 'img_reading_png',
      text: 't',
      alttext: 'a',
      linkPath: 'lp',
      wasCropped: false,
    }
    const bytes = new Uint8Array([1, 2, 3])
    const msg: Msg = {
      tag: 'png_read',
      bytes,
      dimensions: { width: 800, height: 600 },
      encoding: 'image/png',
    }
    const [next, cmd] = update(model, msg)

    expect(next).toEqual({
      tag: 'img_uploading_blob',
      text: 't',
      alttext: 'a',
      linkPath: 'lp',
      wasCropped: false,
      dimensions: { width: 800, height: 600 },
    })
    expect(cmd).toEqual({ tag: 'upload_blob', bytes, encoding: 'image/png' })
  })

  test('img_uploading_blob + blob_uploaded → img_detecting_facets', () => {
    const model: Model = {
      tag: 'img_uploading_blob',
      text: 'my text',
      alttext: 'a',
      linkPath: 'lp',
      wasCropped: false,
      dimensions: { width: 800, height: 600 },
    }
    const blob = { ref: 'blobref' }
    const msg: Msg = { tag: 'blob_uploaded', blob }
    const [next, cmd] = update(model, msg)

    expect(next).toEqual({
      tag: 'img_detecting_facets',
      alttext: 'a',
      linkPath: 'lp',
      wasCropped: false,
      dimensions: { width: 800, height: 600 },
      blob,
    })
    expect(cmd).toEqual({ tag: 'detect_facets', text: 'my text' })
  })

  test('img_detecting_facets + facets_detected → img_posting_image with embed', () => {
    const blob = { ref: 'blobref' }
    const model: Model = {
      tag: 'img_detecting_facets',
      alttext: 'alt',
      linkPath: 'lp',
      wasCropped: true,
      dimensions: { width: 800, height: 600 },
      blob,
    }
    const msg: Msg = { tag: 'facets_detected', text: 'detected', facets: [{ f: 1 }] }
    const [next, cmd] = update(model, msg)

    expect(next).toEqual({ tag: 'img_posting_image', linkPath: 'lp', wasCropped: true })
    expect(cmd.tag).toBe('post')
    if (cmd.tag === 'post') {
      const payload = cmd.payload as { text: string; facets: unknown[]; embed: { $type: string } }
      expect(payload.text).toBe('detected')
      expect(payload.facets).toEqual([{ f: 1 }])
      expect(payload.embed.$type).toBe('app.bsky.embed.images')
    }
  })

  test('img_posting_image + posted → img_detecting_reply_facets', () => {
    const model: Model = { tag: 'img_posting_image', linkPath: 'my-path', wasCropped: true }
    const msg: Msg = { tag: 'posted', uri: 'at://img-uri', cid: 'img-cid' }
    const [next, cmd] = update(model, msg)

    expect(next).toEqual({
      tag: 'img_detecting_reply_facets',
      imagePost: { uri: 'at://img-uri', cid: 'img-cid' },
    })
    expect(cmd.tag).toBe('detect_facets')
    if (cmd.tag === 'detect_facets') {
      expect(cmd.text).toContain('https://beathagenlocher.com/my-path')
      expect(cmd.text).toContain('Read the full post')
    }
  })

  test('img_posting_image + posted (uncropped) → reply text says "Originally posted"', () => {
    const model: Model = { tag: 'img_posting_image', linkPath: 'my-path', wasCropped: false }
    const msg: Msg = { tag: 'posted', uri: 'at://u', cid: 'c' }
    const [, cmd] = update(model, msg)

    if (cmd.tag === 'detect_facets') {
      expect(cmd.text).toContain('Originally posted')
    }
  })

  test('img_detecting_reply_facets + facets_detected → img_posting_reply', () => {
    const model: Model = {
      tag: 'img_detecting_reply_facets',
      imagePost: { uri: 'at://img', cid: 'cid1' },
    }
    const msg: Msg = { tag: 'facets_detected', text: 'reply text', facets: [{ r: 1 }] }
    const [next, cmd] = update(model, msg)

    expect(next).toEqual({
      tag: 'img_posting_reply',
      imagePost: { uri: 'at://img', cid: 'cid1' },
    })
    expect(cmd.tag).toBe('post')
    if (cmd.tag === 'post') {
      const payload = cmd.payload as { $type: string; text: string; reply: object }
      expect(payload.$type).toBe('app.bsky.feed.post')
      expect(payload.text).toBe('reply text')
      expect(payload.reply).toEqual({
        root: { uri: 'at://img', cid: 'cid1' },
        parent: { uri: 'at://img', cid: 'cid1' },
      })
    }
  })

  test('img_posting_reply + posted → done', () => {
    const model: Model = {
      tag: 'img_posting_reply',
      imagePost: { uri: 'at://img-uri', cid: 'img-cid' },
    }
    const msg: Msg = { tag: 'posted', uri: 'at://reply-uri', cid: 'reply-cid' }
    const [next, cmd] = update(model, msg)

    expect(next.tag).toBe('done')
    if (next.tag === 'done') {
      expect(next.uri).toBe('at://reply-uri')
      expect(next.message).toContain('at://img-uri')
      expect(next.message).toContain('at://reply-uri')
    }
    expect(cmd).toEqual({ tag: 'done' })
  })
})

// ============================================================================
// update — Failed msg absorbs from any state
// ============================================================================

describe('update — failed msg', () => {
  const failedMsg: Msg = { tag: 'failed', error: 'something broke' }

  const nonTerminalStates: Model[] = [
    { tag: 'text_detecting_facets', userFacets: undefined },
    { tag: 'text_posting' },
    { tag: 'img_screenshotting', text: '', alttext: '', linkPath: '' },
    { tag: 'img_reading_png', text: '', alttext: '', linkPath: '', wasCropped: false },
    {
      tag: 'img_uploading_blob',
      text: '',
      alttext: '',
      linkPath: '',
      wasCropped: false,
      dimensions: { width: 0, height: 0 },
    },
    {
      tag: 'img_detecting_facets',
      alttext: '',
      linkPath: '',
      wasCropped: false,
      dimensions: { width: 0, height: 0 },
      blob: null,
    },
    { tag: 'img_posting_image', linkPath: '', wasCropped: false },
    { tag: 'img_detecting_reply_facets', imagePost: { uri: '', cid: '' } },
    { tag: 'img_posting_reply', imagePost: { uri: '', cid: '' } },
  ]

  for (const model of nonTerminalStates) {
    test(`${model.tag} + failed → failed model`, () => {
      const [next, cmd] = update(model, failedMsg)
      expect(next).toEqual({ tag: 'failed', error: 'something broke' })
      expect(cmd).toEqual({ tag: 'done' })
    })
  }
})

// ============================================================================
// update — Wrong msg type transitions to failed
// ============================================================================

describe('update — wrong msg type', () => {
  test('text_detecting_facets + posted → failed', () => {
    const model: Model = { tag: 'text_detecting_facets', userFacets: undefined }
    const msg: Msg = { tag: 'posted', uri: 'u', cid: 'c' }
    const [next] = update(model, msg)
    expect(next.tag).toBe('failed')
  })

  test('text_posting + facets_detected → failed', () => {
    const model: Model = { tag: 'text_posting' }
    const msg: Msg = { tag: 'facets_detected', text: 'x', facets: [] }
    const [next] = update(model, msg)
    expect(next.tag).toBe('failed')
  })

  test('img_screenshotting + posted → failed', () => {
    const model: Model = { tag: 'img_screenshotting', text: '', alttext: '', linkPath: '' }
    const msg: Msg = { tag: 'posted', uri: 'u', cid: 'c' }
    const [next] = update(model, msg)
    expect(next.tag).toBe('failed')
  })
})

// ============================================================================
// update — Terminal states are idempotent
// ============================================================================

describe('update — terminal states', () => {
  test('done + any msg → done (unchanged)', () => {
    const model: Model = { tag: 'done', message: 'ok', uri: 'at://x' }
    const msg: Msg = { tag: 'posted', uri: 'at://y', cid: 'c' }
    const [next, cmd] = update(model, msg)
    expect(next).toEqual(model)
    expect(cmd).toEqual({ tag: 'done' })
  })

  test('failed + non-failed msg → failed (unchanged)', () => {
    const model: Model = { tag: 'failed', error: 'broken' }
    const msg: Msg = { tag: 'posted', uri: 'at://y', cid: 'c' }
    const [next, cmd] = update(model, msg)
    expect(next).toEqual(model)
    expect(cmd).toEqual({ tag: 'done' })
  })
})

// ============================================================================
// Full text flow integration
// ============================================================================

describe('full text flow', () => {
  test('init → facets_detected → posted → done', () => {
    const [m0, c0] = initTextPost('hello')
    expect(c0.tag).toBe('detect_facets')

    const [m1, c1] = update(m0, { tag: 'facets_detected', text: 'hello', facets: [] })
    expect(m1.tag).toBe('text_posting')
    expect(c1.tag).toBe('post')

    const [m2, c2] = update(m1, { tag: 'posted', uri: 'at://done', cid: 'ccc' })
    expect(m2.tag).toBe('done')
    expect(c2).toEqual({ tag: 'done' })
  })
})

// ============================================================================
// Full image flow integration
// ============================================================================

describe('full image flow', () => {
  test('init → screenshot → png_read → blob → facets → post → reply_facets → reply → done', () => {
    const [m0, c0] = initImagePost('hello img', 'alt', 'stream#s1')
    expect(m0.tag).toBe('img_screenshotting')
    expect(c0.tag).toBe('take_screenshot')

    const [m1, c1] = update(m0, { tag: 'screenshot_taken', pngPath: '/tmp/s.png', wasCropped: false })
    expect(m1.tag).toBe('img_reading_png')
    expect(c1.tag).toBe('read_png')

    const bytes = new Uint8Array([0])
    const [m2, c2] = update(m1, { tag: 'png_read', bytes, dimensions: { width: 600, height: 400 }, encoding: 'image/png' })
    expect(m2.tag).toBe('img_uploading_blob')
    expect(c2.tag).toBe('upload_blob')

    const [m3, c3] = update(m2, { tag: 'blob_uploaded', blob: { ref: 'b' } })
    expect(m3.tag).toBe('img_detecting_facets')
    expect(c3.tag).toBe('detect_facets')

    const [m4, c4] = update(m3, { tag: 'facets_detected', text: 'hello img', facets: [] })
    expect(m4.tag).toBe('img_posting_image')
    expect(c4.tag).toBe('post')

    const [m5, c5] = update(m4, { tag: 'posted', uri: 'at://img', cid: 'ic' })
    expect(m5.tag).toBe('img_detecting_reply_facets')
    expect(c5.tag).toBe('detect_facets')

    const [m6, c6] = update(m5, { tag: 'facets_detected', text: 'reply', facets: [] })
    expect(m6.tag).toBe('img_posting_reply')
    expect(c6.tag).toBe('post')

    const [m7, c7] = update(m6, { tag: 'posted', uri: 'at://reply', cid: 'rc' })
    expect(m7.tag).toBe('done')
    expect(c7).toEqual({ tag: 'done' })
  })
})
