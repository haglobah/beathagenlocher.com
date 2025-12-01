import { chromium, devices } from 'playwright'

const iPhone = devices['iPhone 15']

type Box = {x: number, y: number, width: number, height: number}
type Padding = {top: number, right: number, bottom: number, left: number}

const computeClip = (box: Box, padding: Padding) => ({
      x: Math.round(box!.x - padding.left),
      y: Math.round(box!.y - padding.top),
      width: Math.round(box!.width + padding.left + padding.right),
      height: Math.round(box!.height + padding.top + padding.bottom),
})

export const makeStreamshot = async (streamId: number, padding: Padding) => {
  const browser = await chromium.launch({
    executablePath:
      '/nix/store/by92qwh4grm99ydkn8d8mk2v7c8ixwy8-playwright-browsers/chromium-1181/chrome-linux/chrome',
  })
  const context = await browser.newContext({
    ...iPhone,
  })
  const page = await context.newPage()
  await page.goto('http://localhost:4321/stream', { waitUntil: 'networkidle' })

  const handle = await page.$(`[id="${streamId}"]`)
  const box = await handle!.boundingBox()
  await page.screenshot({
    path: `stream/${streamId}.png`,
    clip: computeClip(box!, padding),
    fullPage: true
  })

  await browser.close()
}

export const makeScreenshot = async (path: string, padding: Padding) => {
  const browser = await chromium.launch({
    executablePath:
      '/nix/store/by92qwh4grm99ydkn8d8mk2v7c8ixwy8-playwright-browsers/chromium-1181/chrome-linux/chrome',
  })
  const context = await browser.newContext({
    ...iPhone,
  })
  const page = await context.newPage()
  await page.goto(`http://localhost:4321/${path}`, { waitUntil: 'networkidle' })

  const handle = await page.$(`.post`)
  const box = await handle!.boundingBox()
  await page.screenshot({
    path: `${path}.png`,
    clip: computeClip(box!, padding),
    fullPage: true
  })

  await browser.close()
}

// makeStreamshot(91, 10)
// makeScreenshot('emacs', {left: 30, top: -10, right: 30, bottom: 40})

