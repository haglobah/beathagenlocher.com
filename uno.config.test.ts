import { expect, test } from 'bun:test'
import { createGenerator } from 'unocss'
import config from './uno.config'

// Icons are often rendered as empty <span>s inside links. An inline span ignores
// width/height, so without a block-level display the icon collapses to 0×0.
test('icon utilities render with a box that honours width and height', async () => {
  const uno = await createGenerator(config)
  const { css } = await uno.generate('<span class="i-carbon:logo-github"></span>', {
    preflights: false,
  })
  expect(css).toContain('display:inline-block')
})
