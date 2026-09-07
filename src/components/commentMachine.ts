import { absurd } from '../utils'

export type Context = Readonly<{
  interactionId: string
  pageUrl: string
  paragraphId: string
  paragraphText: string
}>
export type Draft = Readonly<{ context: Context; comment: string; email: string }>
type Completion = Readonly<{ interactionId: string; requestId: string }>
type Submission = Readonly<{ draft: Draft; requestId: string }>
type Idle = { readonly t: 'Idle' }
type Closed = { readonly t: 'Closed'; readonly draft: Draft }
type Composing = { readonly t: 'Composing'; readonly draft: Draft }
type Submitting = { readonly t: 'Submitting' } & Submission
type Sent = { readonly t: 'Sent'; readonly context: Context; readonly requestId: string }
type Failed = { readonly t: 'Failed'; readonly draft: Draft; readonly reason: string }
export type State = Idle | Closed | Composing | Submitting | Sent | Failed
export const State = {
  Idle: (): Idle => ({ t: 'Idle' }),
  Closed: (draft: Draft): Closed => ({ t: 'Closed', draft }),
  Composing: (draft: Draft): Composing => ({ t: 'Composing', draft }),
  Submitting: (draft: Draft, requestId: string): Submitting => ({
    t: 'Submitting',
    draft,
    requestId,
  }),
  Sent: (context: Context, requestId: string): Sent => ({ t: 'Sent', context, requestId }),
  Failed: (draft: Draft, reason: string): Failed => ({ t: 'Failed', draft, reason }),
}

type Select = { readonly t: 'Select'; readonly context: Context }
type Toggle = { readonly t: 'Toggle' }
type Close = { readonly t: 'Close' }
type UpdateComment = { readonly t: 'UpdateComment'; readonly comment: string }
type UpdateEmail = { readonly t: 'UpdateEmail'; readonly email: string }
type Submit = { readonly t: 'Submit'; readonly requestId: string }
type SubmitOk = { readonly t: 'SubmitOk'; readonly completion: Completion }
type SubmitFail = {
  readonly t: 'SubmitFail'
  readonly completion: Completion
  readonly reason: string
}
type Reset = { readonly t: 'Reset'; readonly completion: Completion }
type Dismiss = { readonly t: 'Dismiss' }
type Retry = { readonly t: 'Retry' }
export type Msg =
  | Select
  | Toggle
  | Close
  | UpdateComment
  | UpdateEmail
  | Submit
  | SubmitOk
  | SubmitFail
  | Reset
  | Dismiss
  | Retry
export const Msg = {
  Select: (context: Context): Select => ({ t: 'Select', context }),
  Toggle: (): Toggle => ({ t: 'Toggle' }),
  Close: (): Close => ({ t: 'Close' }),
  UpdateComment: (comment: string): UpdateComment => ({ t: 'UpdateComment', comment }),
  UpdateEmail: (email: string): UpdateEmail => ({ t: 'UpdateEmail', email }),
  Submit: (requestId: string): Submit => ({ t: 'Submit', requestId }),
  SubmitOk: (completion: Completion): SubmitOk => ({ t: 'SubmitOk', completion }),
  SubmitFail: (completion: Completion, reason: string): SubmitFail => ({
    t: 'SubmitFail',
    completion,
    reason,
  }),
  Reset: (completion: Completion): Reset => ({ t: 'Reset', completion }),
  Dismiss: (): Dismiss => ({ t: 'Dismiss' }),
  Retry: (): Retry => ({ t: 'Retry' }),
}
type None = { readonly t: 'None' }
type PostComment = { readonly t: 'PostComment' } & Submission
type AutoReset = { readonly t: 'AutoReset'; readonly completion: Completion }
export type Cmd = None | PostComment | AutoReset
export const Cmd = {
  None: (): None => ({ t: 'None' }),
  PostComment: (draft: Draft, requestId: string): PostComment => ({
    t: 'PostComment',
    draft,
    requestId,
  }),
  AutoReset: (completion: Completion): AutoReset => ({ t: 'AutoReset', completion }),
}
const matches = (context: Context, requestId: string, completion: Completion): boolean =>
  context.interactionId === completion.interactionId && requestId === completion.requestId

export const update = (state: State, msg: Msg): [State, Cmd] => {
  switch (msg.t) {
    case 'Select':
      return [State.Composing({ context: msg.context, comment: '', email: '' }), Cmd.None()]
    case 'Toggle':
      if (state.t === 'Closed') return [State.Composing(state.draft), Cmd.None()]
      if (state.t === 'Composing') return [State.Closed(state.draft), Cmd.None()]
      break
    case 'Close':
      if (state.t === 'Composing') return [State.Closed(state.draft), Cmd.None()]
      break
    case 'UpdateComment':
      if (state.t === 'Composing')
        return [State.Composing({ ...state.draft, comment: msg.comment }), Cmd.None()]
      break
    case 'UpdateEmail':
      if (state.t === 'Composing')
        return [State.Composing({ ...state.draft, email: msg.email }), Cmd.None()]
      break
    case 'Submit':
      if (state.t === 'Composing' && state.draft.comment.trim())
        return [
          State.Submitting(state.draft, msg.requestId),
          Cmd.PostComment(state.draft, msg.requestId),
        ]
      break
    case 'SubmitOk':
      if (state.t === 'Submitting' && matches(state.draft.context, state.requestId, msg.completion))
        return [State.Sent(state.draft.context, state.requestId), Cmd.AutoReset(msg.completion)]
      break
    case 'SubmitFail':
      if (state.t === 'Submitting' && matches(state.draft.context, state.requestId, msg.completion))
        return [State.Failed(state.draft, msg.reason), Cmd.None()]
      break
    case 'Reset':
      if (state.t === 'Sent' && matches(state.context, state.requestId, msg.completion))
        return [State.Idle(), Cmd.None()]
      break
    case 'Dismiss':
      if (state.t === 'Composing' || state.t === 'Failed') return [State.Idle(), Cmd.None()]
      break
    case 'Retry':
      if (state.t === 'Failed') return [State.Composing(state.draft), Cmd.None()]
      break
    default:
      return absurd(msg)
  }
  return [state, Cmd.None()]
}

export const selectForm = (state: State): Composing | Submitting | undefined =>
  state.t === 'Composing' || state.t === 'Submitting' ? state : undefined
export const selectFailure = (state: State): Failed | undefined =>
  state.t === 'Failed' ? state : undefined

// The browser APIs are injected so transport and timer behavior can be tested without a DOM.
type Dependencies = {
  endpoint: string
  fetch: (url: string, options: RequestInit) => Promise<Response>
  schedule: (callback: () => void, delay: number) => void
}
const failureMessage = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    )
      return body.message
  } catch {
    /* A non-JSON error response still has an HTTP status. */
  }
  return `HTTP ${response.status}`
}
export const execute =
  (dependencies: Dependencies) =>
  (cmd: Cmd, dispatch: (msg: Msg) => void): void => {
    switch (cmd.t) {
      case 'PostComment': {
        const { context, comment, email } = cmd.draft
        // Capture identity before starting async work; never read the active UI paragraph here.
        const completion = { interactionId: context.interactionId, requestId: cmd.requestId }
        void (async () => {
          try {
            const response = await dependencies.fetch(`${dependencies.endpoint}/comment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pageUrl: context.pageUrl,
                paragraphId: context.paragraphId,
                paragraphText: context.paragraphText,
                comment,
                ...(email ? { email } : {}),
              }),
            })
            if (!response.ok) throw new Error(await failureMessage(response))
            dispatch(Msg.SubmitOk(completion))
          } catch (error) {
            dispatch(
              Msg.SubmitFail(completion, error instanceof Error ? error.message : String(error)),
            )
          }
        })()
        break
      }
      case 'AutoReset':
        dependencies.schedule(() => dispatch(Msg.Reset(cmd.completion)), 2000)
        break
      case 'None':
        break
      default:
        absurd(cmd)
    }
  }
