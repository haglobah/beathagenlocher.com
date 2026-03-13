import { createStore, reconcile } from 'solid-js/store'
import { Match, Switch, type JSXElement } from 'solid-js'

// --- Tagged union infrastructure ---

type Tagged<K extends string, T extends object = Record<string, never>> = { readonly t: K } & {
  readonly [P in keyof T]: T[P]
}

const tag =
  <K extends string>(t: K) =>
  <T extends object = Record<string, never>>(data?: T): Tagged<K, T> =>
    ({ t, ...data }) as Tagged<K, T>

// --- Domain types ---

type FormData = { comment: string; email: string }

// State: each variant carries exactly the data it needs
type Idle = Tagged<'Idle'>
type Composing = Tagged<'Composing', FormData>
type Submitting = Tagged<'Submitting', FormData>
type Sent = Tagged<'Sent'>
type Error = Tagged<'Error', FormData & { errorMsg: string }>

type State = Idle | Composing | Submitting | Sent | Error

const State = {
  Idle: tag('Idle'),
  Composing: (comment: string, email: string): Composing => tag('Composing')({ comment, email }),
  Submitting: (comment: string, email: string): Submitting => tag('Submitting')({ comment, email }),
  Sent: tag('Sent'),
  Error: (comment: string, email: string, errorMsg: string): Error =>
    tag('Error')({ comment, email, errorMsg }),
} as const

// Messages: what happened
type StartComposing = Tagged<'StartComposing'>
type UpdateComment = Tagged<'UpdateComment', { comment: string }>
type UpdateEmail = Tagged<'UpdateEmail', { email: string }>
type Submit = Tagged<'Submit'>
type SubmitOk = Tagged<'SubmitOk'>
type SubmitFail = Tagged<'SubmitFail', { errorMsg: string }>
type Reset = Tagged<'Reset'>
type Retry = Tagged<'Retry'>

type Msg =
  | StartComposing
  | UpdateComment
  | UpdateEmail
  | Submit
  | SubmitOk
  | SubmitFail
  | Reset
  | Retry

const Msg = {
  StartComposing: tag('StartComposing'),
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
type PostComment = Tagged<'PostComment', FormData & { paragraphEl: Element | null }>
type AutoReset = Tagged<'AutoReset'>

type Cmd = None | PostComment | AutoReset

const Cmd = {
  None: tag('None'),
  PostComment: (comment: string, email: string, paragraphEl: Element | null): PostComment =>
    tag('PostComment')({ comment, email, paragraphEl }),
  AutoReset: tag('AutoReset'),
} as const

// --- Pure update ---

const update = (state: State, msg: Msg, paragraphEl: Element | null): [State, Cmd] => {
  switch (msg.t) {
    case 'StartComposing':
      return [State.Composing('', ''), Cmd.None()]

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
          Cmd.PostComment(state.comment, state.email, paragraphEl),
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

const execute =
  (dispatch: (msg: Msg) => void) =>
  (cmd: Cmd): void => {
    switch (cmd.t) {
      case 'PostComment': {
        const paragraphText = cmd.paragraphEl?.textContent ?? ''
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
  const [store, setStore] = createStore<{ state: State }>({ state: State.Idle() })

  const getParagraphEl = () => containerRef?.closest('.commentable-par')?.querySelector('p') ?? null

  const dispatch = (msg: Msg): void => {
    const [newState, cmd] = update(store.state, msg, getParagraphEl())
    setStore(reconcile({ state: newState }))
    execute(dispatch)(cmd)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      dispatch(Msg.Submit())
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      dispatch(Msg.Reset())
    }
  }

  const s = () => store.state

  return (
    <div ref={containerRef} class="absolute -left-10 top-1 hidden md:block">
      <Switch>
        <Match when={s().t === 'Idle'}>
          <button
            onClick={() => dispatch(Msg.StartComposing())}
            class="op-0 group-hover:op-40 hover:!op-100 transition-opacity cursor-pointer text-cornflower-400"
            aria-label="Comment on this paragraph"
            title="Comment on this paragraph"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </Match>

        <Match when={s().t === 'Composing' || s().t === 'Submitting'}>
          <div class="absolute left-0 top-0 z-50 w-72 rounded-lg border border-cornflower-200 dark:border-cornflower-800 bg-white dark:bg-space-cadet-900 p-3 shadow-lg">
            <textarea
              value={(s() as Composing | Submitting).comment}
              onInput={(e) => dispatch(Msg.UpdateComment(e.currentTarget.value))}
              onKeyDown={handleKeyDown}
              placeholder="Your comment..."
              disabled={s().t === 'Submitting'}
              class="w-full h-24 resize-none rounded border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-sm focus:outline-none focus:border-cornflower-400"
              autofocus
            />
            <input
              type="email"
              value={(s() as Composing | Submitting).email}
              onInput={(e) => dispatch(Msg.UpdateEmail(e.currentTarget.value))}
              placeholder="Email (optional)"
              disabled={s().t === 'Submitting'}
              class="w-full mt-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-sm focus:outline-none focus:border-cornflower-400"
            />
            <div class="mt-2 flex gap-2 justify-end">
              <button
                onClick={() => dispatch(Msg.Reset())}
                disabled={s().t === 'Submitting'}
                class="text-sm px-2 py-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => dispatch(Msg.Submit())}
                disabled={
                  s().t === 'Submitting' ||
                  (s() as Composing | Submitting).comment.trim().length === 0
                }
                class="text-sm px-3 py-1 rounded bg-cornflower-500 text-white hover:bg-cornflower-600 disabled:op-50 cursor-pointer"
              >
                {s().t === 'Submitting' ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </Match>

        <Match when={s().t === 'Sent'}>
          <span class="text-sm text-green-600 dark:text-green-400">Sent!</span>
        </Match>

        <Match when={s().t === 'Error'}>
          <div class="absolute left-0 top-0 z-50 w-72 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-space-cadet-900 p-3 shadow-lg">
            <p class="text-sm text-red-600 dark:text-red-400 mb-2">{(s() as Error).errorMsg}</p>
            <div class="flex gap-2 justify-end">
              <button
                onClick={() => dispatch(Msg.Reset())}
                class="text-sm px-2 py-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={() => dispatch(Msg.Retry())}
                class="text-sm px-3 py-1 rounded bg-cornflower-500 text-white hover:bg-cornflower-600 cursor-pointer"
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
