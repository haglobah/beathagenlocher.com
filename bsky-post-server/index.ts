import { Hono } from 'hono'
import { AtpAgent, RichText } from '@atproto/api'
import * as util from 'util'

const app = new Hono()
const agent = new AtpAgent({ service: 'https://bsky.social' })

const inspect = <T>(thing: T) => {
  console.log(util.inspect(thing, false, null, true))
  return thing
}

const merge = <T>(a: T[] | undefined, b: T[] | undefined) => {
  if (a === undefined && b === undefined) {
    return []
  } else if (a === undefined) {
    return b
  } else if (b === undefined) {
    return a
  } else {
    return a.concat(b)
  }
}

await agent.login({
  identifier: 'beathagenlocher.com',
  password: process.env.BLUESKY_APP_SECRET!,
})

app.post('/post', async (c) => {
  const { text, facets } = await c.req.json()

  const rt = new RichText({ text })
  await rt.detectFacets(agent)

  inspect(merge(facets, rt.facets))
  inspect(rt.facets)

  const payload = {
    text: rt.text,
    facets: merge(facets, rt.facets),
  }

  inspect(payload)
  // await agent.post(payload);

  return c.json({ success: true })
})

export default {
  port: 3000,
  fetch: app.fetch,
}
