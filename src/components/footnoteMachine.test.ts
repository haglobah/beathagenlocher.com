import { expect, test } from 'bun:test'
import fc from 'fast-check'
import * as Footnote from './footnoteMachine'

const { State, Msg, Cmd, update } = Footnote

test('opening and crossing the gap keeps the preview visible', () => {
  expect(update(State.Closed(), Msg.Show())).toEqual([
    State.Open(),
    [Cmd.CancelClose(), Cmd.Show()],
  ])
  expect(update(State.Open(), Msg.Leave())).toEqual([State.Closing(), [Cmd.ScheduleClose()]])
  expect(update(State.Closing(), Msg.KeepOpen())).toEqual([State.Open(), [Cmd.CancelClose()]])
})

test('close deadline respects either hover or focus and ignores cancelled deadlines', () => {
  expect(update(State.Closing(), Msg.CloseElapsed('Engaged'))[0]).toEqual(State.Open())
  expect(update(State.Closing(), Msg.CloseElapsed('Absent'))).toEqual([
    State.Closed(),
    [Cmd.Hide()],
  ])
  expect(update(State.Open(), Msg.CloseElapsed('Absent'))).toEqual([State.Open(), []])
  expect(update(State.Closed(), Msg.Leave())).toEqual([State.Closed(), []])
})

test('dismissal cancels pending closing and Escape restores focus before dismissing', () => {
  expect(update(State.Closing(), Msg.Dismiss())).toEqual([
    State.Closed(),
    [Cmd.CancelClose(), Cmd.Hide()],
  ])
  expect(update(State.Open(), Msg.Escape('Preview'))[1]).toEqual([Cmd.ReturnFocus()])
  expect(update(State.Open(), Msg.Escape('Elsewhere'))[0]).toEqual(State.Closed())
  expect(update(State.Closed(), Msg.KeepOpen())[0]).toEqual(State.Closed())
})

test('separate references can remain open simultaneously', () => {
  const [focused] = update(State.Closed(), Msg.Show())
  const [hovered] = update(State.Closed(), Msg.Show())
  expect(update(focused, Msg.CloseElapsed('Engaged'))[0]).toEqual(State.Open())
  expect(hovered).toEqual(State.Open())
})

const messages = fc.constantFrom<Footnote.Msg>(
  Msg.Show(),
  Msg.KeepOpen(),
  Msg.Leave(),
  Msg.Dismiss(),
  Msg.CloseElapsed('Engaged'),
  Msg.CloseElapsed('Absent'),
  Msg.Escape('Preview'),
  Msg.Escape('Elsewhere'),
  Msg.Reposition(),
)

test('arbitrary states and events keep closing timers and visibility consistent', () => {
  fc.assert(
    fc.property(
      fc.constantFrom<Footnote.State>(State.Closed(), State.Open(), State.Closing()),
      fc.array(messages),
      (initial, events) => {
        let state = initial
        for (const event of events) {
          const [next, commands] = update(state, event)
          expect(JSON.parse(JSON.stringify(next))).toEqual(next)
          if (commands.some((c) => c.t === 'ScheduleClose')) expect(next.t).toBe('Closing')
          if (commands.some((c) => c.t === 'Hide')) expect(next.t).toBe('Closed')
          if (commands.some((c) => c.t === 'Show' || c.t === 'Position'))
            expect(next.t).not.toBe('Closed')
          if (event.t === 'Dismiss') expect(next.t).toBe('Closed')
          if (state.t === 'Closed' && event.t !== 'Show') expect(next.t).toBe('Closed')
          state = next
        }
      },
    ),
  )
})
