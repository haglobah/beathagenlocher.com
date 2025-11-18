import * as util from 'util'

export const inspect = <T>(thing: T) => {
  console.log(util.inspect(thing, false, null, true))
  return thing
}

export const cond = (condition: boolean, onTrue: () => any, onFalse: () => any) => {
  if (condition) {
    return onTrue()
  } else {
    return onFalse()
  }
}

export const merge = <T>(a: T[] | undefined, b: T[] | undefined) => {
  if (a === undefined && b === undefined) {
    return []
  } else if (a === undefined) {
    return b
  } else if (b === undefined) {
    return a
  } else {
    return a.concat(b)
  }
}

export const graphemeLength = (s: string) => [...new Intl.Segmenter().segment(s)].length
