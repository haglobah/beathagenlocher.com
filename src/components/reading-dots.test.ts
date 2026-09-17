import { describe, expect, test } from 'bun:test'
import { binaryDots, readingMinutes } from './reading-dots.ts'

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

describe('readingMinutes', () => {
  test('an empty body still takes a minute', () => {
    expect(readingMinutes('')).toBe(1)
  })

  test('rounds up to whole minutes at 200 words per minute', () => {
    expect(readingMinutes(words(200))).toBe(1)
    expect(readingMinutes(words(201))).toBe(2)
    expect(readingMinutes(words(1000))).toBe(5)
  })

  test('ignores MDX imports, tags and punctuation-only tokens', () => {
    const body = [
      "import Callout from '../../components/Callout.astro'",
      '',
      '<Callout type="info">',
      `${words(200)} -- ... ***`,
      '</Callout>',
    ].join('\n')
    expect(readingMinutes(body)).toBe(1)
  })

  test('wiki link aliases count once', () => {
    expect(readingMinutes(`${words(199)} [[some-page|alias]]`)).toBe(1)
    expect(readingMinutes(`${words(200)} [[some-page|alias]]`)).toBe(2)
  })
})

describe('binaryDots', () => {
  test('encodes the minutes most significant bit first, padded to four dots', () => {
    expect(binaryDots(0)).toEqual([false, false, false, false])
    expect(binaryDots(1)).toEqual([false, false, false, true])
    expect(binaryDots(5)).toEqual([false, true, false, true])
    expect(binaryDots(15)).toEqual([true, true, true, true])
  })

  test('grows past four dots when the minutes need more bits', () => {
    expect(binaryDots(16)).toEqual([true, false, false, false, false])
    expect(binaryDots(42)).toEqual([true, false, true, false, true, false])
  })

  test('the minimum width is configurable', () => {
    expect(binaryDots(3, 2)).toEqual([true, true])
    expect(binaryDots(3, 6)).toEqual([false, false, false, false, true, true])
  })
})
