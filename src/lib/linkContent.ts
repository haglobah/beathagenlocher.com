import { parseHTML } from 'linkedom'

/** MDX can render a multiline link label as paragraphs. Keep its phrasing
 * content, without putting block wrappers or interactive controls in a link. */
export function linkContent(html: string): string {
  const { document } = parseHTML(`<div id="link-root">${html}</div>`)
  const root = document.getElementById('link-root')!
  for (const wrapper of root.querySelectorAll('.commentable-par')) {
    const body = wrapper.querySelector(':scope > [data-comment-content]')
    if (body) wrapper.replaceWith(body)
  }
  for (const paragraph of root.querySelectorAll('p')) {
    const text = document.createElement('span')
    text.innerHTML = paragraph.innerHTML
    paragraph.replaceWith(text)
  }
  return root.innerHTML
}
