/** Enhance native footnote anchors; navigation still works without JavaScript. */
export function setupFootnotePreviews() {
  for (const reference of document.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]')) {
    const href = reference.getAttribute('href')
    if (!href?.startsWith('#')) continue
    const note = document.getElementById(decodeURIComponent(href.slice(1)))
    if (!note) continue

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
    const description = reference.getAttribute('aria-describedby')
    let closeTimer: ReturnType<typeof setTimeout>

    function position() {
      const anchor = reference.getBoundingClientRect()
      const box = preview.getBoundingClientRect()
      const margin = 12
      const below = anchor.bottom + 8
      const above = anchor.top - box.height - 8
      preview.style.left = `${Math.max(margin, Math.min(anchor.left - 12, window.innerWidth - box.width - margin))}px`
      preview.style.top = `${Math.max(margin, Math.min(below + box.height <= window.innerHeight - margin ? below : above, window.innerHeight - box.height - margin))}px`
    }
    function show() {
      clearTimeout(closeTimer)
      preview.hidden = false
      reference.setAttribute(
        'aria-describedby',
        [description, preview.id].filter(Boolean).join(' '),
      )
      position()
    }
    function hide() {
      clearTimeout(closeTimer)
      preview.hidden = true
      if (description) reference.setAttribute('aria-describedby', description)
      else reference.removeAttribute('aria-describedby')
    }
    function scheduleClose() {
      clearTimeout(closeTimer)
      closeTimer = setTimeout(() => {
        if (!reference.matches(':hover, :focus') && !preview.matches(':hover, :focus-within'))
          hide()
      }, 150)
    }
    reference.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') show()
    })
    reference.addEventListener('focus', show)
    reference.addEventListener('click', hide)
    reference.addEventListener('pointerleave', scheduleClose)
    reference.addEventListener('blur', scheduleClose)
    preview.addEventListener('pointerenter', () => clearTimeout(closeTimer))
    preview.addEventListener('pointerleave', scheduleClose)
    preview.addEventListener('focusin', () => clearTimeout(closeTimer))
    preview.addEventListener('focusout', scheduleClose)
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !preview.hidden) {
        if (preview.contains(document.activeElement)) reference.focus()
        hide()
      }
    })
    document.addEventListener('pointerdown', (event) => {
      if (
        event.target instanceof Node &&
        !preview.contains(event.target) &&
        !reference.contains(event.target)
      )
        hide()
    })
    window.addEventListener('resize', () => {
      if (!preview.hidden) position()
    })
    window.addEventListener(
      'scroll',
      () => {
        if (!preview.hidden) position()
      },
      { passive: true },
    )
  }
}
