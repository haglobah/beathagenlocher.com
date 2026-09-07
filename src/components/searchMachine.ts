import { absurd } from '../utils'

export type SearchResult = {
  id: string
  type: string
  title: string
  description: string
  url: string
  body: string
  topics: string[]
  published: boolean
}

export type Item =
  | { t: 'Content'; item: SearchResult }
  | { t: 'Command'; id: string; name: string; description: string; keywords: string[] }
export type Topic = { name: string; count: number }
type Load =
  | { t: 'NotLoaded' }
  | { t: 'Loading' }
  | { t: 'Ready'; topics: Topic[] }
  | { t: 'Failed'; reason: string }
export type Mode =
  | { t: 'Results'; items: Item[]; selected: number }
  | { t: 'Topics'; items: Topic[]; selected: number }
type View = { t: 'Closed' } | { t: 'Open'; query: string; mode: Mode }
export type State = { load: Load; view: View }
export const initialState = (): State => ({ load: { t: 'NotLoaded' }, view: { t: 'Closed' } })

export type Msg =
  | { t: 'Open'; query: string }
  | { t: 'Close' }
  | { t: 'Query'; query: string }
  | { t: 'Refresh' }
  | { t: 'Retry' }
  | { t: 'Loaded'; items: SearchResult[] }
  | { t: 'LoadFailed'; reason: string }
  | { t: 'Matches'; query: string; items: Item[] }
  | { t: 'Move'; delta: number }
  | { t: 'Activate' }
  | { t: 'Choose'; index: number }
export type Cmd = { t: 'Load' } | { t: 'Search'; query: string } | { t: 'Execute'; item: Item }

function queryView(load: Load, query: string): [View, Cmd[]] {
  const hash = query.lastIndexOf('#')
  const suffix = query.slice(hash + 1).toLowerCase()
  if (hash >= 0 && !suffix.includes(' ')) {
    const topics = load.t === 'Ready' ? load.topics : []
    const items = topics
      .filter((topic) => topic.name.toLowerCase().includes(suffix))
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase().startsWith(suffix)) -
            Number(a.name.toLowerCase().startsWith(suffix)) || a.name.localeCompare(b.name),
      )
    return [{ t: 'Open', query, mode: { t: 'Topics', items, selected: 0 } }, []]
  }
  return [
    { t: 'Open', query, mode: { t: 'Results', items: [], selected: 0 } },
    [{ t: 'Search', query }],
  ]
}

export function update(state: State, msg: Msg): [State, Cmd[]] {
  switch (msg.t) {
    case 'Open': {
      const needsLoad = state.load.t === 'NotLoaded' || state.load.t === 'Failed'
      const load: Load = needsLoad ? { t: 'Loading' } : state.load
      const [view, cmds] = queryView(load, msg.query)
      return [{ load, view }, [...(needsLoad ? [{ t: 'Load' } as const] : []), ...cmds]]
    }
    case 'Close':
      return [{ ...state, view: { t: 'Closed' } }, []]
    case 'Query': {
      if (state.view.t === 'Closed') return [state, []]
      const [view, cmds] = queryView(state.load, msg.query)
      return [{ ...state, view }, cmds]
    }
    case 'Refresh':
      return state.view.t === 'Open'
        ? update(state, { t: 'Query', query: state.view.query })
        : [state, []]
    case 'Retry':
      return state.load.t === 'Failed'
        ? [{ ...state, load: { t: 'Loading' } }, [{ t: 'Load' }]]
        : [state, []]
    case 'Loaded': {
      if (state.load.t !== 'Loading') return [state, []]
      const counts = new Map<string, number>()
      for (const item of msg.items)
        for (const topic of item.topics) counts.set(topic, (counts.get(topic) ?? 0) + 1)
      const load: Load = {
        t: 'Ready',
        topics: [...counts].map(([name, count]) => ({ name, count })),
      }
      return update({ ...state, load }, { t: 'Refresh' })
    }
    case 'LoadFailed':
      return state.load.t === 'Loading'
        ? [{ ...state, load: { t: 'Failed', reason: msg.reason } }, []]
        : [state, []]
    case 'Matches':
      return state.view.t === 'Open' &&
        state.view.mode.t === 'Results' &&
        state.view.query === msg.query
        ? [
            {
              ...state,
              view: { ...state.view, mode: { t: 'Results', items: msg.items, selected: 0 } },
            },
            [],
          ]
        : [state, []]
    case 'Move': {
      if (state.view.t === 'Closed') return [state, []]
      const mode = state.view.mode
      const selected = Math.max(0, Math.min(mode.items.length - 1, mode.selected + msg.delta))
      return [{ ...state, view: { ...state.view, mode: { ...mode, selected } } }, []]
    }
    case 'Activate':
    case 'Choose': {
      if (state.view.t === 'Closed') return [state, []]
      const { mode, query } = state.view
      const index = msg.t === 'Choose' ? msg.index : mode.selected
      if (mode.t === 'Topics') {
        const topic = mode.items[index]
        return topic
          ? update(state, {
              t: 'Query',
              query: query.slice(0, query.lastIndexOf('#')) + topic.name + ' ',
            })
          : [state, []]
      }
      const item = mode.items[index]
      return item ? [{ ...state, view: { t: 'Closed' } }, [{ t: 'Execute', item }]] : [state, []]
    }
    default:
      return absurd(msg)
  }
}

export function parseSearchIndex(
  raw: unknown,
): { t: 'Parsed'; items: SearchResult[] } | { t: 'Invalid'; reason: string } {
  const isResult = (value: unknown): value is SearchResult => {
    if (!value || typeof value !== 'object') return false
    const item = value as Record<string, unknown>
    return (
      ['id', 'type', 'title', 'description', 'url', 'body'].every(
        (key) => typeof item[key] === 'string',
      ) &&
      typeof item.url === 'string' &&
      item.url.startsWith('/') &&
      !item.url.startsWith('//') &&
      !/[\\\x00-\x20]/.test(item.url) &&
      typeof item.published === 'boolean' &&
      Array.isArray(item.topics) &&
      item.topics.every((topic) => typeof topic === 'string')
    )
  }
  return Array.isArray(raw) && raw.every(isResult)
    ? { t: 'Parsed', items: raw }
    : { t: 'Invalid', reason: 'The search index has an invalid format.' }
}

export type Segment = { text: string; highlighted: boolean }

/** Literal, case-insensitive matching. Segments are text, never HTML. */
export function highlightMatches(text: string, query: string): Segment[] {
  const terms = query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!terms.length) return [{ text, highlighted: false }]
  const pattern = new RegExp(terms.sort((a, b) => b.length - a.length).join('|'), 'gi')
  const segments: Segment[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlighted: false })
    segments.push({ text: match[0], highlighted: true })
    cursor = start + match[0].length
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false })
  return segments
}

export function contextSnippet(text: string, query: string): string {
  const lower = text.toLowerCase()
  const positions = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
  const start = positions.length ? Math.max(0, Math.min(...positions) - 50) : 0
  const end = Math.min(text.length, start + 300)
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

// Search indexes and command handlers belong to the browser boundary, never State.
import FlexSearch from 'flexsearch'
import type { CommandItem } from '../store/commandPalette'

type Environment = {
  fetchIndex: () => Promise<unknown>
  commands: () => CommandItem[]
  navigate: (url: string) => void
}

export function execute(env: Environment): (cmds: Cmd[], dispatch: (msg: Msg) => void) => void {
  let documents: SearchResult[] = []
  let contentIndex = new FlexSearch.Index({ tokenize: 'forward', cache: true })
  return (cmds, dispatch) => {
    for (const cmd of cmds) {
      switch (cmd.t) {
        case 'Load':
          void env
            .fetchIndex()
            .then((raw) => {
              const parsed = parseSearchIndex(raw)
              if (parsed.t === 'Invalid') {
                dispatch({ t: 'LoadFailed', reason: parsed.reason })
                return
              }
              const index = new FlexSearch.Index({ tokenize: 'forward', cache: true })
              parsed.items.forEach((item, id) =>
                index.add(
                  id,
                  `${item.title} ${item.description} ${item.topics.join(' ')} ${item.body}`,
                ),
              )
              documents = parsed.items
              contentIndex = index
              dispatch({ t: 'Loaded', items: parsed.items })
            })
            .catch(() =>
              dispatch({ t: 'LoadFailed', reason: 'Search could not load. Please try again.' }),
            )
          break
        case 'Search': {
          const commands = env.commands()
          const index = new FlexSearch.Index({ tokenize: 'forward', cache: true })
          commands.forEach((item, id) =>
            index.add(
              id,
              `${item.name} ${item.description ?? ''} ${item.keywords?.join(' ') ?? ''}`,
            ),
          )
          const matchingCommands = cmd.query.trim()
            ? index.search(cmd.query).flatMap((id) => commands[Number(id)] ?? [])
            : commands
          const items: Item[] = matchingCommands.map((item) => ({
            t: 'Command',
            id: item.id,
            name: item.name,
            description: item.description ?? '',
            keywords: item.keywords ?? [],
          }))
          if (cmd.query.trim())
            for (const id of contentIndex.search(cmd.query, { limit: 10 })) {
              const item = documents[Number(id)]
              if (item) items.push({ t: 'Content', item })
            }
          dispatch({ t: 'Matches', query: cmd.query, items })
          break
        }
        case 'Execute': {
          const item = cmd.item
          if (item.t === 'Content') env.navigate(item.item.url)
          else
            env
              .commands()
              .find((command) => command.id === item.id)
              ?.handler()
          break
        }
        default:
          absurd(cmd)
      }
    }
  }
}
