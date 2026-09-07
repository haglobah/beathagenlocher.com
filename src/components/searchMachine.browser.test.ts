import { expect, test } from 'bun:test'
import { parseHTML } from 'linkedom'
import { execute, initialState, update, type Msg, type State } from './searchMachine'
import { highlightedText } from './searchPalette'

const result = {
  id: 'draft',
  type: 'note',
  title: 'Hello',
  description: '',
  url: '/draft',
  body: 'A literal [ character',
  topics: ['web'],
  published: false,
}

test('delayed index load refreshes matches and still permits draft navigation', async () => {
  let resolve!: (data: unknown) => void
  const pending = new Promise<unknown>((done) => {
    resolve = done
  })
  let loads = 0
  const visited: string[] = []
  const run = execute({
    fetchIndex: () => {
      loads++
      return pending
    },
    commands: () => [],
    navigate: (url) => visited.push(url),
  })
  let state: State = initialState()
  const dispatch = (msg: Msg) => {
    const [next, cmds] = update(state, msg)
    state = next
    run(cmds, dispatch)
  }
  dispatch({ t: 'Open', query: 'Hello' })
  dispatch({ t: 'Open', query: 'Hello' })
  expect(loads).toBe(1)
  expect(state.load.t).toBe('Loading')
  resolve([result])
  await pending
  await Promise.resolve()
  expect(state.load.t).toBe('Ready')
  expect(state.view.t === 'Open' && state.view.mode.items).toEqual([{ t: 'Content', item: result }])
  dispatch({ t: 'Activate' })
  expect(visited).toEqual(['/draft'])
})

test('load rejection produces a failure message and retry can recover', async () => {
  let attempts = 0
  const run = execute({
    fetchIndex: async () => {
      if (++attempts === 1) throw new Error('offline')
      return [result]
    },
    commands: () => [],
    navigate: () => {},
  })
  let state = initialState()
  const dispatch = (msg: Msg) => {
    const [next, cmds] = update(state, msg)
    state = next
    run(cmds, dispatch)
  }
  dispatch({ t: 'Open', query: 'Hello' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(state.load.t).toBe('Failed')
  dispatch({ t: 'Retry' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(state.load.t).toBe('Ready')
})

test('highlight rendering preserves literal markup without creating content elements', () => {
  const { document } = parseHTML('<html><body></body></html>')
  const text = '<img src=x onerror=alert(1)> [a]'
  document.body.append(highlightedText(document, text, '['))
  expect(document.body.textContent).toBe(text)
  expect(document.querySelector('img')).toBeNull()
  expect(document.querySelectorAll('mark')).toHaveLength(1)
  expect(document.querySelector('mark')?.textContent).toBe('[')
})
