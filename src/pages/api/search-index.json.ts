import { getCollection } from 'astro:content'

export async function GET() {
  const notes = await getCollection('notes', ({ data }) => data.publish)
  const essays = await getCollection('essays', ({ data }) => data.publish)
  const talks = await getCollection('talks', ({ data }) => data.publish)
  const stream = await getCollection('stream', ({ data }) => data.publish)

  const allContent = [
    ...notes.map(entry => ({
      id: entry.slug,
      type: 'note',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
    })),
    ...essays.map(entry => ({
      id: entry.slug,
      type: 'essay',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
    })),
    ...talks.map(entry => ({
      id: entry.slug,
      type: 'talk',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
    })),
    ...stream.map(entry => ({
      id: entry.slug,
      type: 'stream',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
    })),
  ]

  return new Response(JSON.stringify(allContent), {
    headers: { 'Content-Type': 'application/json' },
  })
}
