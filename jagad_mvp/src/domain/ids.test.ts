import { describe, expect, it } from 'vitest'
import {
  createIdCounter,
  formatSystemNo,
  isRecordPrefix,
  kindOfPrefix,
  nextSystemNo,
  parseSystemNo,
  RECORD_PREFIXES,
} from './ids'

describe('system numbers', () => {
  it('zero-pads to the width every number in the prototype uses', () => {
    expect(formatSystemNo('INQ', 41)).toBe('INQ-0041')
    expect(formatSystemNo('APP', 774)).toBe('APP-0774')
    expect(formatSystemNo('INQ', 10360)).toBe('INQ-10360')
  })

  it('refuses a sequence that is not a positive whole number', () => {
    expect(() => formatSystemNo('INQ', 0)).toThrow(RangeError)
    expect(() => formatSystemNo('INQ', 1.5)).toThrow(RangeError)
  })

  it('counts each prefix independently', () => {
    const counter = createIdCounter()

    expect(nextSystemNo('inquiry', counter)).toBe('INQ-0001')
    expect(nextSystemNo('inquiry', counter)).toBe('INQ-0002')
    expect(nextSystemNo('quotation', counter)).toBe('QTN-0001')
    expect(nextSystemNo('deal', counter)).toBe('APP-0001')
  })

  it('is deterministic: the same seeds produce the same numbers', () => {
    const runOne = createIdCounter({ INQ: 1035, CLM: 411 })
    const runTwo = createIdCounter({ INQ: 1035, CLM: 411 })

    const sequence = () => [
      nextSystemNo('inquiry', runOne),
      nextSystemNo('claim', runOne),
      nextSystemNo('inquiry', runOne),
    ]
    const first = sequence()

    expect(first).toEqual(['INQ-1036', 'CLM-0412', 'INQ-1037'])
    expect([
      nextSystemNo('inquiry', runTwo),
      nextSystemNo('claim', runTwo),
      nextSystemNo('inquiry', runTwo),
    ]).toEqual(first)
  })

  it('peeks without consuming a number', () => {
    const counter = createIdCounter({ TSK: 7 })

    expect(counter.peek('TSK')).toBe(7)
    expect(nextSystemNo('task', counter)).toBe('TSK-0008')
    expect(counter.peek('TSK')).toBe(8)
  })

  it('numbers an unissued policy under its own prefix, as the prototype does', () => {
    const counter = createIdCounter({ 'POL-DRAFT': 218 })
    expect(nextSystemNo('policyDraft', counter)).toBe('POL-DRAFT-0219')
  })
})

describe('parsing', () => {
  it('splits on the last separator, so POL-DRAFT survives', () => {
    expect(parseSystemNo('POL-DRAFT-0219')).toEqual({ prefix: 'POL-DRAFT', sequence: 219 })
    expect(parseSystemNo('INQ-1041')).toEqual({ prefix: 'INQ', sequence: 1041 })
  })

  it('returns null rather than guessing at anything else', () => {
    expect(parseSystemNo('HDFC/2026/00871')).toBeNull()
    expect(parseSystemNo('INQ-abc')).toBeNull()
    expect(parseSystemNo('INQ')).toBeNull()
  })

  it('maps every prefix back to its record kind', () => {
    for (const [kind, prefix] of Object.entries(RECORD_PREFIXES)) {
      expect(isRecordPrefix(prefix)).toBe(true)
      expect(kindOfPrefix(prefix)).toBe(kind)
    }
  })
})
