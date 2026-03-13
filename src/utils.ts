import { createStore, reconcile, type Store } from 'solid-js/store'

// --- Tagged union infrastructure ---

export type Tagged<K extends string, T extends object = Record<string, never>> = { readonly t: K } & {
  readonly [P in keyof T]: T[P]
}

export const tag =
  <K extends string>(t: K) =>
  <T extends object = Record<string, never>>(data?: T): Tagged<K, T> =>
    ({ t, ...data }) as Tagged<K, T>

// --- Elm Architecture runtime for SolidJS ---

export const createUpdater = <S extends object, M, C>(
  update: (state: S, msg: M) => [S, C],
  initialState: S,
  execute: (cmd: C, dispatch: (msg: M) => void) => void,
): [Store<S>, (msg: M) => void] => {
  const [store, setStore] = createStore<S>(initialState)
  const dispatch = (msg: M): void => {
    const [newState, cmd] = update(store, msg)
    setStore(reconcile(newState))
    execute(cmd, dispatch)
  }
  return [store, dispatch]
}
