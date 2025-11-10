import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import { type APIContext } from 'astro'

function stripMarkdown(text: string) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`~]/g, '')
}

function stripMDXComponents(text: string) {
  return text
    .replace(/<([A-Z][A-Za-z]*)[^>]*\/>/g, '')
    .replace(/<([A-Z][A-Za-z]*)[\s\S]*?<\/\1>/g, '')
}

export async function GET(context: APIContext) {
  const notes = await getCollection('notes', ({ data }) => data.publish)
  const essays = await getCollection('essays', ({ data }) => data.publish)
  const talks = await getCollection('talks', ({ data }) => data.publish)
  const stream = await getCollection('stream', ({ data }) => data.publish)

  return rss({
    title: 'Beat Hagenlocher',
    description:
      'A digital garden exploring programming, minimalism and learning',
    site: context.site,
    image: {
      url: 'https://beathagenlocher.com/favicon.svg',
      title: 'beathagenlocher.com',
      link: context.site,
    },
    items: [
      ...notes.map((post) => ({
        title: post.data.title,
        pubDate: post.data.startDate,
        description: post.data.description,
        link: `/${post.id}/`,
      })),
      ...essays.map((post) => ({
        title: post.data.title,
        pubDate: post.data.startDate,
        description: post.data.description,
        link: `/${post.id}/`,
      })),
      ...talks.map((post) => ({
        title: post.data.title,
        pubDate: post.data.startDate,
        description: post.data.description,
        link: `/${post.id}/`,
      })),
      ...stream.map((post) => ({
        title: post.data.title || 'A Streamlet',
        pubDate: post.data.startDate,
        description: stripMarkdown(stripMDXComponents(post.body!)),
        link: `/stream/#${post.id}`,
      })),
    ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf()),
    customData: `<language>en-us</language>`,
  })
}
