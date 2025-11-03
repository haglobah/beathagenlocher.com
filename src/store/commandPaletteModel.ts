import type { CommandItem, SearchResult } from './commandPalette'

export type Topic = string

export interface Model {
  query: string
  isOpen: boolean
  isTopicMode: boolean
  selectedIndex: number
  selectedTopicIndex: number
  filteredItems: (CommandItem | SearchResult)[]
  filteredTopics: Topic[]
  allTopics: Topic[]
  topicCounts: Map<string, number>
  searchIndexLoaded: boolean
  searchIndex: SearchResult[]
  commandIndex: any
  contentIndex: any
  commands: CommandItem[]
}

export type Msg =
  | { kind: 'Open' }
  | { kind: 'Close' }
  | { kind: 'QueryChanged'; query: string }
  | { kind: 'MoveSelection'; delta: number }
  | { kind: 'SelectTopic'; topic: string }
  | { kind: 'Execute'; item: CommandItem | SearchResult }
  | { kind: 'SearchIndexLoaded'; index: SearchResult[]; topics: Map<string, number> }
  | { kind: 'KeyDown'; key: string; shiftKey: boolean }
  | { kind: 'CommandIndexReady'; index: any; commands: CommandItem[] }
  | { kind: 'ContentIndexReady'; index: any; searchIndex: SearchResult[] }

export type Cmd =
  | { kind: 'None' }
  | { kind: 'LoadSearchIndex' }
  | { kind: 'Navigate'; url: string }
  | { kind: 'ExecuteHandler'; handler: () => void }
  | { kind: 'UpdateQueryParams'; query: string }
  | { kind: 'FocusInput' }
  | { kind: 'ScrollIntoView'; selector: string; index: number }
  | { kind: 'BuildCommandIndex'; commands: CommandItem[] }
  | { kind: 'BuildContentIndex'; searchIndex: SearchResult[] }

export const initModel = (): Model => ({
  query: '',
  isOpen: false,
  isTopicMode: false,
  selectedIndex: 0,
  selectedTopicIndex: 0,
  filteredItems: [],
  filteredTopics: [],
  allTopics: [],
  topicCounts: new Map(),
  searchIndexLoaded: false,
  searchIndex: [],
  commandIndex: null,
  contentIndex: null,
  commands: [],
})

const clampIndex = (index: number, max: number): number =>
  Math.max(0, Math.min(Math.max(0, max - 1), index))

const checkTopicMode = (query: string): { isTopicMode: boolean; topicQuery: string } => {
  const hashIndex = query.lastIndexOf('#')
  if (hashIndex === -1) return { isTopicMode: false, topicQuery: '' }
  const afterHash = query.slice(hashIndex + 1)
  const hasSpaceAfterHash = afterHash.includes(' ')
  return { isTopicMode: !hasSpaceAfterHash, topicQuery: afterHash.toLowerCase() }
}

const filterTopics = (query: string, allTopics: Topic[]): Topic[] => {
  if (!query) return allTopics
  return allTopics
    .filter((topic) => topic.toLowerCase().includes(query))
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(query)
      const bStarts = b.toLowerCase().startsWith(query)
      return aStarts && !bStarts ? -1 : !aStarts && bStarts ? 1 : a.localeCompare(b)
    })
}

const isSearchResult = (item: CommandItem | SearchResult): item is SearchResult => {
  return 'url' in item && 'type' in item
}

const searchContent = (query: string, model: Model): SearchResult[] => {
  if (!query || !model.searchIndexLoaded || !model.contentIndex) return []
  const results = model.contentIndex.search(query, { limit: 10 })
  return results.map((idx) => model.searchIndex[idx as number])
}

const searchCommands = (query: string, model: Model): CommandItem[] => {
  if (!model.commandIndex) return []
  if (!query) return model.commands
  const results = model.commandIndex.search(query)
  return results.map((idx) => model.commands[idx as number])
}

const filter = (query: string, model: Model): (CommandItem | SearchResult)[] => {
  const commands = searchCommands(query, model)
  const contentResults = searchContent(query, model)
  return [...commands, ...contentResults]
}

export const update = (msg: Msg, model: Model): [Model, Cmd] => {
  switch (msg.kind) {
    case 'Open': {
      const filteredItems = model.commands.length > 0 ? model.commands : []
      return [
        { ...model, isOpen: true, selectedIndex: 0, filteredItems },
        { kind: 'LoadSearchIndex' },
      ]
    }

    case 'Close': {
      return [
        {
          ...model,
          isOpen: false,
          query: '',
          selectedIndex: 0,
          isTopicMode: false,
          filteredItems: [],
          filteredTopics: [],
        },
        { kind: 'UpdateQueryParams', query: '' },
      ]
    }

    case 'QueryChanged': {
      const { isTopicMode, topicQuery } = checkTopicMode(msg.query)
      const filteredTopics = isTopicMode ? filterTopics(topicQuery, model.allTopics) : []
      const filteredItems = isTopicMode ? [] : filter(msg.query, model)

      return [
        {
          ...model,
          query: msg.query,
          isTopicMode,
          filteredTopics,
          filteredItems,
          selectedIndex: 0,
          selectedTopicIndex: 0,
        },
        { kind: 'UpdateQueryParams', query: msg.query },
      ]
    }

    case 'MoveSelection': {
      if (model.isTopicMode) {
        const newIndex = clampIndex(
          model.selectedTopicIndex + msg.delta,
          model.filteredTopics.length,
        )
        return [
          { ...model, selectedTopicIndex: newIndex },
          { kind: 'ScrollIntoView', selector: '[data-topic-index]', index: newIndex },
        ]
      } else {
        const newIndex = clampIndex(model.selectedIndex + msg.delta, model.filteredItems.length)
        return [
          { ...model, selectedIndex: newIndex },
          { kind: 'ScrollIntoView', selector: '[data-index]', index: newIndex },
        ]
      }
    }

    case 'SelectTopic': {
      const hashIndex = model.query.lastIndexOf('#')
      const beforeHash = hashIndex >= 0 ? model.query.slice(0, hashIndex) : model.query
      const newQuery = beforeHash + msg.topic + ' '
      return [
        { ...model, query: newQuery, isTopicMode: false, selectedIndex: 0, filteredItems: filter(newQuery, model) },
        { kind: 'UpdateQueryParams', query: newQuery },
      ]
    }

    case 'Execute': {
      const cmd = isSearchResult(msg.item)
        ? ({ kind: 'Navigate', url: msg.item.url } as const)
        : ({ kind: 'ExecuteHandler', handler: msg.item.handler } as const)

      return [
        { ...model, isOpen: false, query: '', selectedIndex: 0 },
        cmd,
      ]
    }

    case 'SearchIndexLoaded': {
      return [
        {
          ...model,
          searchIndexLoaded: true,
          allTopics: Array.from(msg.topics.keys()).sort(),
          topicCounts: msg.topics,
          searchIndex: msg.index,
        },
        { kind: 'BuildContentIndex', searchIndex: msg.index },
      ]
    }

    case 'CommandIndexReady': {
      return [
        { ...model, commandIndex: msg.index, commands: msg.commands },
        { kind: 'LoadSearchIndex' },
      ]
    }

    case 'ContentIndexReady': {
      return [
        { ...model, contentIndex: msg.index, searchIndex: msg.searchIndex },
        { kind: 'FocusInput' },
      ]
    }

    case 'KeyDown': {
      if (msg.key === 'Escape') return update({ kind: 'Close' }, model)
      if (msg.key === 'ArrowDown') return update({ kind: 'MoveSelection', delta: 1 }, model)
      if (msg.key === 'ArrowUp') return update({ kind: 'MoveSelection', delta: -1 }, model)
      if (msg.key === 'Tab' && model.isTopicMode) {
        return update({ kind: 'MoveSelection', delta: msg.shiftKey ? -1 : 1 }, model)
      }
      if (msg.key === 'Enter') {
        if (model.isTopicMode && model.filteredTopics[model.selectedTopicIndex]) {
          return update(
            { kind: 'SelectTopic', topic: model.filteredTopics[model.selectedTopicIndex] },
            model,
          )
        }
        if (model.filteredItems[model.selectedIndex]) {
          return update(
            { kind: 'Execute', item: model.filteredItems[model.selectedIndex] },
            model,
          )
        }
      }
      return [model, { kind: 'None' }]
    }

    default: {
      const _exhaustive: never = msg
      return [model, { kind: 'None' }]
    }
  }
}
