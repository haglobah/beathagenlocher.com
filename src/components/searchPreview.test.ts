import { expect, test } from 'bun:test'
import { parseHTML } from 'linkedom'
import { previewMetadata } from './searchPreview'
import { parseSearchIndex } from './searchMachine'

const content = {
  id: 'note',
  type: 'note',
  title: 'Note',
  description: '',
  url: '/note',
  body: '',
  topics: [],
  published: true,
  startDate: '2025-01-02T00:00:00.000Z',
  updated: '2025-02-03T00:00:00.000Z',
  readingMinutes: 5,
}

test('preview shows dates and written duration with labels on hover', () => {
  const { document } = parseHTML('<html><body></body></html>')
  document.body.append(previewMetadata(document, content))
  const dates = [...document.querySelectorAll('time')]
  expect(dates.map((time) => time.getAttribute('datetime'))).toEqual([
    content.startDate,
    content.updated,
  ])
  expect(dates.map((time) => time.title)).toEqual(['Created', 'Updated'])
  expect(document.body.textContent).not.toContain('Created')
  expect(document.body.textContent).not.toContain('Updated')
  expect(document.querySelector('[title="Reading time"]')?.textContent).toBe('5 min')
  expect(document.querySelector('[role="img"]')).toBeNull()
})

test('preview omits metadata that the content does not provide', () => {
  const { document } = parseHTML('<html><body></body></html>')
  document.body.append(
    previewMetadata(document, { ...content, updated: undefined, readingMinutes: undefined }),
  )
  expect(document.querySelectorAll('time')).toHaveLength(1)
  expect(document.body.textContent).not.toContain('Updated')
  expect(document.querySelector('[role="img"]')).toBeNull()
})

test('search index rejects invalid metadata before rendering', () => {
  expect(parseSearchIndex([content]).t).toBe('Parsed')
  for (const metadata of [
    { startDate: 'invalid' },
    { updated: 42 },
    { readingMinutes: -1 },
    { readingMinutes: '5' },
  ]) {
    expect(parseSearchIndex([{ ...content, ...metadata }]).t).toBe('Invalid')
  }
})

test('different dates use an unspaced en dash and a pipe before duration', () => {
  const { document } = parseHTML('<html><body></body></html>')
  const metadata = previewMetadata(document, content)
  const dates = metadata.querySelectorAll('time')
  expect(metadata.textContent).toBe(`${dates[0].textContent}–${dates[1].textContent} | 5 min`)
})

test('matching displayed dates appear once with both hover labels', () => {
  const { document } = parseHTML('<html><body></body></html>')
  const metadata = previewMetadata(document, { ...content, updated: content.startDate })
  expect(metadata.querySelectorAll('time')).toHaveLength(1)
  const date = metadata.querySelector('time')!
  expect(date.title).toBe('Created and updated')
  expect(metadata.textContent).toBe(`${date.textContent} | 5 min`)
})

test('duration without dates has no leading separator', () => {
  const { document } = parseHTML('<html><body></body></html>')
  const metadata = previewMetadata(document, {
    ...content,
    startDate: undefined,
    updated: undefined,
  })
  expect(metadata.textContent).toBe('5 min')
})
