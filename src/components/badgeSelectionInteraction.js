import { selectedTopics } from '../store.js'

function filterContent() {
  const selected = selectedTopics.get()
  const contentItems = document.querySelectorAll('.content-item')

  contentItems.forEach((item) => {
    const itemTopics = JSON.parse(item.dataset.topics || '[]')

    if (selected.length === 0) {
      // Show everything if no topics selected
      item.style.display = ''
    } else {
      // Check if any of the item's topics match the selected topics
      const hasMatch = itemTopics.some((topic) => selected.includes(topic))
      item.style.display = hasMatch ? '' : 'none'
    }
  })
}

export default function runInteraction() {
  // Subscribe to store changes
  selectedTopics.subscribe(filterContent)

  // Initial filter
  filterContent()
}
