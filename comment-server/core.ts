// ============================================================================
// Payload — Incoming comment data
// ============================================================================

export type CommentPayload = {
  pageUrl: string
  paragraphId: string
  paragraphText: string
  comment: string
  email?: string
}

// ============================================================================
// Cmd — Effects as data
// ============================================================================

export type Cmd =
  | { tag: 'done' }
  | { tag: 'validate_payload'; payload: CommentPayload }
  | { tag: 'send_email'; from: string; to: string; subject: string; body: string }

// ============================================================================
// Msg — Results from executed effects
// ============================================================================

export type Msg =
  | { tag: 'payload_valid'; payload: CommentPayload }
  | { tag: 'email_sent' }
  | { tag: 'failed'; error: string }

// ============================================================================
// Model — Discriminated union of all states
// ============================================================================

export type Model =
  | { tag: 'validating'; payload: CommentPayload }
  | { tag: 'sending_email'; payload: CommentPayload }
  | { tag: 'done'; message: string }
  | { tag: 'failed'; error: string }

// ============================================================================
// Validation — Pure functions
// ============================================================================

const PARAGRAPH_ID_RE = /^p-[a-f0-9]{8}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAGE_URL_PREFIX = 'https://beathagenlocher.com/'

export const validatePayload = (p: CommentPayload): string | undefined => {
  if (!p.comment || p.comment.trim().length === 0) return 'Comment is empty'
  if (p.comment.length > 5000) return 'Comment exceeds 5000 characters'
  // if (!p.pageUrl.startsWith(PAGE_URL_PREFIX)) return `Invalid page URL: must start with ${PAGE_URL_PREFIX}`
  if (!PARAGRAPH_ID_RE.test(p.paragraphId)) return `Invalid paragraph ID: ${p.paragraphId}`
  if (p.email !== undefined && p.email.length > 0 && !EMAIL_RE.test(p.email))
    return `Invalid email: ${p.email}`
  return undefined
}

// ============================================================================
// Email builders — Pure functions
// ============================================================================

export const buildSubject = (p: CommentPayload): string =>
  `Comment on ${p.pageUrl.replace(PAGE_URL_PREFIX, '/')}`

export const buildBody = (p: CommentPayload): string =>
  [
    `Page: ${p.pageUrl}#${p.paragraphId}`,
    `Paragraph (${p.paragraphId}): ${p.paragraphText}`,
    p.email ? `From: ${p.email}` : '',
    '',
    '---',
    '',
    p.comment,
  ]
    .filter((line) => line !== '' || true)
    .join('\n')

// ============================================================================
// Init
// ============================================================================

export const init = (payload: CommentPayload): [Model, Cmd] => [
  { tag: 'validating', payload },
  { tag: 'validate_payload', payload },
]

// ============================================================================
// Update — Pure state transitions
// ============================================================================

export const update = (
  model: Model,
  msg: Msg,
  config: { from: string; to: string },
): [Model, Cmd] => {
  if (msg.tag === 'failed') {
    return [{ tag: 'failed', error: msg.error }, { tag: 'done' }]
  }

  switch (model.tag) {
    case 'validating': {
      if (msg.tag !== 'payload_valid')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      return [
        { tag: 'sending_email', payload: msg.payload },
        {
          tag: 'send_email',
          from: config.from,
          to: config.to,
          subject: buildSubject(msg.payload),
          body: buildBody(msg.payload),
        },
      ]
    }

    case 'sending_email': {
      if (msg.tag !== 'email_sent')
        return [
          { tag: 'failed', error: `Unexpected msg ${msg.tag} in ${model.tag}` },
          { tag: 'done' },
        ]

      return [
        { tag: 'done', message: `Comment received for ${model.payload.pageUrl}` },
        { tag: 'done' },
      ]
    }

    case 'done':
    case 'failed':
      return [model, { tag: 'done' }]
  }
}
