import { describe, test, expect } from 'bun:test'
import {
  type CommentPayload,
  type Model,
  type Msg,
  validatePayload,
  buildSubject,
  buildBody,
  init,
  update,
} from './core'

const validPayload: CommentPayload = {
  pageUrl: 'https://beathagenlocher.com/some-note',
  paragraphId: 'p-abcd1234',
  paragraphText: 'This is the paragraph text.',
  comment: 'Great point!',
}

const config = { from: 'comments@beathagenlocher.com', to: 'beat@example.com' }

// ============================================================================
// Validation
// ============================================================================

describe('validatePayload', () => {
  test('accepts valid payload', () => {
    expect(validatePayload(validPayload)).toBeUndefined()
  })

  test('accepts valid payload with email', () => {
    expect(validatePayload({ ...validPayload, email: 'reader@example.com' })).toBeUndefined()
  })

  test('accepts valid payload with empty email', () => {
    expect(validatePayload({ ...validPayload, email: '' })).toBeUndefined()
  })

  test('rejects empty comment', () => {
    expect(validatePayload({ ...validPayload, comment: '' })).toBe('Comment is empty')
  })

  test('rejects whitespace-only comment', () => {
    expect(validatePayload({ ...validPayload, comment: '   ' })).toBe('Comment is empty')
  })

  test('rejects comment over 5000 chars', () => {
    expect(validatePayload({ ...validPayload, comment: 'a'.repeat(5001) })).toBe(
      'Comment exceeds 5000 characters',
    )
  })

  test('rejects invalid page URL', () => {
    const result = validatePayload({ ...validPayload, pageUrl: 'https://evil.com/page' })
    expect(result).toContain('Invalid page URL')
  })

  test('rejects invalid paragraph ID', () => {
    const result = validatePayload({ ...validPayload, paragraphId: 'bad-id' })
    expect(result).toContain('Invalid paragraph ID')
  })

  test('rejects invalid email', () => {
    const result = validatePayload({ ...validPayload, email: 'not-an-email' })
    expect(result).toContain('Invalid email')
  })
})

// ============================================================================
// Email builders
// ============================================================================

describe('buildSubject', () => {
  test('formats subject from page URL', () => {
    expect(buildSubject(validPayload)).toBe('Comment on /some-note')
  })
})

describe('buildBody', () => {
  test('includes all fields', () => {
    const body = buildBody(validPayload)
    expect(body).toContain('Page: https://beathagenlocher.com/some-note')
    expect(body).toContain('Paragraph (p-abcd1234): This is the paragraph text.')
    expect(body).toContain('Great point!')
  })

  test('includes email when present', () => {
    const body = buildBody({ ...validPayload, email: 'reader@example.com' })
    expect(body).toContain('From: reader@example.com')
  })
})

// ============================================================================
// Init
// ============================================================================

describe('init', () => {
  test('returns validating model and validate_payload cmd', () => {
    const [model, cmd] = init(validPayload)
    expect(model.tag).toBe('validating')
    expect(cmd.tag).toBe('validate_payload')
  })
})

// ============================================================================
// Update — Happy path
// ============================================================================

describe('update — happy path', () => {
  test('validating + payload_valid → sending_email + send_email', () => {
    const model: Model = { tag: 'validating', payload: validPayload }
    const msg: Msg = { tag: 'payload_valid', payload: validPayload }
    const [next, cmd] = update(model, msg, config)

    expect(next.tag).toBe('sending_email')
    expect(cmd.tag).toBe('send_email')
    if (cmd.tag === 'send_email') {
      expect(cmd.from).toBe(config.from)
      expect(cmd.to).toBe(config.to)
    }
  })

  test('sending_email + email_sent → done', () => {
    const model: Model = { tag: 'sending_email', payload: validPayload }
    const msg: Msg = { tag: 'email_sent' }
    const [next, cmd] = update(model, msg, config)

    expect(next.tag).toBe('done')
    expect(cmd.tag).toBe('done')
  })
})

// ============================================================================
// Update — Failure handling
// ============================================================================

describe('update — failures', () => {
  test('failed msg from any state → failed model', () => {
    const model: Model = { tag: 'validating', payload: validPayload }
    const msg: Msg = { tag: 'failed', error: 'Something broke' }
    const [next, cmd] = update(model, msg, config)

    expect(next.tag).toBe('failed')
    if (next.tag === 'failed') expect(next.error).toBe('Something broke')
    expect(cmd.tag).toBe('done')
  })

  test('unexpected msg in validating → failed', () => {
    const model: Model = { tag: 'validating', payload: validPayload }
    const msg: Msg = { tag: 'email_sent' }
    const [next] = update(model, msg, config)

    expect(next.tag).toBe('failed')
  })

  test('terminal states are idempotent', () => {
    const doneModel: Model = { tag: 'done', message: 'ok' }
    const [next, cmd] = update(doneModel, { tag: 'email_sent' }, config)
    expect(next.tag).toBe('done')
    expect(cmd.tag).toBe('done')
  })
})
