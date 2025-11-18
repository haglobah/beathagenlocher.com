import { Hono } from 'hono'
import { AtpAgent, RichText } from '@atproto/api'
import { inspect, cond, merge, graphemeLength } from './utils'

const app = new Hono()
const agent = new AtpAgent({ service: 'https://bsky.social' })

await agent.login({
  identifier: 'beathagenlocher.com',
  password: process.env.BLUESKY_APP_SECRET!,
})

app.post('/post', async (c) => {
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

export default {
  port: 3000,
  fetch: app.fetch,
}
