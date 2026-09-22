// Run with: node scripts/check-comment-markup.mjs
import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const fixture = new URL('../src/pages/comment-markup-fixture.mdx', import.meta.url)
let browser, server
let created = false
let logs = ''
try {
  await writeFile(fixture, `---\nlayout: ../layouts/Layout.astro\n---\nimport { components as shared } from '../components/mdxcomponents'\nexport const components = shared\nimport Il from '../components/InnerLink.astro'\nimport Spoiler from '../components/Spoiler.astro'\n\nStandalone paragraph.\n\n<Il href="me">\n  Multiline label\n</Il>\n\n<Spoiler>\n\nSpoiler paragraph.\n\n</Spoiler>\n\n\`\`\`js showLineNumbers\nconst first = 1\nconst second = 2\n\`\`\`\n\n- Tight first\n- Tight parent\n  - Nested child\n\n3. Loose first paragraph.\n\n   Second paragraph of first item.\n\n4. Loose second item.\n\n- [ ] Task item\n\nA footnote.[^note]\n\n[^note]: Footnote text.\n`, { flag: 'wx' })
  created = true
  server = spawn('node', ['--input-type=module', '-e', "import { dev } from 'astro'; await dev({server:{port:14331}})"], { env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', data => { logs += data })
  server.stderr.on('data', data => { logs += data })
  const url = 'http://localhost:14331/comment-markup-fixture'
  let ready = false
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(logs)
    try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.ok(ready, logs)
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(), headless: true })
  const page = await browser.newPage()
  await page.route('**/*', route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort())
  await page.goto(url)
  await writeFile('/tmp/comment-fixture.html', await page.content())
  assert.equal(await page.locator('span > p, span > div, p > div, sup > div').count(), 0, 'Inline elements must not contain block content, including footnote previews')
  assert.equal(await page.locator('.commentable-par > ul, .commentable-par > ol').count(), 0, 'Lists do not own comment wrappers')
  const items = page.locator('li')
  assert.equal(await items.count(), 7)
  for (const item of await items.all()) {
    assert.equal(await item.locator(':scope > .commentable-par').count(), 1, 'Each item owns one comment wrapper')
    assert.equal(await item.evaluate(li => [...li.querySelectorAll('.comment-trigger')].filter(button => button.closest('li') === li).length), 1, 'Paragraphs within an item do not add controls')
  }
  assert.equal(await page.locator('ol[start="3"]').count(), 1)
  const first = items.first()
  await first.hover()
  await first.locator('.comment-trigger').click()
  await first.locator('textarea').waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  const nested = page.locator('li li').first()
  await nested.hover()
  await nested.locator('.comment-trigger').click()
  await nested.locator('textarea').waitFor({ state: 'visible' })
  assert.equal(await page.locator('textarea').count(), 1)
  let posted
  await page.route('**/comment', async route => {
    posted = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await nested.locator('textarea').fill('Nested feedback')
  await nested.getByRole('button', { name: 'Send', exact: true }).click()
  await nested.getByText('Sent!', { exact: true }).waitFor()
  assert.equal(posted.paragraphText, 'Nested child')
  assert.equal(posted.paragraphId, await nested.locator(':scope > .commentable-par').getAttribute('id'))
  const lines = page.locator('pre .ec-line')
  assert.equal(await lines.count(), 2)
  const firstLine = await lines.nth(0).boundingBox()
  const secondLine = await lines.nth(1).boundingBox()
  assert.ok(secondLine.y > firstLine.y, 'Code lines retain their grid layout')
  assert.equal(await page.locator('pre div').count(), 0)
  await page.getByText('Show spoiler', { exact: true }).click()
  assert.ok(await page.getByText('Spoiler paragraph.', { exact: true }).isVisible())
  console.log('Valid paragraph markup and per-item comments passed for tight, loose, nested, task, and footnote lists.')
} finally {
  await browser?.close()
  server?.kill()
  if (created) await unlink(fixture)
}
