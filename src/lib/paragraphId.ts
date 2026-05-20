import { createHash } from 'node:crypto'

export function hashParagraphId(text: string): string {
  return 'p-' + createHash('sha256').update(text).digest('hex').slice(0, 8)
}

export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
