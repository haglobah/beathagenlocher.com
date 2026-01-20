import type { BunFile } from 'bun'
import * as util from 'util'

// ============================================================================
// Result Type - Explicit error handling
// ============================================================================

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const mapResult = <T, U, E>(result: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  result.ok ? ok(f(result.value)) : result

export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? f(result.value) : result)

export const fromNullable = <T>(value: T | null | undefined, error: string): Result<T, string> =>
  value != null ? ok(value) : err(error)

// ============================================================================
// Pure Functions
// ============================================================================

export const graphemeLength = (s: string): number => [...new Intl.Segmenter().segment(s)].length

export const merge = <T>(a: T[] | undefined, b: T[] | undefined): T[] => {
  if (a === undefined && b === undefined) return []
  if (a === undefined) return b!
  if (b === undefined) return a
  return a.concat(b)
}

export const parsePngDimensions = (header: ArrayBuffer): { width: number; height: number } => {
  const view = new DataView(header)
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  }
}

// ============================================================================
// Data Builders (Pure)
// ============================================================================

export type ImageEmbed = {
  $type: 'app.bsky.embed.images'
  images: Array<{
    alt: string
    image: unknown
    aspectRatio: { width: number; height: number }
  }>
}

export const buildImageEmbed = (
  blob: unknown,
  alttext: string,
  dimensions: { width: number; height: number },
): ImageEmbed => ({
  $type: 'app.bsky.embed.images',
  images: [
    {
      alt: alttext,
      image: blob,
      aspectRatio: dimensions,
    },
  ],
})

export type ReplyRef = {
  root: { uri: string; cid: string }
  parent: { uri: string; cid: string }
}

export const buildReplyRef = (uri: string, cid: string): ReplyRef => ({
  root: { uri, cid },
  parent: { uri, cid },
})

export const buildReplyText = (link: string, wasCropped: boolean): string => {
  const weblink = `https://beathagenlocher.com/${link}`
  return wasCropped ? `Read the full post at ${weblink}` : `Originally posted at ${weblink}`
}

// ============================================================================
// Validation (Pure)
// ============================================================================

export type ValidationError = { type: 'validation'; message: string }

export const validateTextLength = (
  text: string,
  maxGraphemes: number,
): Result<string, ValidationError> => {
  const length = graphemeLength(text)
  return length <= maxGraphemes
    ? ok(text)
    : err({
        type: 'validation',
        message: `Text is too long: ${length} graphemes (max ${maxGraphemes})`,
      })
}

// ============================================================================
// Debug (Effect - but isolated)
// ============================================================================

export const inspect = <T>(thing: T): T => {
  console.log(util.inspect(thing, false, null, true))
  return thing
}
