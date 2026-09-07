import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Match,
  Show,
  Switch,
  type JSXElement,
} from 'solid-js'
import { Portal } from 'solid-js/web'
import { createUpdater } from '../utils'
import * as Comment from './commentMachine'

// --- Component ---

export default function CommentManager(): JSXElement {
  const [activePar, setActivePar] = createSignal<Element | null>(null)

  const [store, dispatch] = createUpdater<Comment.State, Comment.Msg, Comment.Cmd>(
    Comment.update,
    Comment.State.Idle(),
    Comment.execute({
      endpoint: import.meta.env.DEV
        ? (import.meta.env.PUBLIC_COMMENT_SERVER_URL ?? 'http://localhost:3007')
        : 'https://comments.beathagenlocher.com',
      fetch: (...args) => fetch(...args),
      schedule: (callback, delay) => setTimeout(callback, delay),
    }),
  )
  const form = () => Comment.selectForm(store)
  const failure = () => Comment.selectFailure(store)
  const submit = () => dispatch(Comment.Msg.Submit(crypto.randomUUID()))

  const isOpen = () => store.t !== 'Idle' && store.t !== 'Closed'

  // Highlight the active paragraph
  createEffect(() => {
    const par = activePar()
    if (par instanceof HTMLElement) {
      par.classList.toggle('comment-active', isOpen())
    }
  })

  // Event delegation: listen for clicks on any .comment-trigger button
  const handleClick = (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return
    const trigger = e.target.closest('.comment-trigger')
    if (trigger) {
      const par = trigger.closest('.commentable-par')
      if (!par) return

      if (par !== activePar() || store.t === 'Idle') {
        const prev = activePar()
        if (prev instanceof HTMLElement) prev.classList.remove('comment-active')
        setActivePar(par)
        dispatch(
          Comment.Msg.Select({
            interactionId: crypto.randomUUID(),
            pageUrl: window.location.href.split('#')[0],
            paragraphId: par.id,
            paragraphText:
              par
                .querySelector(':scope > p, :scope > ul, :scope > ol')
                ?.textContent?.trim()
                .slice(0, 200) ?? '',
          }),
        )
      } else {
        dispatch(Comment.Msg.Toggle())
      }
      return
    }

    // Click outside: close the form
    if (isOpen()) {
      const par = activePar()
      if (par && !par.contains(e.target)) {
        dispatch(Comment.Msg.Close())
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      dispatch(Comment.Msg.Close())
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClick)
    onCleanup(() => document.removeEventListener('click', handleClick))
  })

  return (
    <Show when={isOpen() && activePar()}>
      {(paragraph) => (
        <Portal mount={paragraph()}>
          <Switch>
            <Match when={form()}>
              {(form) => (
                <div class="mt-2 max-w-[65ch] rounded-xl bg-spacecadet-light shadow-[inset_0_1px_0_0_rgba(148,163,184,0.1)] drop-shadow-lg p-3">
                  <textarea
                    value={form().draft.comment}
                    onInput={(e) => dispatch(Comment.Msg.UpdateComment(e.currentTarget.value))}
                    onKeyDown={handleKeyDown}
                    placeholder="Your comment..."
                    disabled={store.t === 'Submitting'}
                    style="field-sizing: content"
                    class="w-full min-h-24 font-mono resize-none rounded bg-spacecadet-light p-2 text-sm focus:outline-none"
                    autofocus
                  />
                  <div class="mt-2 flex gap-2 justify-end">
                    <input
                      type="email"
                      value={form().draft.email}
                      onInput={(e) => dispatch(Comment.Msg.UpdateEmail(e.currentTarget.value))}
                      placeholder="Email (optional)"
                      disabled={store.t === 'Submitting'}
                      class="rounded font-mono flex-1 p-2 text-sm focus:outline-none bg-zinc-700"
                    />
                    <button
                      onClick={() => dispatch(Comment.Msg.Dismiss())}
                      disabled={store.t === 'Submitting'}
                      class="text-sm p-2 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => submit()}
                      disabled={
                        store.t === 'Submitting' || form().draft.comment.trim().length === 0
                      }
                      class="text-sm p-2 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:op-50 cursor-pointer"
                    >
                      {store.t === 'Submitting' ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </Match>

            <Match when={store.t === 'Sent'}>
              <div class="mt-2 max-w-[65ch] p-3 rounded-xl bg-spacecadet-light">
                <span class="text-sm text-green-600 dark:text-green-400">Sent!</span>
              </div>
            </Match>

            <Match when={failure()}>
              {(failure) => (
                <div class="mt-2 max-w-[65ch] rounded-xl bg-spacecadet-light p-3">
                  <p class="text-sm font-mono text-red-700 dark:text-red-800 mb-2">
                    {failure().reason}
                  </p>
                  <div class="flex gap-2 justify-end">
                    <button
                      onClick={() => dispatch(Comment.Msg.Dismiss())}
                      class="text-sm p-2 rounded bg-zinc-700 hover:bg-zinc-600 cursor-pointer"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => dispatch(Comment.Msg.Retry())}
                      class="text-sm p-2 rounded bg-zinc-700 hover:bg-zinc-600 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </Match>
          </Switch>
        </Portal>
      )}
    </Show>
  )
}
