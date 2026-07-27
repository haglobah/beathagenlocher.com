// Sync the book library from Zeneca into the books content collection.
//
// - Downloads missing covers to src/assets/books/
// - Creates missing MDX files in src/content/books/
// - Never touches an existing MDX file: the frontmatter is machine-written
//   once, the body is yours.

import fs from 'node:fs'
import path from 'node:path'
import { bookFileName, bookMdx, coverFileName, mergeShelves, type ZenecaShelf } from './book-lib.ts'

const LIBRARY_URL = 'https://www.zeneca.io/api/library/haglobah'
const BOOKS_DIR = 'src/content/books'
const COVERS_DIR = 'src/assets/books'

const response = await fetch(LIBRARY_URL)
if (!response.ok) {
  throw new Error(`Zeneca responded with ${response.status} for ${LIBRARY_URL}`)
}
const payload = await response.json()
const shelves: ZenecaShelf[] = payload?.data?.library?.data?.shelves
if (!Array.isArray(shelves)) {
  throw new Error(`Unexpected Zeneca response shape: ${JSON.stringify(payload).slice(0, 200)}`)
}

const books = mergeShelves(shelves)
const today = new Date().toISOString().slice(0, 10)

fs.mkdirSync(BOOKS_DIR, { recursive: true })
fs.mkdirSync(COVERS_DIR, { recursive: true })

let coversDownloaded = 0
let filesCreated = 0
const skipped: string[] = []
const coverless: string[] = []

for (const book of books) {
  if (book.coverUrl) {
    const coverPath = path.join(COVERS_DIR, coverFileName(book.title))
    if (!fs.existsSync(coverPath)) {
      const cover = await fetch(book.coverUrl)
      if (!cover.ok) {
        throw new Error(`Cover download failed (${cover.status}) for "${book.title}": ${book.coverUrl}`)
      }
      fs.writeFileSync(coverPath, Buffer.from(await cover.arrayBuffer()))
      coversDownloaded++
    }
  } else {
    coverless.push(book.title)
  }

  const mdxPath = path.join(BOOKS_DIR, bookFileName(book.title))
  if (fs.existsSync(mdxPath)) {
    skipped.push(book.title)
  } else {
    fs.writeFileSync(mdxPath, bookMdx(book, today))
    filesCreated++
  }
}

console.log(`${books.length} books on ${shelves.length} shelves`)
console.log(`${filesCreated} book files created, ${skipped.length} already existed (left untouched)`)
console.log(`${coversDownloaded} covers downloaded`)
if (coverless.length > 0) {
  console.log(`No cover on Zeneca for: ${coverless.join(', ')}`)
}
