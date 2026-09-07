import { getCollection } from 'astro:content'
export { sortByUpdated, sortByStartDate, getTopics } from './helpers'

export const publishedNotes = await getCollection('notes', ({ data }) => data.publish)
export const draftNotes = await getCollection('notes', ({ data }) => !data.publish)
export const publishedEssays = await getCollection('essays', ({ data }) => data.publish)
export const draftEssays = await getCollection('essays', ({ data }) => !data.publish)
export const publishedTalks = await getCollection('talks', ({ data }) => data.publish)
export const draftTalks = await getCollection('talks', ({ data }) => !data.publish)
export const stream = await getCollection('stream', ({ data }) => data.publish)
export const books = (await getCollection('books', ({ data }) => data.publish)).sort(
  (a, b) => a.data.order - b.data.order,
)

export const allTheContent = [
  publishedNotes,
  draftNotes,
  publishedEssays,
  draftEssays,
  publishedTalks,
  draftTalks,
  stream,
]
