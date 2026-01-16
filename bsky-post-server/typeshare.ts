import { chromium, devices } from 'playwright'

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

const computeClip = (box: Box, padding: Padding) => ({
  x: Math.round(box!.x - padding.left),
  y: Math.round(box!.y - padding.top),
  width: Math.round(box!.width + padding.left + padding.right),
  height: Math.round(box!.height + padding.top + padding.bottom),
})

// TODO (Beat): Fix this, maybe with https://primamateria.github.io/blog/playwright-nixos-webdev/ ?
const execPath =
  '/nix/store/by92qwh4grm99ydkn8d8mk2v7c8ixwy8-playwright-browsers/chromium-1181/chrome-linux/chrome'

export const makeStreamshot = async (streamId: string, padding: Padding) => {
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
  await page.screenshot({
    path: pngPath,
    clip: computeClip(box!, padding),
    fullPage: true,
  })

  await browser.close()

  return pngPath
}

export const makeScreenshot = async (path: string, padding: Padding) => {
  const browser = await chromium.launch({
    executablePath: execPath,
  })
  const context = await browser.newContext({
    ...iPadMini,
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
  await page.screenshot({
    path: pngPath,
    clip: computeClip(box!, padding),
    fullPage: true,
  })

  await browser.close()

  return pngPath
}

// makeStreamshot('00093', { left: 10, top: 10, right: 10, bottom: 10 })
// makeScreenshot('emacs', {left: 30, top: -10, right: 30, bottom: 40})
