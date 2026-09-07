export type Result<T, E> = { tag: 'ok'; value: T } | { tag: 'error'; error: E }
export type InputError = { message: string }

export type CommentPayload = Readonly<{
  pageUrl: string
  paragraphId: string
  paragraphText: string
  comment: string
  email?: string
}>

const PARAGRAPH_ID_RE = /^p-[a-f0-9]{8}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAGE_URL_PREFIX = 'https://beathagenlocher.com/'
const DEV_PAGE_URL_PREFIX = 'http://localhost:'

const invalid = (message: string): Result<never, InputError> => ({
  tag: 'error',
  error: { message },
})

/** Parse untrusted JSON once, before it enters the delivery machine. */
export const parseComment = (raw: unknown): Result<CommentPayload, InputError> => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return invalid('Comment payload must be an object')
  if (!('comment' in raw) || typeof raw.comment !== 'string')
    return invalid('Comment must be a string')
  if (!('pageUrl' in raw) || typeof raw.pageUrl !== 'string')
    return invalid('Page URL must be a string')
  if (!('paragraphId' in raw) || typeof raw.paragraphId !== 'string')
    return invalid('Paragraph ID must be a string')
  if (!('paragraphText' in raw) || typeof raw.paragraphText !== 'string')
    return invalid('Paragraph text must be a string')
  const email = 'email' in raw ? raw.email : undefined
  if (email !== undefined && typeof email !== 'string') return invalid('Email must be a string')

  if (raw.comment.trim().length === 0) return invalid('Comment is empty')
  if (raw.comment.length > 5000) return invalid('Comment exceeds 5000 characters')
  if (!raw.pageUrl.startsWith(PAGE_URL_PREFIX) && !raw.pageUrl.startsWith(DEV_PAGE_URL_PREFIX))
    return invalid(`Invalid page URL: must start with ${PAGE_URL_PREFIX}`)
  if (!PARAGRAPH_ID_RE.test(raw.paragraphId))
    return invalid(`Invalid paragraph ID: ${raw.paragraphId}`)
  if (email !== undefined && email.length > 0 && !EMAIL_RE.test(email))
    return invalid(`Invalid email: ${email}`)

  return {
    tag: 'ok',
    value: {
      pageUrl: raw.pageUrl,
      paragraphId: raw.paragraphId,
      paragraphText: raw.paragraphText,
      comment: raw.comment,
      ...(email === undefined ? {} : { email }),
    },
  }
}

export const buildSubject = (p: CommentPayload): string =>
  `Comment on ${p.pageUrl.replace(PAGE_URL_PREFIX, '/')}`

export const buildBody = (p: CommentPayload): string =>
  [
    `Page: ${p.pageUrl}#${p.paragraphId}`,
    `Paragraph (${p.paragraphId}): ${p.paragraphText}`,
    p.email ? `From: ${p.email}` : 'From: (no reply-to email submitted)',
    '',
    '---',
    '',
    p.comment,
  ].join('\n')

export type EmailConfig = { from: string; to: string }
export type SendEmail = {
  tag: 'send_email'
  from: string
  to: string
  subject: string
  body: string
}
export type Cmd = { tag: 'done' } | SendEmail
export type Msg = { tag: 'email_sent' } | { tag: 'failed'; error: string }
export type Model = Sending | Terminal
type Sending = { tag: 'sending_email'; payload: CommentPayload }
type Terminal = { tag: 'done'; message: string } | { tag: 'failed'; error: string }

export const init = (payload: CommentPayload, config: EmailConfig): [Sending, SendEmail] => [
  { tag: 'sending_email', payload },
  { tag: 'send_email', ...config, subject: buildSubject(payload), body: buildBody(payload) },
]

export const update = (model: Model, msg: Msg): [Terminal, { tag: 'done' }] => {
  switch (model.tag) {
    case 'sending_email':
      switch (msg.tag) {
        case 'email_sent':
          return [
            { tag: 'done', message: `Comment received for ${model.payload.pageUrl}` },
            { tag: 'done' },
          ]
        case 'failed':
          return [{ tag: 'failed', error: msg.error }, { tag: 'done' }]
      }
    case 'done':
    case 'failed':
      return [model, { tag: 'done' }]
  }
}
