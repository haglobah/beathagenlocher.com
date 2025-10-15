import { getCollection } from 'astro:content'

export async function GET() {
  const notes = await getCollection('notes', ({ data }) => data.publish)
  const essays = await getCollection('essays', ({ data }) => data.publish)
  const talks = await getCollection('talks', ({ data }) => data.publish)
  const stream = await getCollection('stream', ({ data }) => data.publish)

  const allContent = [
    ...notes.map(entry => ({
      id: entry.id,
      type: 'note',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
      topics: entry.data.topics || [],
    })),
    ...essays.map(entry => ({
      id: entry.id,
      type: 'essay',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
      topics: entry.data.topics || [],
    })),
    ...talks.map(entry => ({
      id: entry.id,
      type: 'talk',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
      topics: entry.data.topics || [],
    })),
    ...stream.map(entry => ({
      id: entry.id,
      type: 'stream',
      title: entry.data.title || '',
      description: '',
      url: `/${entry.id}`,
      body: entry.body,
      topics: entry.data.topics || [],
    })),
  ]

  return new Response(JSON.stringify(allContent), {
    headers: { 'Content-Type': 'application/json' },
  })
}
