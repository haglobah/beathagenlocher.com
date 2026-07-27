import { describe, expect, test } from 'bun:test'
import { bookFileName, bookMdx, coverUrl, mergeShelves } from './book-lib.ts'

const zeneca = (over = {}) => ({
  id: 'abc123',
  title: 'The Mom Test',
  authors: ['Rob Fitzpatrick'],
  'isbn-13': '9781492180746',
  thumbnail:
    'http://books.google.com/books/content?id=abc123&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api',
  description: 'How to talk to customers.',
  ...over,
})

describe('mergeShelves', () => {
  test('collects books with their shelf, preserving order', () => {
    const books = mergeShelves([
      { name: 'Business', desc: '', books: [zeneca()] },
      { name: 'Fiction', desc: '', books: [zeneca({ id: 'x1', title: 'Snow Crash', authors: ['Neal Stephenson'] })] },
    ])
    expect(books.map((b) => b.title)).toEqual(['The Mom Test', 'Snow Crash'])
    expect(books[0].shelves).toEqual(['Business'])
    expect(books.map((b) => b.order)).toEqual([0, 1])
  })

  test('merges same title across shelves (different editions) into one book', () => {
    const books = mergeShelves([
      { name: 'Life', desc: '', books: [zeneca({ id: 'e1', title: 'Designing Your Life' })] },
      { name: 'Design', desc: '', books: [zeneca({ id: 'e2', title: 'Designing Your Life' })] },
    ])
    expect(books).toHaveLength(1)
    expect(books[0].shelves).toEqual(['Life', 'Design'])
    expect(books[0].bookId).toBe('e1')
  })

  test('books without thumbnail get no cover URL', () => {
    const books = mergeShelves([{ name: 'A', desc: '', books: [zeneca({ thumbnail: null })] }])
    expect(books[0].coverUrl).toBeNull()
  })
})

describe('coverUrl', () => {
  test('builds a high-resolution Google Books URL', () => {
    expect(coverUrl('abc123')).toBe(
      'https://books.google.com/books/content?id=abc123&printsec=frontcover&img=1&zoom=1&source=gbs_api&fife=w400-h600',
    )
  })
})

describe('bookFileName', () => {
  test('keeps ordinary titles as-is', () => {
    expect(bookFileName('The Mom Test')).toBe('The Mom Test.mdx')
  })

  test('replaces filesystem-hostile slashes', () => {
    expect(bookFileName('Either/Or')).toBe('Either-Or.mdx')
  })

  test('strips glob-hostile characters that break the Astro loader', () => {
    expect(bookFileName("What's Our Problem?")).toBe("What's Our Problem.mdx")
    expect(bookFileName('Star* [Bracket] {Brace} (Paren)!')).toBe('Star Bracket Brace Paren.mdx')
  })
})

describe('bookMdx', () => {
  const book = mergeShelves([{ name: 'Business', desc: '', books: [zeneca()] }])[0]

  test('renders complete frontmatter', () => {
    const mdx = bookMdx(book, '2026-07-27')
    expect(mdx).toStartWith('---\n')
    expect(mdx).toContain('title: "The Mom Test"')
    expect(mdx).toContain('authors:\n  - "Rob Fitzpatrick"')
    expect(mdx).toContain('bookId: "abc123"')
    expect(mdx).toContain('isbn13: "9781492180746"')
    expect(mdx).toContain('shelves:\n  - "Business"')
    expect(mdx).toContain('cover: "../../assets/books/the-mom-test.jpg"')
    expect(mdx).toContain('startDate: 2026-07-27')
    expect(mdx).toContain('updated: 2026-07-27')
    expect(mdx).toContain('publish: true')
  })

  test('omits cover and isbn13 when the book has none', () => {
    const bare = mergeShelves([
      { name: 'A', desc: '', books: [zeneca({ thumbnail: null, 'isbn-13': null })] },
    ])[0]
    const mdx = bookMdx(bare, '2026-07-27')
    expect(mdx).not.toContain('cover:')
    expect(mdx).not.toContain('isbn13:')
  })

  test('quotes titles containing YAML-hostile characters', () => {
    const tricky = mergeShelves([
      { name: 'A', desc: '', books: [zeneca({ title: 'What\'s "Our" Problem?' })] },
    ])[0]
    const mdx = bookMdx(tricky, '2026-07-27')
    expect(mdx).toContain('title: "What\'s \\"Our\\" Problem?"')
  })
})
