import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { Cmd, Msg, State, execute, update, type Context, type Draft } from './commentMachine'

const context = (interactionId: string, paragraphId = interactionId): Context => ({
  interactionId,
  paragraphId,
  paragraphText: `Text of ${paragraphId}`,
  pageUrl: 'https://example.com/article',
})
const draft = (interactionId: string): Draft => ({
  context: context(interactionId),
  comment: 'A comment',
  email: 'a@example.com',
})
const completion = (interactionId: string, requestId: string) => ({ interactionId, requestId })
const advance = (state: State, ...messages: Msg[]): State =>
  messages.reduce((state, message) => update(state, message)[0], state)

describe('comment interaction identity', () => {
  test('a late success or failure from A cannot overwrite a new draft on B', () => {
    const sending = State.Submitting(draft('A'), 'request-A')
    const composing = advance(sending, Msg.Select(context('B')), Msg.UpdateComment('New draft'))
    for (const message of [
      Msg.SubmitOk(completion('A', 'request-A')),
      Msg.SubmitFail(completion('A', 'request-A'), 'Offline'),
    ]) {
      expect(update(composing, message)).toEqual([composing, Cmd.None()])
    }
  })

  test('an old success timer cannot reset a newer interaction on the same paragraph', () => {
    const original = State.Submitting(draft('A'), 'request-A')
    const [sent, command] = update(original, Msg.SubmitOk(completion('A', 'request-A')))
    expect(command).toEqual(Cmd.AutoReset(completion('A', 'request-A')))
    const newer = advance(sent, Msg.Select(context('B', 'A')), Msg.UpdateComment('Another comment'))
    expect(update(newer, Msg.Reset(completion('A', 'request-A')))).toEqual([newer, Cmd.None()])
    expect(update(sent, Msg.Reset(completion('A', 'request-A')))[0]).toEqual(State.Idle())
  })

  test('retry keeps draft and ignores the previous request while the next submits', () => {
    const original = State.Submitting(draft('A'), 'request-A')
    const retry = advance(
      original,
      Msg.SubmitFail(completion('A', 'request-A'), 'Offline'),
      Msg.Retry(),
    )
    expect(retry).toEqual(State.Composing(draft('A')))
    const [sending, command] = update(retry, Msg.Submit('request-B'))
    expect(command).toEqual(Cmd.PostComment(draft('A'), 'request-B'))
    expect(update(sending, Msg.SubmitOk(completion('A', 'request-A')))).toEqual([
      sending,
      Cmd.None(),
    ])
    expect(update(sending, Msg.SubmitOk(completion('A', 'request-B')))[0]).toEqual(
      State.Sent(context('A'), 'request-B'),
    )
  })

  test('close retains the composing draft and cannot dismiss an active submission', () => {
    const composing = State.Composing(draft('A'))
    expect(advance(composing, Msg.Close(), Msg.Toggle())).toEqual(composing)
    const sending = advance(composing, Msg.Submit('request-A'))
    expect(advance(sending, Msg.Close(), Msg.Dismiss(), Msg.Toggle())).toEqual(sending)
  })

  test('blank comments emit no request', () => {
    const blank = State.Composing({ ...draft('A'), comment: ' \n\t ' })
    expect(update(blank, Msg.Submit('request-A'))).toEqual([blank, Cmd.None()])
  })
})

describe('comment executor', () => {
  test('posts the captured paragraph and returns the captured completion identity', async () => {
    const messages: Msg[] = []
    let payload: unknown
    const run = execute({
      endpoint: 'https://comments.example.com',
      fetch: async (_url, options) => {
        payload = JSON.parse(String(options?.body))
        return new Response('', { status: 200 })
      },
      schedule: () => {},
    })
    run(Cmd.PostComment(draft('A'), 'request-A'), (message) => messages.push(message))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(payload).toEqual({
      pageUrl: 'https://example.com/article',
      paragraphId: 'A',
      paragraphText: 'Text of A',
      comment: 'A comment',
      email: 'a@example.com',
    })
    expect(messages).toEqual([Msg.SubmitOk(completion('A', 'request-A'))])
  })

  test('malformed error bodies and network failures return a failure with identity', async () => {
    for (const failure of [null, { message: 42 }, 'not JSON', new Error('Offline')]) {
      const messages: Msg[] = []
      const run = execute({
        endpoint: 'https://comments.example.com',
        fetch: async () => {
          if (failure instanceof Error) throw failure
          return new Response(typeof failure === 'string' ? failure : JSON.stringify(failure), {
            status: 503,
          })
        },
        schedule: () => {},
      })
      run(Cmd.PostComment(draft('A'), 'request-A'), (message) => messages.push(message))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(messages).toEqual([
        Msg.SubmitFail(
          completion('A', 'request-A'),
          failure instanceof Error ? 'Offline' : 'HTTP 503',
        ),
      ])
    }
  })

  test('timer dispatches the submission identity it was created for', () => {
    const messages: Msg[] = []
    const timers: (() => void)[] = []
    execute({
      endpoint: '',
      fetch,
      schedule: (callback, delay) => {
        expect(delay).toBe(2000)
        timers.push(callback)
      },
    })(Cmd.AutoReset(completion('A', 'request-A')), (message) => messages.push(message))
    expect(messages).toEqual([])
    timers[0]()
    expect(messages).toEqual([Msg.Reset(completion('A', 'request-A'))])
  })
})

// Generate all message variants, including completions that arrive out of order.
const arbIdentity = fc.constantFrom('A', 'B', 'C')
const arbContext = fc
  .tuple(arbIdentity, arbIdentity)
  .map(([interactionId, paragraphId]) => context(interactionId, paragraphId))
const arbCompletion = fc.record({ interactionId: arbIdentity, requestId: arbIdentity })
const arbMessage: fc.Arbitrary<Msg> = fc.oneof(
  arbContext.map(Msg.Select),
  fc.constant(Msg.Toggle()),
  fc.constant(Msg.Close()),
  fc.string().map(Msg.UpdateComment),
  fc.string().map(Msg.UpdateEmail),
  arbIdentity.map(Msg.Submit),
  arbCompletion.map(Msg.SubmitOk),
  fc
    .tuple(arbCompletion, fc.string())
    .map(([identity, reason]) => Msg.SubmitFail(identity, reason)),
  arbCompletion.map(Msg.Reset),
  fc.constant(Msg.Dismiss()),
  fc.constant(Msg.Retry()),
)
const arbDraft = fc.record({ context: arbContext, comment: fc.string(), email: fc.string() })
const arbState: fc.Arbitrary<State> = fc.oneof(
  fc.constant(State.Idle()),
  arbDraft.map(State.Closed),
  arbDraft.map(State.Composing),
  fc
    .tuple(arbDraft, arbIdentity)
    .map(([draft, requestId]) =>
      State.Submitting({ ...draft, comment: `Comment ${draft.comment}` }, requestId),
    ),
  fc.tuple(arbContext, arbIdentity).map(([context, requestId]) => State.Sent(context, requestId)),
  fc.tuple(arbDraft, fc.string()).map(([draft, reason]) => State.Failed(draft, reason)),
)

describe('comment state invariants', () => {
  test('arbitrary message sequences preserve submission ownership and nonempty comments', () => {
    fc.assert(
      fc.property(arbState, fc.array(arbMessage, { maxLength: 100 }), (initial, messages) => {
        let state = initial
        for (const message of messages) {
          const before = structuredClone(state)
          const [next, command] = update(state, message)
          expect(state).toEqual(before)
          if (next.t === 'Submitting') expect(next.draft.comment.trim().length).toBeGreaterThan(0)
          if (command.t === 'PostComment') {
            expect(next.t).toBe('Submitting')
            expect(next).toEqual(State.Submitting(command.draft, command.requestId))
          }
          if (command.t === 'AutoReset') {
            expect(next.t).toBe('Sent')
            if (next.t === 'Sent') {
              expect(command.completion).toEqual(
                completion(next.context.interactionId, next.requestId),
              )
            }
          }
          state = next
        }
      }),
    )
  })

  test('a completion from a different interaction or request cannot change state', () => {
    fc.assert(
      fc.property(arbState, arbCompletion, (state, identity) => {
        const isCurrent =
          state.t === 'Submitting'
            ? state.draft.context.interactionId === identity.interactionId &&
              state.requestId === identity.requestId
            : state.t === 'Sent' &&
              state.context.interactionId === identity.interactionId &&
              state.requestId === identity.requestId
        if (isCurrent) return
        for (const message of [
          Msg.SubmitOk(identity),
          Msg.SubmitFail(identity, 'Offline'),
          Msg.Reset(identity),
        ]) {
          expect(update(state, message)).toEqual([state, Cmd.None()])
        }
      }),
    )
  })
})
