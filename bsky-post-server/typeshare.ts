import { chromium, devices, type Page } from 'playwright'

const iPhone = devices['iPhone 15']
const iPadMini = devices['iPad Mini']

type ViewportSize = {
  width: number;
  height: number;
}

type DeviceDescriptor = {
  viewport: ViewportSize;
  userAgent: string;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  defaultBrowserType: 'chromium' | 'firefox' | 'webkit';
};

const customDevice: DeviceDescriptor = {
  userAgent: 'Mozilla/5.0',
  viewport: {width: 600, height: 1500 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  defaultBrowserType: 'webkit'
}

type Box = { x: number; y: number; width: number; height: number }
type Padding = { top: number; right: number; bottom: number; left: number }

// Height thresholds in logical pixels (before deviceScaleFactor)
const FADE_START = 800   // Where the fade begins
const MAX_HEIGHT = 1000  // Full max height including 200px fade zone

const computeClip = (box: Box, padding: Padding, fadeStart?: number, maxHeight?: number) => {
  const fullHeight = Math.round(box!.height + padding.top + padding.bottom)
  const clippedHeight = maxHeight ? Math.min(fullHeight, maxHeight) : fullHeight
  const wasCropped = fadeStart ? fullHeight > fadeStart : false

  return {
    clip: {
      x: Math.round(box!.x - padding.left),
      y: Math.round(box!.y - padding.top),
      width: Math.round(box!.width + padding.left + padding.right),
      height: clippedHeight,
    },
    wasCropped,
  }
}

// TODO (Beat): Fix this, maybe with https://primamateria.github.io/blog/playwright-nixos-webdev/ ?
const execPath =
  '/nix/store/by92qwh4grm99ydkn8d8mk2v7c8ixwy8-playwright-browsers/chromium-1181/chrome-linux/chrome'

const injectFadeOverlay = async (page: Page, clipY: number) => {
  const fadeTop = clipY + FADE_START
  const fadeHeight = MAX_HEIGHT - FADE_START
  await page.evaluate(({ top, height }) => {
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: absolute;
      top: ${top}px;
      left: 0;
      right: 0;
      height: ${height}px;
      background: linear-gradient(to bottom, transparent, gray);
      pointer-events: none;
      z-index: 9999;
    `
    document.body.appendChild(overlay)
  }, { top: fadeTop, height: fadeHeight })
}

export type ScreenshotResult = { pngPath: string; wasCropped: boolean }

export const makeStreamshot = async (streamId: string, padding: Padding): Promise<ScreenshotResult> => {
  const browser = await chromium.launch({
    executablePath: execPath,
  })
  const context = await browser.newContext({
    ...customDevice,
  })
  const page = await context.newPage()
  await page.goto('http://localhost:4321/stream', { waitUntil: 'networkidle' })

  const handle = await page.$(`[id="${streamId}"]`)
  const codeHandle = page.locator(`[id="${streamId}"] .expressive-code .frame pre`)
  try {
    await codeHandle.waitFor({ state: 'attached', timeout: 3000 })
    await codeHandle.evaluate((el) => el.classList.add('wrap'))
    console.log('Code snippet found and wrapped')
  } catch (e) {
    console.log('No code snippet found')
  }
  const box = await handle!.boundingBox()
  const pngPath = `screenshots/stream/${streamId}.png`
  const { clip, wasCropped } = computeClip(box!, padding, FADE_START, MAX_HEIGHT)

  if (wasCropped) {
    await injectFadeOverlay(page, clip.y)
  }

  await page.screenshot({
    path: pngPath,
    clip,
    fullPage: true,
  })

  await browser.close()

  return { pngPath, wasCropped }
}

export const makeScreenshot = async (path: string, padding: Padding): Promise<ScreenshotResult> => {
  const browser = await chromium.launch({
    executablePath: execPath,
  })
  const context = await browser.newContext({
    ...customDevice,
  })
  const page = await context.newPage()
  await page.goto(`http://localhost:4321/${path}`, { waitUntil: 'networkidle' })

  const handle = await page.$(`.post`)
  const codeHandle = page.locator(`.expressive-code .frame pre`)
  try {
    await codeHandle.waitFor({ state: 'attached', timeout: 3000 })
    await codeHandle.evaluate((el) => el.classList.add('wrap'))
    console.log('Code snippet found and wrapped')
  } catch (e) {
    console.log('No code snippet found')
  }
  const box = await handle!.boundingBox()
  const pngPath = `screenshots/${path}.png`
  const { clip, wasCropped } = computeClip(box!, padding, FADE_START, MAX_HEIGHT)

  if (wasCropped) {
    await injectFadeOverlay(page, clip.y)
  }

  await page.screenshot({
    path: pngPath,
    clip,
    fullPage: true,
  })

  await browser.close()

  return { pngPath, wasCropped }
}

// makeStreamshot('00093', { left: 10, top: 10, right: 10, bottom: 10 })
// makeScreenshot('emacs', {left: 30, top: -10, right: 30, bottom: 40})
