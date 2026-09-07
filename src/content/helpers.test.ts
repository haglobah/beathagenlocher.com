import { describe, expect, test } from 'bun:test'
import { getTopics, sortByStartDate, sortByUpdated } from './helpers'

describe('content helpers', () => {
  test('independent date views never mutate the shared collection', () => {
    const first = {
      id: 'first',
      data: { startDate: new Date('2020-01-01'), updated: new Date('2024-01-01') },
    }
    const second = {
      id: 'second',
      data: { startDate: new Date('2022-01-01'), updated: new Date('2023-01-01') },
    }
    const entries = Object.freeze([first, second])
    expect(sortByStartDate(entries)).toEqual([second, first])
    expect(sortByUpdated(entries)).toEqual([first, second])
    expect(entries).toEqual([first, second])
  })

  test('topics skip absent values and count literal names across collections', () => {
    expect(
      getTopics([
        [{ data: { topics: ['TypeScript', '__proto__'] } }, { data: {} }],
        [{ data: { topics: ['TypeScript'] } }],
      ]),
    ).toEqual([
      ['TypeScript', 2],
      ['__proto__', 1],
    ])
  })
})
