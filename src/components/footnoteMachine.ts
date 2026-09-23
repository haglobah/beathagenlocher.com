import { absurd } from '../utils'

type Closed = { readonly t: 'Closed' }
type Open = { readonly t: 'Open' }
type Closing = { readonly t: 'Closing' }
export type State = Closed | Open | Closing
export const State = {
  Closed: (): Closed => ({ t: 'Closed' }),
  Open: (): Open => ({ t: 'Open' }),
  Closing: (): Closing => ({ t: 'Closing' }),
}

type Show = { readonly t: 'Show' }
type KeepOpen = { readonly t: 'KeepOpen' }
type Leave = { readonly t: 'Leave' }
type Dismiss = { readonly t: 'Dismiss' }
type CloseElapsed = { readonly t: 'CloseElapsed'; readonly engagement: 'Engaged' | 'Absent' }
type Escape = { readonly t: 'Escape'; readonly focus: 'Preview' | 'Elsewhere' }
type Reposition = { readonly t: 'Reposition' }
export type Msg = Show | KeepOpen | Leave | Dismiss | CloseElapsed | Escape | Reposition
export const Msg = {
  Show: (): Show => ({ t: 'Show' }),
  KeepOpen: (): KeepOpen => ({ t: 'KeepOpen' }),
  Leave: (): Leave => ({ t: 'Leave' }),
  Dismiss: (): Dismiss => ({ t: 'Dismiss' }),
  CloseElapsed: (engagement: CloseElapsed['engagement']): CloseElapsed => ({
    t: 'CloseElapsed',
    engagement,
  }),
  Escape: (focus: Escape['focus']): Escape => ({ t: 'Escape', focus }),
  Reposition: (): Reposition => ({ t: 'Reposition' }),
}

type Hide = { readonly t: 'Hide' }
type Position = { readonly t: 'Position' }
type CancelClose = { readonly t: 'CancelClose' }
type ScheduleClose = { readonly t: 'ScheduleClose' }
type ReturnFocus = { readonly t: 'ReturnFocus' }
export type Cmd = Show | Hide | Position | CancelClose | ScheduleClose | ReturnFocus
export const Cmd = {
  Show: (): Show => ({ t: 'Show' }),
  Hide: (): Hide => ({ t: 'Hide' }),
  Position: (): Position => ({ t: 'Position' }),
  CancelClose: (): CancelClose => ({ t: 'CancelClose' }),
  ScheduleClose: (): ScheduleClose => ({ t: 'ScheduleClose' }),
  ReturnFocus: (): ReturnFocus => ({ t: 'ReturnFocus' }),
}

export function update(state: State, msg: Msg): [State, Cmd[]] {
  switch (msg.t) {
    case 'Show':
      return [State.Open(), [Cmd.CancelClose(), Cmd.Show()]]
    case 'KeepOpen':
      return state.t === 'Closed' ? [state, []] : [State.Open(), [Cmd.CancelClose()]]
    case 'Leave':
      return state.t === 'Closed' ? [state, []] : [State.Closing(), [Cmd.ScheduleClose()]]
    case 'CloseElapsed':
      if (state.t !== 'Closing') return [state, []]
      return msg.engagement === 'Engaged' ? [State.Open(), []] : [State.Closed(), [Cmd.Hide()]]
    case 'Dismiss':
      return [State.Closed(), [Cmd.CancelClose(), Cmd.Hide()]]
    case 'Escape':
      if (state.t === 'Closed') return [state, []]
      // Focusing dispatches Show synchronously. Dismiss after that event completes.
      return msg.focus === 'Preview' ? [state, [Cmd.ReturnFocus()]] : update(state, Msg.Dismiss())
    case 'Reposition':
      return [state, state.t === 'Closed' ? [] : [Cmd.Position()]]
    default:
      return absurd(msg)
  }
}

/** Parse DOM engagement once, where the browser supplies the current hover/focus state. */
export function readEngagement(
  reference: HTMLAnchorElement,
  preview: HTMLElement,
): CloseElapsed['engagement'] {
  return reference.matches(':hover, :focus') || preview.matches(':hover, :focus-within')
    ? 'Engaged'
    : 'Absent'
}

export function execute(reference: HTMLAnchorElement, preview: HTMLElement) {
  const description = reference.getAttribute('aria-describedby')
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  function position() {
    const anchor = reference.getBoundingClientRect()
    const box = preview.getBoundingClientRect()
    const margin = 12
    const below = anchor.bottom + 8
    const above = anchor.top - box.height - 8
    preview.style.left = `${Math.max(margin, Math.min(anchor.left - 12, window.innerWidth - box.width - margin))}px`
    preview.style.top = `${Math.max(margin, Math.min(below + box.height <= window.innerHeight - margin ? below : above, window.innerHeight - box.height - margin))}px`
  }
  return (cmd: Cmd, dispatch: (msg: Msg) => void): void => {
    switch (cmd.t) {
      case 'Show':
        preview.hidden = false
        reference.setAttribute(
          'aria-describedby',
          [description, preview.id].filter(Boolean).join(' '),
        )
        position()
        break
      case 'Hide':
        preview.hidden = true
        if (description) reference.setAttribute('aria-describedby', description)
        else reference.removeAttribute('aria-describedby')
        break
      case 'Position':
        position()
        break
      case 'CancelClose':
        clearTimeout(closeTimer)
        closeTimer = undefined
        break
      case 'ScheduleClose':
        clearTimeout(closeTimer)
        closeTimer = setTimeout(() => {
          closeTimer = undefined
          dispatch(Msg.CloseElapsed(readEngagement(reference, preview)))
        }, 150)
        break
      case 'ReturnFocus':
        reference.focus()
        dispatch(Msg.Dismiss())
        break
      default:
        absurd(cmd)
    }
  }
}

export type Target =
  | { readonly t: 'Ready'; readonly note: HTMLElement }
  | { readonly t: 'Invalid'; readonly reason: string }
export function parseTarget(reference: HTMLAnchorElement): Target {
  const href = reference.getAttribute('href')
  if (!href?.startsWith('#')) return { t: 'Invalid', reason: 'Expected a footnote fragment link' }
  let id: string
  try {
    id = decodeURIComponent(href.slice(1))
  } catch {
    return { t: 'Invalid', reason: `Malformed footnote fragment: ${href}` }
  }
  const note = reference.ownerDocument.getElementById(id)
  return note ? { t: 'Ready', note } : { t: 'Invalid', reason: `Missing footnote target: ${id}` }
}
