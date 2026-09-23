import * as Footnote from './footnoteMachine'

/** Enhance native footnote anchors; navigation still works without JavaScript. */
export function setupFootnotePreviews() {
  for (const reference of document.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]')) {
    const target = Footnote.parseTarget(reference)
    if (target.t === 'Invalid') {
      console.warn(target.reason, reference)
      continue
    }
    const note = target.note

    const preview = document.createElement('div')
    preview.className = 'footnote-preview'
    preview.id = `${reference.id}-preview`
    preview.setAttribute('role', 'note')
    preview.setAttribute('aria-label', `Footnote ${reference.textContent}`)
    preview.hidden = true
    const content = note.cloneNode(true) as HTMLElement
    content
      .querySelectorAll('[data-footnote-backref], .comment-trigger')
      .forEach((el) => el.remove())
    content.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
    // Unwrap comment controls' containers, keeping the authored paragraph content.
    content.querySelectorAll('.commentable-par').forEach((el) => {
      const body = el.querySelector(':scope > [data-comment-content]')
      if (body) el.replaceWith(body)
    })
    preview.append(...Array.from(content.childNodes))
    document.body.append(preview)
    let state: Footnote.State = Footnote.State.Closed()
    const execute = Footnote.execute(reference, preview)
    const dispatch = (msg: Footnote.Msg): void => {
      const [next, commands] = Footnote.update(state, msg)
      state = next
      commands.forEach((command) => execute(command, dispatch))
    }
    reference.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') dispatch(Footnote.Msg.Show())
    })
    reference.addEventListener('focus', () => dispatch(Footnote.Msg.Show()))
    reference.addEventListener('click', () => dispatch(Footnote.Msg.Dismiss()))
    reference.addEventListener('pointerleave', () => dispatch(Footnote.Msg.Leave()))
    reference.addEventListener('blur', () => dispatch(Footnote.Msg.Leave()))
    preview.addEventListener('pointerenter', () => dispatch(Footnote.Msg.KeepOpen()))
    preview.addEventListener('pointerleave', () => dispatch(Footnote.Msg.Leave()))
    preview.addEventListener('focusin', () => dispatch(Footnote.Msg.KeepOpen()))
    preview.addEventListener('focusout', () => dispatch(Footnote.Msg.Leave()))
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape')
        dispatch(
          Footnote.Msg.Escape(preview.contains(document.activeElement) ? 'Preview' : 'Elsewhere'),
        )
    })
    document.addEventListener('pointerdown', (event) => {
      if (
        event.target instanceof Node &&
        !preview.contains(event.target) &&
        !reference.contains(event.target)
      )
        dispatch(Footnote.Msg.Dismiss())
    })
    window.addEventListener('resize', () => dispatch(Footnote.Msg.Reposition()))
    window.addEventListener('scroll', () => dispatch(Footnote.Msg.Reposition()), { passive: true })
  }
}
