// Audit built HTML before browser error recovery can hide invalid nesting.
import { parse } from 'parse5'
import { readdir, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const phrasing = new Set('button span p h1 h2 h3 h4 h5 h6 label strong em b i small sup sub code pre'.split(' '))
const blocks = new Set('div p h1 h2 h3 h4 h5 h6 ul ol li blockquote section article aside header footer main nav table figure figcaption details hr pre form'.split(' '))
const issues = []
let pages = 0
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = `${path}/${entry.name}`
    if (entry.isDirectory()) await walk(file)
    else if (entry.name.endsWith('.html') && entry.name !== 'stats.html') {
      pages++
      const html = await readFile(file, 'utf8')
      const doc = parse(html, { sourceCodeLocationInfo: true })
      function visit(node, ancestors = []) {
        const tag = node.tagName
        const parent = ancestors.at(-1)
        if (tag) {
          const problem = blocks.has(tag) && ancestors.find(a => phrasing.has(a.tagName))
          if (problem) issues.push(`${file}: ${problem.tagName} contains ${tag}`)
          if (['ul', 'ol'].includes(parent?.tagName) && !['li','script','template'].includes(tag)) issues.push(`${file}: ${parent.tagName} > ${tag}`)
          if (tag === 'a' && ancestors.some(a => a.tagName === 'a')) issues.push(`${file}: nested anchors`)
          if (tag === 'button' && ancestors.some(a => ['button','a'].includes(a.tagName))) issues.push(`${file}: nested interactive button`)
          if (['p', 'a', 'button'].includes(tag) && node.sourceCodeLocation?.startTag && !node.sourceCodeLocation.endTag) issues.push(`${file}: ${tag} implicitly closed near ${html.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.startOffset + 100)}`)
        }
        for (const child of node.childNodes ?? []) visit(child, tag ? [...ancestors, node] : ancestors)
      }
      visit(doc)
    }
  }
}
await walk('dist')
const unique = [...new Set(issues)]
console.log(`${pages} pages checked; ${issues.length} nesting errors (${unique.length} unique).`)
if (unique.length) console.log(unique.slice(0,80).join('\n'))
assert.ok(pages > 0, 'Build the site before auditing its HTML')
assert.equal(issues.length, 0)
