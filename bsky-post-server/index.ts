import { Hono } from 'hono'
import { AtpAgent, RichText } from '@atproto/api'
import { inspect, cond, merge, graphemeLength } from './utils'
import { makeStreamshot, makeScreenshot } from './typeshare'

const app = new Hono()
const agent = new AtpAgent({ service: 'https://bsky.social' })

await agent.login({
  identifier: 'beathagenlocher.com',
  password: process.env.BLUESKY_APP_SECRET!,
})

app
  .post('/post', async (c) => {
    const { text, facets } = await c.req.json()

    const rt = new RichText({ text })
    await rt.detectFacets(agent)

    cond(
      graphemeLength(rt.text) <= 300,
      async () => {
        const payload = {
          text: rt.text,
          facets: merge(facets, rt.facets),
        }

        inspect(payload)
        await agent.post(payload)

        return c.json({ success: true })
      },
      () => {
        inspect(rt.text)
        inspect(
          `'s grapheme count is _${graphemeLength(rt.text)}_, and with that over 300 graphemes long.`,
        )
      },
    )
  })
  .post('/post/as-image', async (c) => {
    const { title, text, link } = await c.req.json()

    let pngPath

    if (link.startsWith('stream#')) {
      const streamId = link.replace('stream#', '')
      pngPath = await makeStreamshot(streamId, { left: 10, top: 10, right: 10, bottom: 10 })
    } else {
      pngPath = await makeScreenshot(link, { left: 30, top: -10, right: 30, bottom: 40 })
    }

    console.log(`created screenshot at "${pngPath}"`)
    const file = Bun.file(pngPath)

    const header = await file.slice(0, 24).arrayBuffer()
    const view = new DataView(header)

    const width = view.getUint32(16)
    const height = view.getUint32(20)

    const fileBytes = new Uint8Array(await file.arrayBuffer())
    // const base64 = Buffer.from(arrayBuffer).toString('base64')

    // const dataUrl = `data:${file.type};base64,${base64}`

    const { data } = await agent.uploadBlob(fileBytes, { encoding: file.type })

    await agent.post({
      text: title,
      embed: {
        $type: 'app.bsky.embed.images',
        images: [
          {
            alt: text,
            image: data.blob,
            aspectRatio: { width, height },
          },
        ],
      },
    })
  })

export default {
  port: 3000,
  fetch: app.fetch,
}
