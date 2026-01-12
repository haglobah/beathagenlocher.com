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

    return cond(
      graphemeLength(rt.text) <= 300,
      async () => {
        const payload = {
          text: rt.text,
          facets: merge(facets, rt.facets),
        }

        inspect(payload)
        await agent.post(payload)

        const successMessage = `Successfully posted text to Bluesky`
        console.log(successMessage)
        return c.json({ success: true, message: successMessage })
      },
      () => {
        const errorMessage = `Text is too long: ${graphemeLength(rt.text)} graphemes (max 300)`
        console.error(errorMessage)
        inspect(rt.text)
        return c.json({ success: false, message: errorMessage }, 400)
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

    const resp = await agent.post({
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

    if (resp.uri !== undefined) {
      const successMessage = `Successfully posted image with title "${title}" to Bluesky (URI: ${resp.uri})`
      console.log(successMessage)
      return c.json({ success: true, message: successMessage })
    } else {
      const errorMessage = `Failed to post image with title "${title}" to Bluesky`
      console.error(errorMessage)
      return c.json({ success: false, message: errorMessage }, 400)
    }
  })

export default {
  port: 3000,
  fetch: app.fetch,
}
