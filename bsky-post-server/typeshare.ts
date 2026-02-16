import { chromium, type Page, type Browser } from 'playwright'
import { ok, err, fromNullable, type Result } from './utils'

// ============================================================================
// Types
// ============================================================================

type Box = { x: number; y: number; width: number; height: number }
type Padding = { top: number; right: number; bottom: number; left: number }
type Clip = { x: number; y: number; width: number; height: number }

export type ScreenshotResult = { pngPath: string; wasCropped: boolean }
export type ScreenshotError = { type: 'screenshot'; message: string }

export type ScreenshotConfig = {
  url: string
  selector: string
  codeSelector: string
  outputPath: string
  padding: Padding
}

// ============================================================================
// Constants
// ============================================================================

const FADE_START = 800
const MAX_HEIGHT = 1000

const customDevice = {
  userAgent: 'Mozilla/5.0',
  viewport: { width: 600, height: 1500 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  defaultBrowserType: 'webkit' as const,
}

const execPath =
  '/nix/store/by92qwh4grm99ydkn8d8mk2v7c8ixwy8-playwright-browsers/chromium-1181/chrome-linux/chrome'

// ============================================================================
// Pure Functions
// ============================================================================

const computeClip = (
  box: Box,
  padding: Padding,
  fadeStart: number,
  maxHeight: number
): { clip: Clip; wasCropped: boolean } => {
  const fullHeight = Math.round(box.height + padding.top + padding.bottom)
  const clippedHeight = Math.min(fullHeight, maxHeight)
  const wasCropped = fullHeight > fadeStart

  return {
    clip: {
      x: Math.round(box.x - padding.left),
      y: Math.round(box.y - padding.top),
      width: Math.round(box.width + padding.left + padding.right),
      height: clippedHeight,
    },
    wasCropped,
  }
}

const buildFadeOverlayStyle = (top: number, height: number): string => `
  position: absolute;
  top: ${top}px;
  left: 0;
  right: 0;
  height: ${height}px;
  background: linear-gradient(to bottom, transparent, gray);
  pointer-events: none;
  z-index: 9999;
`

export const buildStreamConfig = (streamId: string, padding: Padding): ScreenshotConfig => ({
  url: 'http://localhost:4321/stream',
  selector: `[id="${streamId}"]`,
  codeSelector: `[id="${streamId}"] .expressive-code .frame pre`,
  outputPath: `screenshots/stream/${streamId}.png`,
  padding,
})

export const buildArticleConfig = (path: string, padding: Padding): ScreenshotConfig => ({
  url: `http://localhost:4321/${path}`,
  selector: '.post',
  codeSelector: '.expressive-code .frame pre',
  outputPath: `screenshots/${path}.png`,
  padding,
})

// ============================================================================
// Effect Runners (Isolated I/O)
// ============================================================================

const withBrowser = async <T>(
  fn: (browser: Browser) => Promise<T>
): Promise<T> => {
  const browser = await chromium.launch({ executablePath: execPath })
  try {
    return await fn(browser)
  } finally {
    await browser.close()
  }
}

const injectFadeOverlay = async (page: Page, clipY: number): Promise<void> => {
  const fadeTop = clipY + FADE_START
  const fadeHeight = MAX_HEIGHT - FADE_START
  const style = buildFadeOverlayStyle(fadeTop, fadeHeight)

  await page.evaluate((css) => {
    const overlay = document.createElement('div')
    overlay.style.cssText = css
    document.body.appendChild(overlay)
  }, style)
}

const tryWrapCodeSnippet = async (page: Page, selector: string): Promise<void> => {
  const codeHandle = page.locator(selector)
  try {
    await codeHandle.waitFor({ state: 'attached', timeout: 3000 })
    await codeHandle.evaluate((el) => el.classList.add('wrap'))
    console.log('Code snippet found and wrapped')
  } catch {
    console.log('No code snippet found')
  }
}

const getElementBox = async (
  page: Page,
  selector: string
): Promise<Result<Box, ScreenshotError>> => {
  const handle = await page.$(selector)
  if (!handle) {
    return err({ type: 'screenshot', message: `Element not found: ${selector}` })
  }
  const box = await handle.boundingBox()
  return fromNullable(box, `Could not get bounding box for: ${selector}`) as Result<Box, ScreenshotError>
}

// ============================================================================
// Core Screenshot Logic
// ============================================================================

export const captureScreenshot = async (
  config: ScreenshotConfig
): Promise<Result<ScreenshotResult, ScreenshotError>> => {
  return withBrowser(async (browser) => {
    const context = await browser.newContext(customDevice)
    const page = await context.newPage()
    await page.goto(config.url, { waitUntil: 'networkidle' })

    await tryWrapCodeSnippet(page, config.codeSelector)

    const boxResult = await getElementBox(page, config.selector)
    if (!boxResult.ok) return boxResult

    const { clip, wasCropped } = computeClip(
      boxResult.value,
      config.padding,
      FADE_START,
      MAX_HEIGHT
    )

    if (wasCropped) {
      await injectFadeOverlay(page, clip.y)
    }

    await page.screenshot({
      path: config.outputPath,
      clip,
      fullPage: true,
    })

    return ok({ pngPath: config.outputPath, wasCropped })
  })
}
