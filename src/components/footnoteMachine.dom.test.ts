import { expect, test } from 'bun:test'
import { parseHTML } from 'linkedom'
import { parseTarget } from './footnoteMachine'

test('target parser accepts encoded IDs and reports malformed or missing targets', () => {
  const { document } = parseHTML(
    '<html><body><a href="#note%20one"></a><li id="note one">Note</li></body></html>',
  )
  const reference = document.querySelector('a')!
  const result = parseTarget(reference)
  expect(result.t).toBe('Ready')
  if (result.t === 'Ready') expect(result.note.id).toBe('note one')
  for (const href of ['#%', '#missing', '/elsewhere']) {
    reference.setAttribute('href', href)
    expect(parseTarget(reference).t).toBe('Invalid')
  }
  reference.removeAttribute('href')
  expect(parseTarget(reference).t).toBe('Invalid')
})
