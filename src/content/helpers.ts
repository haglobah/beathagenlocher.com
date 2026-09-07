/** Return newest entries first without changing the shared collection. */
export const sortByUpdated = <T extends { data: { updated: Date } }>(entries: readonly T[]): T[] =>
  [...entries].sort((a, b) => b.data.updated.getTime() - a.data.updated.getTime())

export const sortByStartDate = <T extends { data: { startDate: Date } }>(
  entries: readonly T[],
): T[] => [...entries].sort((a, b) => b.data.startDate.getTime() - a.data.startDate.getTime())

export type TopicCount = readonly [topic: string, count: number]

type WithTopics = { data: { topics?: readonly string[] } }

export const getTopics = (collections: readonly (readonly WithTopics[])[]): TopicCount[] => {
  const counts = new Map<string, number>()
  for (const collection of collections) {
    for (const { data } of collection) {
      for (const topic of data.topics ?? []) {
        counts.set(topic, (counts.get(topic) ?? 0) + 1)
      }
    }
  }
  return [...counts]
}
