import { Hono, type Context } from 'hono'
import { AtpAgent, RichText } from '@atproto/api'
import { inspect, cond, merge, graphemeLength, getFileDimensions } from './utils'
import { makeStreamshot, makeScreenshot } from './typeshare'
import { slug } from 'github-slugger'

const app = new Hono()
const agent = new AtpAgent({ service: 'https://bsky.social' })

await agent.login({
  identifier: 'beathagenlocher.com',
  password: process.env.BLUESKY_APP_SECRET!,
})

const postImage = async (pngPath: string, text: string, alttext: string) => {
  const file = Bun.file(pngPath)
  const { width, height } = await getFileDimensions(file)
  const fileBytes = new Uint8Array(await file.arrayBuffer())

  const { data } = await agent.uploadBlob(fileBytes, { encoding: file.type })

  const rt = new RichText({ text })
  await rt.detectFacets(agent)
  const resp = await agent.post({
    text: rt.text,
    facets: rt.facets,
    embed: {
      $type: 'app.bsky.embed.images',
      images: [
        {
          alt: alttext,
          image: data.blob,
          aspectRatio: { width, height },
        },
      ],
    },
  })
  return resp
}

const postLinkResponse = async (c: Context, resp: { uri: string; cid: string }, text: string, link: string) => {
  if (resp.uri !== undefined) {
    const success1 = `Successfully posted image with text "${text}" to Bluesky (URI: ${resp.uri})`
    console.log(success1)

    const weblink = `https://beathagenlocher.com/${link}`

    const rt = new RichText({ text: `Originally posted at ${weblink}` })
    await rt.detectFacets(agent)
    const r2 = await agent.post({
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      reply: {
        root: { uri: resp.uri, cid: resp.cid },
        parent: { uri: resp.uri, cid: resp.cid },
      },
    })
    if (r2.uri !== undefined) {
      const success2 = `Successfully posted reply to image to Bluesky (URI: ${r2.uri})`
      console.log(success2)
      return c.json({ success: true, message: success1 + '\n' + success2 })
    } else {
      const errorMessage = `Failed to post reply with link ${link} to image with text "${text}" to Bluesky`
      console.error(errorMessage)
      return c.json({ success: false, message: errorMessage }, 400)
    }
  } else {
    const errorMessage = `Failed to post image with text "${text}" to Bluesky`
    console.error(errorMessage)
    return c.json({ success: false, message: errorMessage }, 400)
  }
}

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
    const { text, alttext, link } = await c.req.json()

    let pngPath

    if (link.startsWith('stream#')) {
      const streamId = link.replace('stream#', '')
      pngPath = await makeStreamshot(streamId, { left: 10, top: 10, right: 10, bottom: 10 })
      console.log(`created screenshot for "${link}" at "${pngPath}"`)
      const resp = await postImage(pngPath, text, alttext)
      return postLinkResponse(c, resp, text, link)
    } else {
      const slugLink = slug(link)
      pngPath = await makeScreenshot(slugLink, { left: 30, top: -10, right: 30, bottom: 40 })
      console.log(`created screenshot for "${slugLink}" at "${pngPath}"`)
      const resp = await postImage(pngPath, text, alttext)
      return postLinkResponse(c, resp, text, slugLink)
    }
  })

export default {
  port: 3000,
  fetch: app.fetch,
}
