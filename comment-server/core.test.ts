import { describe, test, expect } from 'bun:test'
import fc from 'fast-check'
import { type Model, type Msg, parseComment, buildSubject, buildBody, init, update } from './core'

const validPayload = {
  pageUrl: 'https://beathagenlocher.com/some-note',
  paragraphId: 'p-abcd1234',
  paragraphText: 'This is the paragraph text.',
  comment: 'Great point!',
}
const config = { from: 'comments@beathagenlocher.com', to: 'beat@example.com' }

const parsed = (raw: unknown) => {
  const result = parseComment(raw)
  if (result.tag === 'error') throw new Error(result.error.message)
  return result.value
}

const error = (raw: unknown) => {
  const result = parseComment(raw)
  if (result.tag === 'ok') throw new Error('Expected invalid input')
  return result.error.message
}

describe('parseComment', () => {
  test('accepts valid payload, optional email, empty email and localhost URLs', () => {
    for (const raw of [
      validPayload,
      { ...validPayload, email: 'reader@example.com' },
      { ...validPayload, email: '' },
      { ...validPayload, pageUrl: 'http://localhost:4321/note' },
    ]) {
      expect(parsed(raw)).toEqual(raw)
    }
  })

  test.each(
    [
      null,
      false,
      42,
      'text',
      [],
      {},
      { ...validPayload, comment: 42 },
      { ...validPayload, pageUrl: null },
      { ...validPayload, paragraphId: 123 },
      { ...validPayload, paragraphText: null },
      { ...validPayload, email: 123 },
      { ...validPayload, email: null },
    ].map((raw) => [raw]),
  )('rejects invalid JSON shape: %j', (raw) => {
    expect(parseComment(raw).tag).toBe('error')
  })

  test('requires every text field and rejects malformed content', () => {
    for (const key of ['pageUrl', 'paragraphId', 'paragraphText', 'comment']) {
      expect(
        parseComment(Object.fromEntries(Object.entries(validPayload).filter(([k]) => k !== key)))
          .tag,
      ).toBe('error')
    }
    expect(error({ ...validPayload, comment: '' })).toBe('Comment is empty')
    expect(error({ ...validPayload, comment: '  ' })).toBe('Comment is empty')
    expect(error({ ...validPayload, comment: 'x'.repeat(5001) })).toContain('5000')
    expect(error({ ...validPayload, pageUrl: 'https://evil.com/' })).toContain('Invalid page URL')
    expect(error({ ...validPayload, paragraphId: 'bad-id' })).toContain('Invalid paragraph ID')
    expect(error({ ...validPayload, email: 'invalid' })).toContain('Invalid email')
  })

  test('accepts the length limit and empty paragraph text', () => {
    expect(
      parsed({ ...validPayload, comment: 'x'.repeat(5000), paragraphText: '' }).comment.length,
    ).toBe(5000)
  })

  test('is total for arbitrary JSON and successful parses round-trip', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        const result = parseComment(raw)
        if (result.tag === 'ok')
          expect(parseComment(JSON.parse(JSON.stringify(result.value)))).toEqual(result)
        else expect(result.error.message.length).toBeGreaterThan(0)
      }),
    )
  })

  test('constructs a fresh payload containing only domain fields', () => {
    const raw = { ...validPayload, extra: 'ignored' }
    const payload = parsed(raw)
    raw.comment = ''
    expect(payload).toEqual(validPayload)
  })
})

describe('email builders', () => {
  test('formats subject and body', () => {
    const payload = parsed(validPayload)
    expect(buildSubject(payload)).toBe('Comment on /some-note')
    expect(buildBody(payload)).toContain('Page: https://beathagenlocher.com/some-note#p-abcd1234')
    expect(buildBody(payload)).toContain('Paragraph (p-abcd1234): This is the paragraph text.')
    expect(buildBody(payload)).toContain('Great point!')
    expect(buildBody(payload)).toContain('From: (no reply-to email submitted)')
    expect(buildBody(parsed({ ...validPayload, email: '' }))).toContain(
      'From: (no reply-to email submitted)',
    )
    expect(buildBody(parsed({ ...validPayload, email: 'reader@example.com' }))).toContain(
      'From: reader@example.com',
    )
  })
})

describe('delivery machine', () => {
  test('starts delivery directly and records success', () => {
    const payload = parsed(validPayload)
    const [model, cmd] = init(payload, config)
    expect(model).toEqual({ tag: 'sending_email', payload })
    expect(cmd).toEqual({
      tag: 'send_email',
      ...config,
      subject: buildSubject(payload),
      body: buildBody(payload),
    })
    expect(update(model, { tag: 'email_sent' })).toEqual([
      { tag: 'done', message: `Comment received for ${payload.pageUrl}` },
      { tag: 'done' },
    ])
  })

  test('records delivery failure', () => {
    const [model] = init(parsed(validPayload), config)
    expect(update(model, { tag: 'failed', error: 'Unavailable' })).toEqual([
      { tag: 'failed', error: 'Unavailable' },
      { tag: 'done' },
    ])
  })

  test('terminal states remain terminal for arbitrary late messages', () => {
    const terminal: fc.Arbitrary<Exclude<Model, { tag: 'sending_email' }>> = fc.oneof(
      fc.string().map((message) => ({ tag: 'done' as const, message })),
      fc.string().map((error) => ({ tag: 'failed' as const, error })),
    )
    const messages: fc.Arbitrary<Msg> = fc.oneof(
      fc.constant({ tag: 'email_sent' as const }),
      fc.string().map((error) => ({ tag: 'failed' as const, error })),
    )
    fc.assert(
      fc.property(terminal, fc.array(messages), (initial, messages) => {
        let model = initial
        for (const message of messages) {
          const [next, cmd] = update(model, message)
          expect(next).toEqual(initial)
          expect(cmd).toEqual({ tag: 'done' })
          model = next
        }
      }),
    )
  })
})
