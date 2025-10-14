import { getCollection } from 'astro:content'
import _ from 'lodash'

export const publishedNotes = await getCollection(
  'notes',
  ({ data }) => data.publish,
)
export const draftNotes = await getCollection(
  'notes',
  ({ data }) => !data.publish,
)
export const publishedKnowledge = await getCollection(
  'knowledge',
  ({ data }) => data.publish,
)
export const draftKnowledge = await getCollection(
  'knowledge',
  ({ data }) => !data.publish,
)
export const publishedEssays = await getCollection(
  'essays',
  ({ data }) => data.publish,
)
export const draftEssays = await getCollection(
  'essays',
  ({ data }) => !data.publish,
)
export const publishedTalks = await getCollection(
  'talks',
  ({ data }) => data.publish,
)
export const draftTalks = await getCollection(
  'talks',
  ({ data }) => !data.publish,
)
export const stream = await getCollection('stream', ({ data }) => data.publish)

export const allTheContent = [
  publishedNotes,
  draftNotes,
  publishedKnowledge,
  draftKnowledge,
  publishedEssays,
  draftEssays,
  publishedTalks,
  draftTalks,
  stream,
]

// Sort notes by date
export const sortByUpdated = (notes) =>
  notes.sort(
    (a, b) =>
      new Date(b.data.updated).getTime() - new Date(a.data.updated).getTime(),
  )
export const sortByStartDate = (notes) =>
  notes.sort(
    (a, b) =>
      new Date(b.data.startDate).getTime() -
      new Date(a.data.startDate).getTime(),
  )

export const getTopics = (collections) => {
  return Object.entries(
    _.countBy(
      collections.flatMap((collection) =>
        collection.flatMap(({ data }) => data.topics),
      ),
    ),
  )
}
