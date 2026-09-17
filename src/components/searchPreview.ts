// @unocss-include
import { formatContentDate } from './contentDate'
import type { SearchResult } from './searchMachine'

export function previewMetadata(document: Document, content: SearchResult): HTMLElement {
  const metadata = document.createElement('div')
  metadata.className =
    'flex items-center mb-3 text-xs font-mono tabular-nums whitespace-nowrap text-cornflower-light'
  const dateText = (value: string | undefined) =>
    value ? formatContentDate(new Date(value), 'short') : undefined
  const sameDate =
    content.startDate !== undefined && dateText(content.startDate) === dateText(content.updated)
  const separator = (text: string) => {
    const span = document.createElement('span')
    span.textContent = text
    span.className = 'whitespace-pre text-zinc-500'
    span.setAttribute('aria-hidden', 'true')
    metadata.append(span)
  }
  for (const [label, value] of [
    [sameDate ? 'Created and updated' : 'Created', content.startDate],
    ['Updated', sameDate ? undefined : content.updated],
  ] as const) {
    if (!value) continue
    if (metadata.childElementCount) separator('–')
    const time = document.createElement('time')
    time.dateTime = value
    time.textContent = dateText(value)!
    time.title = label
    time.setAttribute('aria-label', `${label}: ${time.textContent}`)
    metadata.append(time)
  }
  if (content.readingMinutes !== undefined) {
    if (metadata.childElementCount) separator(' | ')
    const duration = document.createElement('span')
    duration.textContent = `${content.readingMinutes} min`
    duration.title = 'Reading time'
    duration.setAttribute('aria-label', `${content.readingMinutes} minute read`)
    metadata.append(duration)
  }
  return metadata
}
