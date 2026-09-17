import { expect, test } from 'bun:test'
import type { Loader, LoaderContext } from 'astro/loaders'
import { withContentHistory, resolveContentEvents } from './content-history-loader'

const file = 'src/content/notes/Example.mdx'
test('history invalidates a cached source digest and supplies effective dates before validation', async () => {
  let updated = '2026-01-01T00:00:00.000Z'
  let cachedDigest = ''
  let parsed: Record<string, unknown> = {}
  let parseCount = 0
  const source: Loader = {
    name: 'cached-source',
    async load(context) {
      const digest = context.generateDigest('unchanged source')
      if (digest === cachedDigest) return
      parsed = await context.parseData({
        id: 'example',
        filePath: `/repo/${file}`,
        data: { startDate: '2020-01-01' },
      })
      cachedDigest = digest
    },
  }
  const loader = withContentHistory(source, async () => ({
    updatedByFile: { [file]: updated },
    events: [],
  }))
  const context = {
    config: { root: new URL('file:///repo/') },
    generateDigest: JSON.stringify,
    async parseData({ data }: { data: Record<string, unknown> }) {
      parseCount++
      expect(data.updated).toBeDefined()
      return data
    },
  } as unknown as LoaderContext
  await loader.load(context)
  expect(parsed.updated).toBe(updated)
  await loader.load(context)
  expect(parseCount).toBe(1)
  updated = '2026-02-01T00:00:00.000Z'
  await loader.load(context)
  expect(parsed.updated).toBe(updated)
  expect(parseCount).toBe(2)
})

test('uncommitted new content falls back to frontmatter updated or startDate', async () => {
  const values: unknown[] = []
  const source: Loader = {
    name: 'source',
    async load(context) {
      for (const data of [
        { updated: '2022-01-01', startDate: '2020-01-01' },
        { startDate: '2020-01-01' },
      ]) {
        await context.parseData({ id: 'example', filePath: `/repo/${file}`, data })
      }
    },
  }
  await withContentHistory(source, async () => ({ updatedByFile: {}, events: [] })).load({
    config: { root: new URL('file:///repo/') },
    generateDigest: JSON.stringify,
    async parseData({ data }: { data: Record<string, unknown> }) {
      values.push(data.updated)
      return data
    },
  } as unknown as LoaderContext)
  expect(values).toEqual(['2022-01-01', '2020-01-01'])
})

test('stream uses actual collection routes and excludes missing or unpublished entries', () => {
  const event = {
    file,
    slug: 'wrong',
    title: 'Old title',
    collection: 'notes',
    type: 'new' as const,
    date: '2026-01-01',
    commitHash: 'abc',
  }
  expect(
    resolveContentEvents(
      [event],
      [
        {
          filePath: file,
          id: 'custom/slug',
          collection: 'notes',
          data: { title: 'Current title', publish: true },
        },
      ],
    ),
  ).toEqual([{ ...event, slug: 'custom/slug', title: 'Current title' }])
  expect(resolveContentEvents([event], [])).toEqual([])
  expect(
    resolveContentEvents(
      [event],
      [
        {
          filePath: file,
          id: 'example',
          collection: 'notes',
          data: { title: 'Draft', publish: false },
        },
      ],
    ),
  ).toEqual([])
})
