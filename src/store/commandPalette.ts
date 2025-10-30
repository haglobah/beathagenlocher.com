import { atom } from 'nanostores'

export interface CommandItem {
  id: string
  name: string
  description?: string
  handler: () => void
  keywords?: string[]
}

export interface SearchResult {
  id: string
  type: string
  title: string
  description: string
  url: string
  body: string
  topics: string[]
}

// Store for command items
export const $commandItems = atom<CommandItem[]>([])

// Register commands
export function registerCommands(items: CommandItem[]) {
  $commandItems.set(items)
}

// Add commands (append to existing)
export function addCommands(items: CommandItem[]) {
  $commandItems.set([...$commandItems.get(), ...items])
}

export type Topic = string

export const $filteredTopics = atom<Topic[]>([])

export function setFilteredTopics(topics: Topic[]) {
  $filteredTopics.set(topics)
}

export const $selectedTopicIndex = atom<number>(0)

export function setSelectedTopicIndex(index: number) {
  $selectedTopicIndex.set(index)
}

export const $selectedIndex = atom<number>(0)

export function setSelectedIndex(index: number) {
  $selectedIndex.set(index)
}

export const $filteredItems = atom<(CommandItem | SearchResult)[]>([])

export function setFilteredItems(items: (CommandItem | SearchResult)[]) {
  $filteredItems.set(items)
}
