import { marked } from 'marked'

export async function renderMarkdownInline(markdown: string): Promise<string> {
  return marked.parseInline(markdown)
}
