import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Loader } from 'astro/loaders'
import type { ContentEvent, ContentHistory } from './content-history'

type ReadHistory = () => Promise<ContentHistory>

/** Include history in the digest because glob skips parsing cached source files. */
export function withContentHistory(source: Loader, readHistory: ReadHistory): Loader {
  return {
    ...source,
    name: `${source.name}-with-content-history`,
    async load(context) {
      const history = await readHistory()
      const root = fileURLToPath(context.config.root)
      const historyDigest = context.generateDigest(history.updatedByFile)
      await source.load({
        ...context,
        generateDigest: (data) => context.generateDigest({ data, historyDigest }),
        parseData: ({ data, filePath, ...options }) => {
          const file = filePath ? relative(root, filePath).replaceAll('\\', '/') : ''
          return context.parseData({
            ...options,
            filePath,
            data: {
              ...data,
              updated: history.updatedByFile[file] ?? data.updated ?? data.startDate,
            },
          })
        },
      })
    },
  }
}

export function contentEventsLoader(readHistory: ReadHistory): Loader {
  return {
    name: 'content-history-events',
    async load({ store, parseData }) {
      const { events } = await readHistory()
      const entries = await Promise.all(
        events.map(async (event) => {
          const id = `${event.type}-${event.file}-${event.date}`
          return { id, data: await parseData({ id, data: { ...event } }) }
        }),
      )
      store.clear()
      for (const entry of entries) store.set(entry)
    },
  }
}

interface RoutedContent {
  filePath?: string
  id: string
  collection: string
  data: { title: string; publish: boolean }
}

/** Resolve links through Astro's IDs, including custom slugs and nested paths. */
export function resolveContentEvents(
  events: ContentEvent[],
  entries: RoutedContent[],
): ContentEvent[] {
  const byFile = new Map(
    entries.filter((entry) => entry.data.publish).map((entry) => [entry.filePath, entry]),
  )
  return events.flatMap((event) => {
    const entry = byFile.get(event.file)
    return entry
      ? [{ ...event, slug: entry.id, collection: entry.collection, title: entry.data.title }]
      : []
  })
}
