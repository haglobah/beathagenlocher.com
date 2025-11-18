import { getCollection } from 'astro:content'

export async function GET() {
  const notes = await getCollection('notes')
  const essays = await getCollection('essays')
  const talks = await getCollection('talks')
  const stream = await getCollection('stream')

  const allContent = [
    ...notes.map(entry => ({
      id: entry.id,
      type: 'note',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
      topics: entry.data.topics || [],
      published: entry.data.publish ?? true,
    })),
    ...essays.map(entry => ({
      id: entry.id,
      type: 'essay',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
      topics: entry.data.topics || [],
      published: entry.data.publish ?? true,
    })),
    ...talks.map(entry => ({
      id: entry.id,
      type: 'talk',
      title: entry.data.title,
      description: entry.data.description || '',
      url: `/${entry.id}`,
      body: entry.body,
      topics: entry.data.topics || [],
      published: entry.data.publish ?? true,
    })),
    ...stream.map(entry => ({
      id: entry.id,
      type: 'stream',
      title: entry.data.title,
      url: `/stream/#${entry.id}`,
      body: entry.body,
      topics: entry.data.topics || [],
      published: entry.data.publish ?? true,
    })),
  ]

  return new Response(JSON.stringify(allContent), {
    headers: { 'Content-Type': 'application/json' },
  })
}
