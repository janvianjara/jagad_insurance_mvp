import { describe, expect, it } from 'vitest'
import { firedKey } from './ledger'

const BASE = { recordId: 'rnw-4437', recipeKey: 'renewal.reminder', recipeVersion: 2, offsetDays: 30 }

describe('the idempotency key separates everything that must fire separately', () => {
  it('reads as the record, the recipe, the version and the rung', () => {
    expect(firedKey(BASE)).toBe('rnw-4437:renewal.reminder:v2:d30')
  })

  it('writes a grace rung as g, so the key stays readable and signed', () => {
    expect(firedKey({ ...BASE, offsetDays: -3 })).toBe('rnw-4437:renewal.reminder:v2:g3')
  })

  /** Without the rung in the key, the 30-day send suppresses the 15-day one. */
  it('gives each rung its own key', () => {
    expect(firedKey({ ...BASE, offsetDays: 15 })).not.toBe(firedKey(BASE))
  })

  it('gives each record its own key', () => {
    expect(firedKey({ ...BASE, recordId: 'rnw-4441' })).not.toBe(firedKey(BASE))
  })

  it('gives each recipe its own key, so two ladders on one record do not collide', () => {
    expect(firedKey({ ...BASE, recipeKey: 'renewal.notice' })).not.toBe(firedKey(BASE))
  })

  it('gives each recipe version its own key, so an edited ladder is not suppressed', () => {
    expect(firedKey({ ...BASE, recipeVersion: 3 })).not.toBe(firedKey(BASE))
  })

  /** A rung 3 days before the anchor and one 3 days after it are different sends. */
  it('does not confuse a rung before the anchor with the grace rung of the same size', () => {
    expect(firedKey({ ...BASE, offsetDays: 3 })).not.toBe(firedKey({ ...BASE, offsetDays: -3 }))
  })
})
