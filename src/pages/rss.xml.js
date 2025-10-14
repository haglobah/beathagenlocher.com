import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'

function stripMarkdown(text) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`~]/g, '')
}

function stripMDXComponents(text) {
  return text
    .replace(/<([A-Z][A-Za-z]*)[^>]*\/>/g, '')
    .replace(/<([A-Z][A-Za-z]*)[\s\S]*?<\/\1>/g, '')
}

export async function GET(context) {
  const notes = await getCollection('notes', ({ data }) => data.publish)
  const essays = await getCollection('essays', ({ data }) => data.publish)
  const talks = await getCollection('talks', ({ data }) => data.publish)
  const stream = await getCollection('stream', ({ data }) => data.publish)

  return rss({
    title: 'Beat Hagenlocher',
    description:
      'A digital garden exploring programming, minimalism and learning',
    site: context.site,
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
        title: post.data.title || ' ',
        pubDate: post.data.startDate,
        description: post.data.description || 'A streamlet',
        link: `/stream/#${post.id}`,
      })),
    ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf()),
    customData: `<language>en-us</language>`,
  })
}
