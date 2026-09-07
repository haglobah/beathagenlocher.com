import { getCollection } from 'astro:content'
import type { SearchResult } from '../../components/searchMachine'

export async function GET() {
  const notes = await getCollection('notes')
  const essays = await getCollection('essays')
  const talks = await getCollection('talks')
  const stream = await getCollection('stream')
  const books = await getCollection('books')

  const allContent: SearchResult[] = [
    ...[...notes, ...essays, ...talks].map((entry) => ({
      id: entry.id,
      type: { notes: 'note', essays: 'essay', talks: 'talk' }[entry.collection],
      title: entry.data.title,
      description: entry.data.description ?? '',
      url: `/${entry.id}`,
      body: entry.body ?? '',
      topics: entry.data.topics,
      published: entry.data.publish,
    })),
    ...stream.map((entry) => ({
      id: entry.id,
      type: 'stream',
      title: entry.data.title ?? entry.id,
      description: '',
      url: `/stream/#${entry.id}`,
      body: entry.body ?? '',
      topics: entry.data.topics ?? [],
      published: entry.data.publish,
    })),
    ...books.map((entry) => ({
      id: entry.id,
      type: 'book',
      title: entry.data.title,
      description: entry.data.authors.join(', '),
      url: `/${entry.id}`,
      body: entry.body ?? '',
      topics: entry.data.shelves,
      published: entry.data.publish,
    })),
  ]

  return new Response(JSON.stringify(allContent), {
    headers: { 'Content-Type': 'application/json' },
  })
}
