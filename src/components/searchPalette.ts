// @unocss-include
import { previewMetadata } from './searchPreview'
import * as Search from './searchMachine'
import { $commandItems } from '../store/commandPalette'

/** Only creates text nodes and marks; content and queries never become HTML. */
export function highlightedText(document: Document, text: string, query: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (const segment of Search.highlightMatches(text, query)) {
    if (segment.highlighted) {
      const mark = document.createElement('mark')
      mark.className = 'bg-sienna-light text-zinc-800'
      mark.textContent = segment.text
      fragment.append(mark)
    } else fragment.append(document.createTextNode(segment.text))
  }
  return fragment
}

export function mountPalette(document: Document) {
  const element = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const found = document.getElementById(id)
    if (!found) throw new Error(`Missing search element: ${id}`)
    return found as T
  }
  const palette = element('command-palette')
  const input = element<HTMLInputElement>('palette-input')
  const results = element('palette-results')
  const preview = element('palette-preview')
  const previewContent = element('preview-content')
  const topicSelector = element('topic-selector')
  const topicItems = element('topic-selector-items')
  const status = document.createElement('div')
  status.className = 'px-4 text-sm text-zinc-500'
  status.setAttribute('role', 'status')
  input.after(status)

  const node = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text = '',
  ): HTMLElementTagNameMap[K] => {
    const result = document.createElement(tag)
    result.className = className
    result.textContent = text
    return result
  }
  const badge = (text: string) =>
    node('span', 'text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-400', text)
  const pill = (text: string, selected: boolean) =>
    node(
      'span',
      `flex rounded-full px-[0.9em] py-[0.5em] font-medium leading-5 ${selected ? 'bg-sienna-mid/30 text-white hover:bg-sienna-mid/40 shadow-[0_0_12px_rgba(119,158,203,0.5)]' : 'bg-sienna-mid/10 text-sienna-mid hover:bg-sienna-mid/20'}`,
      text,
    )

  function renderPreview(item: Search.Item, query: string) {
    const heading = node('div', 'mb-4')
    if (item.t === 'Content') {
      const content = item.item
      heading.append(node('div', 'text-xs text-zinc-500 uppercase mb-1', content.type))
      heading.append(node('div', 'text-lg font-medium text-zinc-100 mb-2', content.title))
      if (content.description)
        heading.append(node('div', 'text-sm text-zinc-400 mb-3', content.description))
      heading.append(previewMetadata(document, content))
      const topics = node('div', 'flex flex-wrap gap-2 mt-3')
      for (const topic of content.topics) {
        const wrapper = node('div', 'f-text-xs')
        wrapper.append(
          pill(
            topic,
            Search.highlightMatches(topic, query).some((segment) => segment.highlighted),
          ),
        )
        topics.append(wrapper)
      }
      heading.append(topics)
      if (!content.published)
        heading.append(node('div', 'flex f-text-xs mt-3 text-zinc-500', 'Unpublished'))
      const body = node('div', 'text-zinc-300 leading-relaxed whitespace-pre-wrap')
      body.append(highlightedText(document, Search.contextSnippet(content.body, query), query))
      previewContent.replaceChildren(heading, body)
    } else {
      heading.append(node('div', 'text-lg font-medium text-zinc-100 mb-2', item.name))
      if (item.description) heading.append(node('div', 'text-sm text-zinc-400', item.description))
      previewContent.replaceChildren(heading)
      if (item.keywords.length)
        previewContent.append(
          node('div', 'text-xs text-zinc-500 mt-4', `Keywords: ${item.keywords.join(', ')}`),
        )
    }
  }

  function render(state: Search.State) {
    const view = state.view
    const open = view.t === 'Open'
    palette.classList.toggle('hidden', !open)
    palette.classList.toggle('flex', open)
    const query = open ? view.query : ''
    if (input.value !== query) input.value = query
    const url = new URL(window.location.href)
    if (query) url.searchParams.set('q', query)
    else url.searchParams.delete('q')
    if (url.href !== window.location.href) window.history.replaceState({}, '', url)
    if (!open) return

    status.replaceChildren()
    if (state.load.t === 'Loading') status.textContent = 'Loading search…'
    if (state.load.t === 'Failed') {
      status.append(document.createTextNode(state.load.reason + ' '))
      const retry = node('button', 'underline text-cornflower', 'Retry')
      retry.onclick = () => dispatch({ t: 'Retry' })
      status.append(retry)
    }
    const mode = view.mode
    topicSelector.classList.toggle('hidden', mode.t !== 'Topics')
    results.replaceChildren()
    preview.classList.remove('md:block')
    if (mode.t === 'Topics') {
      topicItems.replaceChildren()
      if (!mode.items.length)
        topicItems.append(node('div', 'text-zinc-500 text-sm', 'No topics found'))
      mode.items.forEach((topic, index) => {
        const button = node(
          'button',
          'bg-transparent border-0 appearance-none p-0 f-text-xs cursor-pointer transition-all',
        )
        const label = pill(topic.name, index === mode.selected)
        label.append(node('span', 'ml-2 text-zinc-500', String(topic.count)))
        button.append(label)
        button.onclick = () => {
          dispatch({ t: 'Choose', index })
          input.focus()
        }
        topicItems.append(button)
      })
      topicItems.children[mode.selected]?.scrollIntoView({ block: 'nearest' })
      return
    }
    if (!mode.items.length && state.load.t === 'Ready')
      results.append(node('div', 'px-4 py-8 text-center text-zinc-500', 'No results found'))
    mode.items.forEach((item, index) => {
      const unpublished = item.t === 'Content' && !item.item.published
      const row = node(
        'button',
        `block w-full border-0 appearance-none text-left px-4 py-3 cursor-pointer transition-colors ${unpublished ? 'opacity-50' : ''} ${index === mode.selected ? 'bg-zinc-800 text-zinc-100' : 'bg-transparent text-zinc-300 hover:bg-zinc-800'}`,
      )
      const title = node('div', 'flex items-center gap-2')
      if (item.t === 'Content') title.append(badge(item.item.type))
      title.append(node('div', 'font-medium', item.t === 'Content' ? item.item.title : item.name))
      if (unpublished) title.append(badge('Unpublished'))
      row.append(title)
      const description = item.t === 'Content' ? item.item.description : item.description
      if (description) row.append(node('div', 'text-sm text-zinc-500 mt-1', description))
      row.onclick = () => dispatch({ t: 'Choose', index })
      results.append(row)
    })
    const selected = mode.items[mode.selected]
    if (selected) {
      renderPreview(selected, query)
      preview.classList.add('md:block')
      results.children[mode.selected]?.scrollIntoView({ block: 'nearest' })
    }
  }

  let state = Search.initialState()
  const execute = Search.execute({
    fetchIndex: async () => {
      const response = await fetch('/api/search-index.json')
      if (!response.ok) throw new Error(`Search index returned ${response.status}`)
      return response.json() as Promise<unknown>
    },
    commands: () => $commandItems.get(),
    navigate: (url) => {
      window.location.href = url
    },
  })
  function dispatch(msg: Search.Msg) {
    const [next, cmds] = Search.update(state, msg)
    state = next
    render(state)
    execute(cmds, dispatch)
  }
  const open = () => {
    dispatch({ t: 'Open', query: new URLSearchParams(window.location.search).get('q') ?? '' })
    input.focus()
  }
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      if (state.view.t === 'Open') dispatch({ t: 'Close' })
      else open()
      return
    }
    if (state.view.t === 'Closed') return
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        dispatch({ t: 'Close' })
        break
      case 'ArrowDown':
        event.preventDefault()
        dispatch({ t: 'Move', delta: 1 })
        break
      case 'ArrowUp':
        event.preventDefault()
        dispatch({ t: 'Move', delta: -1 })
        break
      case 'Tab':
        if (state.view.mode.t === 'Topics') {
          event.preventDefault()
          dispatch({ t: 'Move', delta: event.shiftKey ? -1 : 1 })
        }
        break
      case 'Enter':
        // Native buttons own Enter when focused (including Retry).
        if (event.target === input) {
          event.preventDefault()
          dispatch({ t: 'Activate' })
        }
        break
    }
  })
  input.addEventListener('input', () => dispatch({ t: 'Query', query: input.value }))
  element('palette-backdrop').addEventListener('click', () => dispatch({ t: 'Close' }))
  $commandItems.listen(() => {
    if (state.view.t === 'Open') dispatch({ t: 'Refresh' })
  })
  if (new URLSearchParams(window.location.search).get('q')) open()
}
