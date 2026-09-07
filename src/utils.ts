import { createStore, reconcile, unwrap, type Store } from 'solid-js/store'

export const absurd = (value: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`)
}

// --- Elm Architecture runtime for SolidJS ---

export const createUpdater = <S extends object, M, C>(
  update: (state: S, msg: M) => [S, C],
  initialState: S,
  execute: (cmd: C, dispatch: (msg: M) => void) => void,
): [Store<S>, (msg: M) => void] => {
  const [store, setStore] = createStore<S>(initialState)
  const dispatch = (msg: M): void => {
    const [newState, cmd] = update(unwrap(store), msg)
    setStore(reconcile(newState))
    execute(cmd, dispatch)
  }
  return [store, dispatch]
}
