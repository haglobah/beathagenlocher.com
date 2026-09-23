// Run with: node scripts/check-footnotes.mjs
import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const fixtureName = `footnote-check-fixture-${process.pid}`
const fixture = new URL(`../src/pages/${fixtureName}.mdx`, import.meta.url)
const port = 14330
let browser
let server
let logs = ''
let fixtureCreated = false
try {
  await writeFile(
    fixture,
    `---\nlayout: ../layouts/Layout.astro\n---\nimport { components as shared } from '../components/mdxcomponents'\nexport const components = shared\n\nA footnote.[^note] Another reference.[^note]\n\n[External link](https://example.com)\n\n<div style={{height: '120vh'}} />\n\n[^note]: A **formatted** footnote with [a source](https://example.com).\n`,
    { flag: 'wx' },
  )
  fixtureCreated = true
  server = spawn(
    'node',
    [
      '--input-type=module',
      '-e',
      `import { dev } from 'astro'; await dev({server:{port:${port}}})`,
    ],
    { env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  server.stdout.on('data', (data) => {
    logs += data
  })
  server.stderr.on('data', (data) => {
    logs += data
  })
  const url = `http://localhost:${port}/${fixtureName}`
  let ready = false
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(logs)
    try {
      if ((await fetch(url)).ok) {
        ready = true
        break
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  assert.ok(ready, logs)
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true,
  })
  const page = await browser.newPage()
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort(),
  )
  await page.goto(url)
  await writeFile('/tmp/footnote-rendered.html', await page.content())
  const ref = page.locator('[data-footnote-ref]').first()
  await ref.waitFor({ state: 'visible' })
  assert.equal(await ref.count(), 1, 'Footnote reference attributes must survive MDX rendering')
  assert.equal(await ref.getAttribute('target'), null)
  assert.equal(await ref.locator('span').count(), 0, 'Footnotes must not show external-link arrows')
  assert.equal(
    await page.locator('[data-footnotes] .commentable-par').count(),
    1,
    'Each footnote item retains one comment wrapper',
  )
  assert.equal(await page.locator('[data-footnotes] .comment-trigger').count(), 1)
  assert.equal(
    await page.locator('[data-footnotes] .commentable-par .commentable-par').count(),
    0,
    'Footnotes must not nest comment wrappers',
  )
  const itemBounds = await page.locator('[data-footnotes] li').first().boundingBox()
  const paragraphBounds = await page.locator('[data-footnotes] li p').first().boundingBox()
  assert.ok(
    Math.abs(itemBounds.y - paragraphBounds.y) < 2,
    'Footnote text starts on the same line as its number',
  )
  await page.locator('[data-footnotes]').screenshot({ path: '/tmp/footnotes-section.png' })
  const href = await ref.getAttribute('href')
  assert.equal(
    await page.locator(href).count(),
    1,
    'Footnote target ID must survive list rendering',
  )
  assert.equal(await page.locator('#footnote-label').count(), 1)
  const heading = page.locator('h2#footnote-label')
  assert.ok(await heading.isVisible(), 'The footnote section heading is visible')
  assert.match(await heading.getAttribute('class'), /font-headline/)
  assert.doesNotMatch(await heading.getAttribute('class'), /\bsr-only\b/)
  assert.equal(await heading.locator('a[href="#footnote-label"]').count(), 1)
  const external = page.getByRole('link', { name: 'External link', exact: true })
  assert.equal(await external.getAttribute('target'), '_blank')
  assert.equal(await external.getAttribute('rel'), 'noreferrer')
  assert.equal(await external.locator('span').count(), 2)
  const secondRef = page.locator('[data-footnote-ref]').nth(1)
  const secondPreview = page.locator('.footnote-preview').nth(1)
  await ref.focus()
  await secondRef.hover()
  assert.equal(
    await page.locator('.footnote-preview:visible').count(),
    2,
    'Focused and hovered references have independent previews',
  )
  await page.mouse.move(0, 0)
  await page.waitForTimeout(250)
  assert.ok(
    await page.locator('.footnote-preview').first().isVisible(),
    'Focus retains the first preview after pointer departure',
  )
  assert.ok(!(await secondPreview.isVisible()), 'Unfocused preview closes after pointer departure')
  await page.locator('.footnote-preview').first().getByRole('link').first().focus()
  await page.keyboard.press('Escape')
  assert.ok(
    await ref.evaluate((el) => el === document.activeElement),
    'Escape from preview content restores reference focus',
  )
  assert.equal(
    await page.locator('.footnote-preview:visible').count(),
    0,
    'Restoring focus must not reopen the dismissed preview',
  )
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  assert.equal(await page.locator('.footnote-preview:visible').count(), 0)
  await ref.evaluate((el) => el.blur())
  await ref.hover()
  const preview = page.locator('.footnote-preview').first()
  await preview.waitFor({ state: 'visible' })
  assert.match(await preview.textContent(), /formatted/)
  assert.equal(await preview.locator('strong').count(), 1)
  assert.equal(await preview.locator('[id], [data-footnote-backref], button').count(), 0)
  await preview.hover()
  await page.waitForTimeout(250)
  assert.ok(await preview.isVisible(), 'Preview remains hoverable')
  await page.keyboard.press('Escape')
  assert.ok(!(await preview.isVisible()))
  await ref.focus()
  await preview.waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await ref.click()
  assert.equal(new URL(page.url()).hash, href)
  assert.equal(page.context().pages().length, 1)
  await page.locator('[data-footnote-backref]').first().click()
  assert.equal(new URL(page.url()).hash, '#' + (await ref.getAttribute('id')))
  await page.setViewportSize({ width: 375, height: 667 })
  await ref.hover()
  await preview.waitFor({ state: 'visible' })
  const bounds = await preview.boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375)
  await page.screenshot({ path: '/tmp/footnote-preview.png' })
  console.log(
    'Footnote navigation, previews, keyboard dismissal, narrow viewport, and ordinary outer links passed.',
  )
} finally {
  await browser?.close()
  server?.kill()
  if (fixtureCreated) await unlink(fixture)
}
