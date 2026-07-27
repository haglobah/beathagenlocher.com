import { slug } from 'github-slugger'

export interface ZenecaBook {
  id: string
  title: string
  authors: string[] | null
  'isbn-13': string | null
  thumbnail: string | null
  description: string | null
}

export interface ZenecaShelf {
  name: string
  desc: string
  books: ZenecaBook[]
}

export interface Book {
  bookId: string
  title: string
  authors: string[]
  description: string | null
  isbn13: string | null
  shelves: string[]
  coverUrl: string | null
  order: number
}

export const coverUrl = (bookId: string): string =>
  `https://books.google.com/books/content?id=${bookId}&printsec=frontcover&img=1&zoom=1&source=gbs_api&fife=w400-h600`

// Same title on two shelves means the same book in different editions —
// merge them so filenames and routes stay unique.
export const mergeShelves = (shelves: ZenecaShelf[]): Book[] => {
  const byTitle = new Map<string, Book>()
  for (const shelf of shelves) {
    for (const zeneca of shelf.books) {
      const key = zeneca.title.toLowerCase()
      const existing = byTitle.get(key)
      if (existing) {
        existing.shelves.push(shelf.name)
      } else {
        byTitle.set(key, {
          bookId: zeneca.id,
          title: zeneca.title,
          authors: zeneca.authors ?? [],
          description: zeneca.description ?? null,
          isbn13: zeneca['isbn-13'] ?? null,
          shelves: [shelf.name],
          coverUrl: zeneca.thumbnail ? coverUrl(zeneca.id) : null,
          order: byTitle.size,
        })
      }
    }
  }
  return [...byTitle.values()]
}

export const bookSlug = (title: string): string => slug(title)

// The Astro glob loader treats ? * [ ] { } ( ) ! in filenames as glob
// syntax and then fails to read the file, so those never make it into a name.
export const bookFileName = (title: string): string =>
  `${title.replaceAll('/', '-').replace(/[?*[\]{}()!]/g, '').trim()}.mdx`

export const coverFileName = (title: string): string => `${bookSlug(title)}.jpg`

const yamlList = (items: string[]): string =>
  items.map((item) => `\n  - ${JSON.stringify(item)}`).join('')

export const bookMdx = (book: Book, date: string): string => {
  const lines = [
    `title: ${JSON.stringify(book.title)}`,
    `authors:${yamlList(book.authors)}`,
    ...(book.description ? [`description: ${JSON.stringify(book.description)}`] : []),
    `bookId: ${JSON.stringify(book.bookId)}`,
    ...(book.isbn13 ? [`isbn13: ${JSON.stringify(book.isbn13)}`] : []),
    `shelves:${yamlList(book.shelves)}`,
    ...(book.coverUrl ? [`cover: "../../assets/books/${coverFileName(book.title)}"`] : []),
    'recommendations: 0',
    `order: ${book.order}`,
    `startDate: ${date}`,
    `updated: ${date}`,
    'publish: true',
  ]
  return `---\n${lines.join('\n')}\n---\n`
}
