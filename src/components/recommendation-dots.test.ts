import { describe, expect, test } from 'bun:test'
import { dotGroups } from './recommendation-dots.ts'

describe('dotGroups', () => {
  test('counts below ten are all small dots', () => {
    expect(dotGroups(0)).toEqual({ hundreds: 0, tens: 0, ones: 0 })
    expect(dotGroups(1)).toEqual({ hundreds: 0, tens: 0, ones: 1 })
    expect(dotGroups(9)).toEqual({ hundreds: 0, tens: 0, ones: 9 })
  })

  test('ten small dots roll up into one bigger dot', () => {
    expect(dotGroups(10)).toEqual({ hundreds: 0, tens: 1, ones: 0 })
    expect(dotGroups(23)).toEqual({ hundreds: 0, tens: 2, ones: 3 })
    expect(dotGroups(99)).toEqual({ hundreds: 0, tens: 9, ones: 9 })
  })

  test('ten bigger dots roll up into one big dot', () => {
    expect(dotGroups(100)).toEqual({ hundreds: 1, tens: 0, ones: 0 })
    expect(dotGroups(234)).toEqual({ hundreds: 2, tens: 3, ones: 4 })
  })
})
