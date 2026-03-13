import { createEffect, onCleanup, onMount, Match, Switch, type JSXElement } from 'solid-js'
import { tag, createUpdater, type Tagged } from '../utils'

// --- Domain types ---

type FormData = { comment: string; email: string }

type Idle = Tagged<'Idle'>
type Closed = Tagged<'Closed', FormData>
type Composing = Tagged<'Composing', FormData>
type Submitting = Tagged<'Submitting', FormData>
type Sent = Tagged<'Sent'>
type Error = Tagged<'Error', FormData & { errorMsg: string }>

type State = Idle | Closed | Composing | Submitting | Sent | Error

const State = {
  Idle: tag('Idle'),
  Closed: (comment: string, email: string): Closed => tag('Closed')({ comment, email }),
  Composing: (comment: string, email: string): Composing => tag('Composing')({ comment, email }),
  Submitting: (comment: string, email: string): Submitting => tag('Submitting')({ comment, email }),
  Sent: tag('Sent'),
  Error: (comment: string, email: string, errorMsg: string): Error =>
    tag('Error')({ comment, email, errorMsg }),
} as const

// Messages: what happened
type Toggle = Tagged<'Toggle'>
type Close = Tagged<'Close'>
type UpdateComment = Tagged<'UpdateComment', { comment: string }>
type UpdateEmail = Tagged<'UpdateEmail', { email: string }>
type Submit = Tagged<'Submit'>
type SubmitOk = Tagged<'SubmitOk'>
type SubmitFail = Tagged<'SubmitFail', { errorMsg: string }>
type Reset = Tagged<'Reset'>
type Retry = Tagged<'Retry'>

type Msg =
  | Toggle
  | Close
  | UpdateComment
  | UpdateEmail
  | Submit
  | SubmitOk
  | SubmitFail
  | Reset
  | Retry

const Msg = {
  Toggle: tag('Toggle'),
  Close: tag('Close'),
  UpdateComment: (comment: string): UpdateComment => tag('UpdateComment')({ comment }),
  UpdateEmail: (email: string): UpdateEmail => tag('UpdateEmail')({ email }),
  Submit: tag('Submit'),
  SubmitOk: tag('SubmitOk'),
  SubmitFail: (errorMsg: string): SubmitFail => tag('SubmitFail')({ errorMsg }),
  Reset: tag('Reset'),
  Retry: tag('Retry'),
} as const

// Commands: what should happen
type None = Tagged<'None'>
type PostComment = Tagged<'PostComment', FormData>
type AutoReset = Tagged<'AutoReset'>

type Cmd = None | PostComment | AutoReset

const Cmd = {
  None: tag('None'),
  PostComment: (comment: string, email: string): PostComment =>
    tag('PostComment')({ comment, email }),
  AutoReset: tag('AutoReset'),
} as const

// --- Pure update ---

const update = (state: State, msg: Msg): [State, Cmd] => {
  switch (msg.t) {
    case 'Toggle':
      switch (state.t) {
        case 'Idle':
          return [State.Composing('', ''), Cmd.None()]
        case 'Closed':
          return [State.Composing(state.comment, state.email), Cmd.None()]
        case 'Composing':
          return [State.Closed(state.comment, state.email), Cmd.None()]
        default:
          return [state, Cmd.None()]
      }

    case 'Close':
      if (state.t === 'Composing') return [State.Closed(state.comment, state.email), Cmd.None()]
      return [state, Cmd.None()]

    case 'UpdateComment':
      if (state.t === 'Composing') return [State.Composing(msg.comment, state.email), Cmd.None()]
      return [state, Cmd.None()]

    case 'UpdateEmail':
      if (state.t === 'Composing') return [State.Composing(state.comment, msg.email), Cmd.None()]
      return [state, Cmd.None()]

    case 'Submit':
      if (state.t === 'Composing' && state.comment.trim().length > 0)
        return [
          State.Submitting(state.comment, state.email),
          Cmd.PostComment(state.comment, state.email),
        ]
      return [state, Cmd.None()]

    case 'SubmitOk':
      return [State.Sent(), Cmd.AutoReset()]

    case 'SubmitFail':
      if (state.t === 'Submitting')
        return [State.Error(state.comment, state.email, msg.errorMsg), Cmd.None()]
      return [state, Cmd.None()]

    case 'Reset':
      return [State.Idle(), Cmd.None()]

    case 'Retry':
      if (state.t === 'Error') return [State.Composing(state.comment, state.email), Cmd.None()]
      return [state, Cmd.None()]

    default: {
      const _exhaustive: never = msg
      return _exhaustive
    }
  }
}

// --- Effect executor ---

const COMMENT_SERVER_URL = import.meta.env.PUBLIC_COMMENT_SERVER_URL ?? 'http://localhost:3001'

async function hashParagraphId(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return (
    'p-' +
    hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 8)
  )
}

const makeExecutor =
  (getParagraphEl: () => Element | null) =>
  (cmd: Cmd, dispatch: (msg: Msg) => void): void => {
    switch (cmd.t) {
      case 'PostComment': {
        const paragraphText = getParagraphEl()?.textContent ?? ''
        ;(async () => {
          try {
            const paragraphId = await hashParagraphId(paragraphText)
            const payload = {
              pageUrl: window.location.href.split('#')[0],
              paragraphId,
              paragraphText: paragraphText.slice(0, 200),
              comment: cmd.comment,
              ...(cmd.email ? { email: cmd.email } : {}),
            }
            const resp = await fetch(`${COMMENT_SERVER_URL}/comment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            if (!resp.ok) {
              const data = await resp.json().catch(() => ({ message: 'Request failed' }))
              throw new Error(data.message ?? `HTTP ${resp.status}`)
            }
            dispatch(Msg.SubmitOk())
          } catch (e) {
            dispatch(Msg.SubmitFail(e instanceof Error ? e.message : String(e)))
          }
        })()
        break
      }
      case 'AutoReset':
        setTimeout(() => dispatch(Msg.Reset()), 2000)
        break
      case 'None':
        break
    }
  }

// --- Component ---

export default function CommentButton(): JSXElement {
  let containerRef: HTMLDivElement | undefined

  const getParentPar = () => containerRef?.closest('.commentable-par') ?? null
  const getParagraphEl = () => getParentPar()?.querySelector('p') ?? null

  const [store, dispatch] = createUpdater<State, Msg, Cmd>(
    update,
    State.Idle() as State,
    makeExecutor(getParagraphEl),
  )

  const isOpen = () => store.t !== 'Idle' && store.t !== 'Closed'

  createEffect(() => {
    const par = getParentPar()
    if (par instanceof HTMLElement) {
      par.classList.toggle('comment-active', isOpen())
    }
  })

  const handleClickOutside = (e: MouseEvent) => {
    if (!isOpen()) return
    const target = e.target as Node
    const parent = getParentPar()
    if (parent && !parent.contains(target)) {
      dispatch(Msg.Close())
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      dispatch(Msg.Submit())
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      dispatch(Msg.Close())
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside)
    onCleanup(() => {
      document.removeEventListener('click', handleClickOutside)
    })
  })

  return (
    <div ref={containerRef}>
      {/* Flag button — absolute positioned to the left of the paragraph */}
      <div class="absolute -left-10 top-1 hidden md:block">
        <button
          onClick={() => dispatch(Msg.Toggle())}
          class="op-0 group-hover:op-40 hover:!op-100 transition-opacity cursor-pointer text-cornflower-400 bg-transparent border-none p-0"
          classList={{ '!op-100': isOpen() }}
          aria-label="Comment on this paragraph"
          title="Comment on this paragraph"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="transparent"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <g transform="translate(24,0) scale(-1,1)">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </g>
          </svg>
        </button>
      </div>

      {/* Inline form — expands below the paragraph */}
      <Switch>
        <Match when={isOpen() && (store.t === 'Composing' || store.t === 'Submitting')}>
          <div class="mt-2 max-w-[65ch] rounded-xl bg-spacecadet-light shadow-[inset_0_1px_0_0_rgba(148,163,184,0.1)] drop-shadow-lg p-3">
            <textarea
              value={(store as Composing | Submitting).comment}
              onInput={(e) => dispatch(Msg.UpdateComment(e.currentTarget.value))}
              onKeyDown={handleKeyDown}
              placeholder="Your comment..."
              disabled={store.t === 'Submitting'}
              class="w-full min-h-24 field-sizing-content font-mono resize-none rounded bg-spacecadet-light p-2 text-sm focus:outline-none"
              autofocus
            />
            <div class="mt-2 flex gap-2 justify-end">
              <input
                type="email"
                value={(store as Composing | Submitting).email}
                onInput={(e) => dispatch(Msg.UpdateEmail(e.currentTarget.value))}
                placeholder="Email (optional)"
                disabled={store.t === 'Submitting'}
                class="rounded font-mono flex-1 p-2 text-sm focus:outline-none bg-zinc-700"
              />
              <button
                onClick={() => dispatch(Msg.Reset())}
                disabled={store.t === 'Submitting'}
                class="text-sm p-2 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => dispatch(Msg.Submit())}
                disabled={
                  store.t === 'Submitting' ||
                  (store as Composing | Submitting).comment.trim().length === 0
                }
                class="text-sm p-2 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:op-50 cursor-pointer"
              >
                {store.t === 'Submitting' ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </Match>

        <Match when={isOpen() && store.t === 'Sent'}>
          <div class="mt-2 max-w-[65ch] p-3 rounded-xl bg-spacecadet-light">
            <span class="text-sm text-green-600 dark:text-green-400">Sent!</span>
          </div>
        </Match>

        <Match when={isOpen() && store.t === 'Error'}>
          <div class="mt-2 max-w-[65ch] rounded-xl bg-spacecadet-light p-3">
            <p class="text-sm font-mono text-red-700 dark:text-red-800 mb-2">
              {(store as Error).errorMsg}
            </p>
            <div class="flex gap-2 justify-end">
              <button
                onClick={() => dispatch(Msg.Reset())}
                class="text-sm p-2 rounded bg-zinc-700 hover:bg-zinc-600 cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={() => dispatch(Msg.Retry())}
                class="text-sm p-2 rounded bg-zinc-700 hover:bg-zinc-600 cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        </Match>
      </Switch>
    </div>
  )
}
