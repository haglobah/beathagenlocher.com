import { atom, computed } from "nanostores";

// Store for selected topics
export const selectedTopics = atom([]);

// Toggle a topic selection
export function toggleTopic(topic) {
  const currentTopics = selectedTopics.get();

  if (currentTopics.includes(topic)) {
    // Remove topic if already selected
    selectedTopics.set(currentTopics.filter((t) => t !== topic));
  } else {
    // Add topic if not selected
    selectedTopics.set([...currentTopics, topic]);
  }
}

// Clear all selected topics
export function clearTopics() {
  selectedTopics.set([]);
}

// Check if content should be visible based on selected topics
export const shouldShowContent = computed(selectedTopics, (topics) => {
  // If no topics selected, show everything
  if (topics.length === 0) return () => true;

  // Otherwise, check if content has at least one of the selected topics
  return (contentTopics) => {
    return contentTopics.some((topic) => topics.includes(topic));
  };
});

export interface CommandItem {
  id: string;
  name: string;
  description?: string;
  handler: () => void;
  keywords?: string[];
}
// Store for command items
export const $commandItems = atom<CommandItem[]>([]);

// Register commands
export function registerCommands(items: CommandItem[]) {
  $commandItems.set(items);
}

// Add commands (append to existing)
export function addCommands(items: CommandItem[]) {
  $commandItems.set([...$commandItems.get(), ...items]);
}
