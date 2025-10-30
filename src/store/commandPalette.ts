import { atom } from 'nanostores'

export interface CommandItem {
  id: string
  name: string
  description?: string
  handler: () => void
  keywords?: string[]
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
