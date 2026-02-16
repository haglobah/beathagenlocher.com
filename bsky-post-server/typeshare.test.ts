import { describe, expect, test } from 'bun:test'
import {
  computeClip,
  buildFadeOverlayStyle,
  buildStreamConfig,
  buildArticleConfig,
} from './typeshare'

// ============================================================================
// computeClip
// ============================================================================

describe('computeClip', () => {
  const box = { x: 100, y: 200, width: 400, height: 300 }
  const padding = { top: 10, right: 20, bottom: 30, left: 15 }

  test('applies padding to clip dimensions', () => {
    const { clip } = computeClip(box, padding, 800, 1000)
    expect(clip.x).toBe(Math.round(box.x - padding.left))
    expect(clip.y).toBe(Math.round(box.y - padding.top))
    expect(clip.width).toBe(Math.round(box.width + padding.left + padding.right))
  })

  test('full height = box.height + top + bottom padding', () => {
    const { clip } = computeClip(box, padding, 800, 1000)
    const fullHeight = Math.round(box.height + padding.top + padding.bottom)
    expect(clip.height).toBe(fullHeight)
  })

  // Law: wasCropped iff fullHeight > fadeStart
  test('not cropped when height <= fadeStart', () => {
    const { wasCropped } = computeClip(box, padding, 800, 1000)
    const fullHeight = box.height + padding.top + padding.bottom // 340
    expect(fullHeight).toBeLessThanOrEqual(800)
    expect(wasCropped).toBe(false)
  })

  test('cropped when height > fadeStart', () => {
    const tallBox = { x: 0, y: 0, width: 400, height: 900 }
    const { wasCropped } = computeClip(tallBox, padding, 800, 1000)
    const fullHeight = tallBox.height + padding.top + padding.bottom // 940
    expect(fullHeight).toBeGreaterThan(800)
    expect(wasCropped).toBe(true)
  })

  // Law: clip.height = min(fullHeight, maxHeight)
  test('clipped height capped at maxHeight', () => {
    const tallBox = { x: 0, y: 0, width: 400, height: 1200 }
    const { clip } = computeClip(tallBox, padding, 800, 1000)
    expect(clip.height).toBe(1000)
  })

  test('clipped height equals full height when under max', () => {
    const { clip } = computeClip(box, padding, 800, 1000)
    const fullHeight = Math.round(box.height + padding.top + padding.bottom)
    expect(clip.height).toBe(fullHeight)
  })

  test('rounds all clip values', () => {
    const fractionalBox = { x: 10.7, y: 20.3, width: 100.5, height: 200.9 }
    const { clip } = computeClip(fractionalBox, { top: 5.5, right: 3.2, bottom: 7.8, left: 2.1 }, 800, 1000)
    expect(clip.x).toBe(Math.round(fractionalBox.x - 2.1))
    expect(clip.y).toBe(Math.round(fractionalBox.y - 5.5))
    expect(clip.width).toBe(Math.round(fractionalBox.width + 2.1 + 3.2))
    expect(clip.height).toBe(Math.round(fractionalBox.height + 5.5 + 7.8))
  })

  test('negative padding (overlap) is supported', () => {
    const negPad = { top: -10, right: 30, bottom: 40, left: 30 }
    const { clip } = computeClip(box, negPad, 800, 1000)
    expect(clip.y).toBe(Math.round(box.y + 10)) // subtracting negative = adding
    expect(clip.height).toBe(Math.round(box.height - 10 + 40))
  })
})

// ============================================================================
// buildFadeOverlayStyle
// ============================================================================

describe('buildFadeOverlayStyle', () => {
  test('contains the top value', () => {
    const style = buildFadeOverlayStyle(500, 200)
    expect(style).toContain('top: 500px')
  })

  test('contains the height value', () => {
    const style = buildFadeOverlayStyle(500, 200)
    expect(style).toContain('height: 200px')
  })

  test('includes gradient background', () => {
    const style = buildFadeOverlayStyle(0, 100)
    expect(style).toContain('linear-gradient')
  })

  test('is positioned absolute', () => {
    const style = buildFadeOverlayStyle(0, 0)
    expect(style).toContain('position: absolute')
  })

  test('has high z-index', () => {
    const style = buildFadeOverlayStyle(0, 0)
    expect(style).toContain('z-index: 9999')
  })
})

// ============================================================================
// buildStreamConfig
// ============================================================================

describe('buildStreamConfig', () => {
  const padding = { top: 10, right: 10, bottom: 10, left: 10 }

  test('targets the stream page', () => {
    const config = buildStreamConfig('abc', padding)
    expect(config.url).toBe('http://localhost:4321/stream')
  })

  test('selector targets the stream ID', () => {
    const config = buildStreamConfig('my-stream-id', padding)
    expect(config.selector).toBe('[id="my-stream-id"]')
  })

  test('code selector targets expressive-code inside the stream element', () => {
    const config = buildStreamConfig('abc', padding)
    expect(config.codeSelector).toBe('[id="abc"] .expressive-code .frame pre')
  })

  test('output path is under screenshots/stream/', () => {
    const config = buildStreamConfig('abc', padding)
    expect(config.outputPath).toBe('screenshots/stream/abc.png')
  })

  test('padding is passed through', () => {
    const config = buildStreamConfig('abc', padding)
    expect(config.padding).toEqual(padding)
  })
})

// ============================================================================
// buildArticleConfig
// ============================================================================

describe('buildArticleConfig', () => {
  const padding = { top: -10, right: 30, bottom: 40, left: 30 }

  test('targets the article page by slug path', () => {
    const config = buildArticleConfig('my-article', padding)
    expect(config.url).toBe('http://localhost:4321/my-article')
  })

  test('selector targets .post', () => {
    const config = buildArticleConfig('my-article', padding)
    expect(config.selector).toBe('.post')
  })

  test('code selector targets expressive-code globally', () => {
    const config = buildArticleConfig('my-article', padding)
    expect(config.codeSelector).toBe('.expressive-code .frame pre')
  })

  test('output path is under screenshots/', () => {
    const config = buildArticleConfig('my-article', padding)
    expect(config.outputPath).toBe('screenshots/my-article.png')
  })

  test('padding is passed through', () => {
    const config = buildArticleConfig('x', padding)
    expect(config.padding).toEqual(padding)
  })
})
