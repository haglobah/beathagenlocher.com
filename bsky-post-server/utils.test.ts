import { describe, expect, test } from 'bun:test'
import {
  ok,
  err,
  fromNullable,
  graphemeLength,
  merge,
  parsePngDimensions,
  buildImageEmbed,
  buildReplyRef,
  buildReplyText,
} from './utils'

// ============================================================================
// Result
// ============================================================================

describe('ok', () => {
  test('wraps a value', () => {
    const r = ok(42)
    expect(r).toEqual({ ok: true, value: 42 })
  })

  test('ok field is true', () => {
    expect(ok('x').ok).toBe(true)
  })
})

describe('err', () => {
  test('wraps an error', () => {
    const r = err('boom')
    expect(r).toEqual({ ok: false, error: 'boom' })
  })

  test('ok field is false', () => {
    expect(err('x').ok).toBe(false)
  })
})

describe('fromNullable', () => {
  test('returns ok for non-null value', () => {
    expect(fromNullable(42, 'missing')).toEqual(ok(42))
  })

  test('returns ok for falsy but non-null value', () => {
    expect(fromNullable(0, 'missing')).toEqual(ok(0))
    expect(fromNullable('', 'missing')).toEqual(ok(''))
    expect(fromNullable(false, 'missing')).toEqual(ok(false))
  })

  test('returns err for null', () => {
    expect(fromNullable(null, 'was null')).toEqual(err('was null'))
  })

  test('returns err for undefined', () => {
    expect(fromNullable(undefined, 'was undef')).toEqual(err('was undef'))
  })
})

// ============================================================================
// graphemeLength
// ============================================================================

describe('graphemeLength', () => {
  test('empty string has length 0', () => {
    expect(graphemeLength('')).toBe(0)
  })

  test('ascii characters count as 1 each', () => {
    expect(graphemeLength('hello')).toBe(5)
  })

  test('emoji counts as 1 grapheme', () => {
    expect(graphemeLength('👋')).toBe(1)
  })

  test('compound emoji counts as 1 grapheme', () => {
    // Family emoji (ZWJ sequence)
    expect(graphemeLength('👨‍👩‍👧‍👦')).toBe(1)
  })

  test('flag emoji counts as 1 grapheme', () => {
    expect(graphemeLength('🇩🇪')).toBe(1)
  })

  test('mixed ascii and emoji', () => {
    expect(graphemeLength('hi 👋')).toBe(4)
  })
})

// ============================================================================
// merge
// ============================================================================

describe('merge', () => {
  // Law: identity — merge(undefined, xs) = xs, merge(xs, undefined) = xs
  test('left identity: merge(undefined, xs) = xs', () => {
    const xs = [1, 2, 3]
    expect(merge(undefined, xs)).toEqual(xs)
  })

  test('right identity: merge(xs, undefined) = xs', () => {
    const xs = [1, 2, 3]
    expect(merge(xs, undefined)).toEqual(xs)
  })

  // Law: annihilation — merge(undefined, undefined) = []
  test('both undefined yields empty', () => {
    expect(merge(undefined, undefined)).toEqual([])
  })

  // Law: concatenation — merge(a, b) = a.concat(b)
  test('concatenates two arrays', () => {
    expect(merge([1, 2], [3, 4])).toEqual([1, 2, 3, 4])
  })

  test('empty arrays', () => {
    expect(merge([], [])).toEqual([])
  })

  test('one empty array', () => {
    expect(merge([1], [])).toEqual([1])
    expect(merge([], [2])).toEqual([2])
  })
})

// ============================================================================
// parsePngDimensions
// ============================================================================

describe('parsePngDimensions', () => {
  test('reads width and height from PNG IHDR chunk', () => {
    // A minimal 24-byte PNG header:
    // bytes 0-7: PNG signature
    // bytes 8-11: IHDR length
    // bytes 12-15: "IHDR"
    // bytes 16-19: width (big-endian uint32)
    // bytes 20-23: height (big-endian uint32)
    const buf = new ArrayBuffer(24)
    const view = new DataView(buf)
    view.setUint32(16, 800) // width
    view.setUint32(20, 600) // height
    expect(parsePngDimensions(buf)).toEqual({ width: 800, height: 600 })
  })

  test('handles large dimensions', () => {
    const buf = new ArrayBuffer(24)
    const view = new DataView(buf)
    view.setUint32(16, 3840)
    view.setUint32(20, 2160)
    expect(parsePngDimensions(buf)).toEqual({ width: 3840, height: 2160 })
  })

  test('handles 1x1', () => {
    const buf = new ArrayBuffer(24)
    const view = new DataView(buf)
    view.setUint32(16, 1)
    view.setUint32(20, 1)
    expect(parsePngDimensions(buf)).toEqual({ width: 1, height: 1 })
  })
})

// ============================================================================
// buildImageEmbed
// ============================================================================

describe('buildImageEmbed', () => {
  test('produces correct embed structure', () => {
    const blob = { ref: 'abc', mimeType: 'image/png' }
    const dims = { width: 800, height: 600 }
    const result = buildImageEmbed(blob, 'alt text', dims)

    expect(result.$type).toBe('app.bsky.embed.images')
    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toEqual({
      alt: 'alt text',
      image: blob,
      aspectRatio: dims,
    })
  })

  test('preserves blob reference identity', () => {
    const blob = { ref: 'xyz' }
    const result = buildImageEmbed(blob, '', { width: 1, height: 1 })
    expect(result.images[0]!.image).toBe(blob)
  })
})

// ============================================================================
// buildReplyRef
// ============================================================================

describe('buildReplyRef', () => {
  test('sets root and parent to the same values', () => {
    const ref = buildReplyRef('at://uri', 'cid123')
    expect(ref.root).toEqual({ uri: 'at://uri', cid: 'cid123' })
    expect(ref.parent).toEqual({ uri: 'at://uri', cid: 'cid123' })
  })

  // Law: root = parent (this is a self-reply, always the first in a thread)
  test('root and parent are structurally equal', () => {
    const ref = buildReplyRef('at://x', 'c')
    expect(ref.root).toEqual(ref.parent)
  })
})

// ============================================================================
// buildReplyText
// ============================================================================

describe('buildReplyText', () => {
  test('cropped text includes "Read the full post"', () => {
    const text = buildReplyText('my-post', true)
    expect(text).toBe('Read the full post at https://beathagenlocher.com/my-post')
  })

  test('uncropped text includes "Originally posted"', () => {
    const text = buildReplyText('my-post', false)
    expect(text).toBe('Originally posted at https://beathagenlocher.com/my-post')
  })

  test('link path is appended to base URL', () => {
    const text = buildReplyText('stream#abc', false)
    expect(text).toContain('https://beathagenlocher.com/stream#abc')
  })
})
