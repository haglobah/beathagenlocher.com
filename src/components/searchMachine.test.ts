import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import {
  initialState,
  update,
  parseSearchIndex,
  highlightMatches,
  type State,
  type Msg,
} from './searchMachine'

const result = {
  id: 'a',
  type: 'note',
  title: 'A',
  description: '',
  url: '/a',
  body: '',
  topics: ['web'],
  published: false,
}

describe('search transitions', () => {
  test('opening loads once and completion refreshes the current query', () => {
    const [loading, cmds] = update(initialState(), { t: 'Open', query: 'first' })
    expect(cmds.filter((c) => c.t === 'Load')).toHaveLength(1)
    expect(update(loading, { t: 'Open', query: 'second' })[1].some((c) => c.t === 'Load')).toBe(
      false,
    )
    const [typing] = update(loading, { t: 'Query', query: 'latest' })
    const [ready, effects] = update(typing, { t: 'Loaded', items: [result] })
    expect(ready.load.t).toBe('Ready')
    expect(effects).toEqual([{ t: 'Search', query: 'latest' }])
  })
  test('failure is retryable and closing during loading stays closed', () => {
    const [loading] = update(initialState(), { t: 'Open', query: '' })
    const [failed] = update(loading, { t: 'LoadFailed', reason: 'offline' })
    expect(update(failed, { t: 'Retry' })[1]).toEqual([{ t: 'Load' }])
    const [closed] = update(loading, { t: 'Close' })
    expect(update(closed, { t: 'Loaded', items: [result] })[0].view.t).toBe('Closed')
  })
  test('empty topics cannot activate a previous result', () => {
    let [state] = update(initialState(), { t: 'Open', query: '' })
    ;[state] = update(state, { t: 'Matches', query: '', items: [{ t: 'Content', item: result }] })
    ;[state] = update(state, { t: 'Query', query: '#missing' })
    expect(update(state, { t: 'Activate' })[1]).toEqual([])
  })
  test('arbitrary interactions preserve bounded selection and serializable state', () => {
    const msg: fc.Arbitrary<Msg> = fc.oneof(
      fc.string().map((query) => ({ t: 'Open' as const, query })),
      fc.string().map((query) => ({ t: 'Query' as const, query })),
      fc.integer().map((delta) => ({ t: 'Move' as const, delta })),
      fc.constantFrom<Msg>(
        { t: 'Close' },
        { t: 'Retry' },
        { t: 'Activate' },
        { t: 'Loaded', items: [result] },
        { t: 'LoadFailed', reason: 'offline' },
      ),
    )
    fc.assert(
      fc.property(fc.array(msg), (messages) => {
        let state: State = initialState()
        for (const message of messages) {
          ;[state] = update(state, message)
          expect(JSON.parse(JSON.stringify(state))).toEqual(state)
          if (state.view.t === 'Open') {
            const { items, selected } = state.view.mode
            expect(selected).toBeGreaterThanOrEqual(0)
            expect(selected).toBeLessThanOrEqual(Math.max(0, items.length - 1))
          }
        }
      }),
    )
  })
})

test('index parser rejects malformed JSON and preserves unpublished results', () => {
  for (const value of [
    null,
    {},
    [null],
    [{ ...result, body: undefined }],
    [{ ...result, topics: [3] }],
    [{ ...result, url: 'javascript:alert(1)' }],
    [{ ...result, url: '/\n/example.com' }],
  ]) {
    expect(parseSearchIndex(value).t).toBe('Invalid')
  }
  expect(parseSearchIndex([result])).toEqual({ t: 'Parsed', items: [result] })
})

test('highlights literal punctuation without interpreting HTML', () => {
  expect(highlightMatches('<img onerror="x"> [a]', '[')).toEqual([
    { text: '<img onerror="x"> ', highlighted: false },
    { text: '[', highlighted: true },
    { text: 'a]', highlighted: false },
  ])
  fc.assert(
    fc.property(fc.string(), fc.string(), (text, query) => {
      expect(
        highlightMatches(text, query)
          .map((segment) => segment.text)
          .join(''),
      ).toBe(text)
    }),
  )
})

test('topic selection returns to results with the completed query', () => {
  let [state] = update(initialState(), { t: 'Open', query: '#we' })
  ;[state] = update(state, { t: 'Loaded', items: [result] })
  const [next, cmds] = update(state, { t: 'Activate' })
  expect(next.view).toEqual({
    t: 'Open',
    query: 'web ',
    mode: { t: 'Results', items: [], selected: 0 },
  })
  expect(cmds).toEqual([{ t: 'Search', query: 'web ' }])
})
