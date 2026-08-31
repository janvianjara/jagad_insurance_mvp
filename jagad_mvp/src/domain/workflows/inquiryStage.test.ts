import { describe, expect, it } from 'vitest'
import {
  canEnterStage,
  dormancyVerdict,
  readDormancyRule,
  parkingStage,
  stageByKey,
  stageCountsAsOpen,
  stageParksTheLead,
} from './inquiryStage'
import type { StageContext, StageRule } from './inquiryStage'
import { reasonOf } from './machine'

function stage(key: string, overrides: Partial<StageRule> = {}): StageRule {
  return {
    key,
    label: key,
    allowedFromKeys: [],
    requiresNextAction: false,
    countsAsOpen: true,
    terminal: false,
    parksTheLead: false,
    active: true,
    ...overrides,
  }
}

const STAGES: readonly StageRule[] = [
  stage('contacted', { label: 'Contacted', requiresNextAction: true }),
  stage('not_reachable', { label: 'Not reachable', requiresNextAction: true }),
  stage('quoted', {
    label: 'Quoted',
    allowedFromKeys: ['requirement_captured', 'contacted'],
    requiresNextAction: true,
  }),
  stage('requirement_captured', {
    label: 'Requirement captured',
    allowedFromKeys: ['contacted', 'not_reachable'],
    requiresNextAction: true,
  }),
  stage('dormant', {
    label: 'Dormant',
    allowedFromKeys: ['not_reachable'],
    countsAsOpen: false,
    terminal: true,
    parksTheLead: true,
  }),
  stage('retired_stage', { label: 'Retired stage', active: false }),
]

function context(overrides: Partial<StageContext> = {}): StageContext {
  return { status: 'accepted', fromKey: 'contacted', hasNextAction: true, ...overrides }
}

describe('the pipeline, when its rules are data — FR-06.12', () => {
  it('lets an inquiry move along an edge configuration allows', () => {
    expect(canEnterStage('requirement_captured', STAGES, context()).ok).toBe(true)
  })

  /**
   * The rule the lifecycle machine still owns. A stage is a position inside
   * `accepted`; nothing here may put a pipeline position on an inquiry that
   * routing has not finished with.
   */
  it('refuses a stage on an inquiry that is not accepted yet', () => {
    const verdict = canEnterStage('contacted', STAGES, context({ status: 'assigned', fromKey: null }))
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/Only an accepted inquiry has a pipeline position/)
    expect(reasonOf(verdict)).toMatch(/assigned/)
  })

  it('refuses a stage nobody configured, and says where stages come from', () => {
    const verdict = canEnterStage('haggling', STAGES, context())
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/not a configured stage/)
  })

  it('refuses a retired stage while leaving the records already in it alone', () => {
    const verdict = canEnterStage('retired_stage', STAGES, context())
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/has been retired/)
    // The row is still readable, which is what keeps an old record renderable.
    expect(stageByKey(STAGES, 'retired_stage')?.label).toBe('Retired stage')
  })

  /**
   * This is the proof that giving up the transition table did not give up the
   * adjacency: `quoted` follows a captured requirement, and arriving there
   * straight off a no-answer is refused in the same shape a machine would.
   */
  it('refuses an edge configuration does not have, and names the ones it does', () => {
    const verdict = canEnterStage('quoted', STAGES, context({ fromKey: 'not_reachable' }))
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/not reachable from "Not reachable"/i)
    expect(reasonOf(verdict)).toMatch(/requirement_captured, contacted/)
  })

  it('lets a stage with no configured predecessors be reached from anywhere', () => {
    // You can always fail to reach somebody, whatever else was happening.
    expect(canEnterStage('not_reachable', STAGES, context({ fromKey: 'quoted' })).ok).toBe(true)
    expect(canEnterStage('not_reachable', STAGES, context({ fromKey: null })).ok).toBe(true)
  })

  it('refuses moving on from a stage that owes a date, without one', () => {
    const verdict = canEnterStage(
      'requirement_captured',
      STAGES,
      context({ hasNextAction: false }),
    )
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/needs a next action with a date/)
  })

  it('does not demand a date on the way to a terminal stage', () => {
    const verdict = canEnterStage(
      'dormant',
      STAGES,
      context({ fromKey: 'not_reachable', hasNextAction: false }),
    )
    expect(verdict.ok).toBe(true)
  })

  it('will not move an inquiry on from where it ended without reopening it', () => {
    const verdict = canEnterStage('contacted', STAGES, context({ fromKey: 'dormant' }))
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/is where this inquiry ended/)
  })

  it('says so plainly when it is already there', () => {
    const verdict = canEnterStage('contacted', STAGES, context({ fromKey: 'contacted' }))
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/already at contacted/i)
  })
})

describe('which inquiries the pipeline counts', () => {
  it('counts the ones still being worked', () => {
    expect(stageCountsAsOpen(STAGES, 'contacted')).toBe(true)
  })

  it('does not count a parked one', () => {
    expect(stageCountsAsOpen(STAGES, 'dormant')).toBe(false)
  })

  /**
   * Accepted and never contacted is the most open an inquiry gets, and it is
   * exactly the population this layer exists to surface. Reading a missing stage
   * as "not open" would hide it from the measure built to find it.
   */
  it('counts an accepted inquiry nobody has spoken to yet', () => {
    expect(stageCountsAsOpen(STAGES, null)).toBe(true)
  })
})

describe('going cold, as the recipe defines it — FR-06.17', () => {
  const NOW = new Date('2026-08-26T12:00:00.000Z')

  it('reads both thresholds off the recipe parameters', () => {
    expect(readDormancyRule({ maxAttempts: 5, noContactDays: 12 })).toEqual({
      maxAttempts: 5,
      noContactDays: 12,
    })
  })

  /**
   * An unconfigured rule does not fire. It emphatically does not fall back on a
   * number chosen in the module — that is the same posture §9 takes on the TAT,
   * and the reason there is no default anywhere in this file.
   */
  it('treats a missing, zero or non-numeric parameter as no rule at all', () => {
    expect(readDormancyRule(null)).toEqual({ maxAttempts: null, noContactDays: null })
    expect(readDormancyRule({})).toEqual({ maxAttempts: null, noContactDays: null })
    expect(readDormancyRule({ maxAttempts: 0, noContactDays: -3 })).toEqual({
      maxAttempts: null,
      noContactDays: null,
    })
    expect(readDormancyRule({ maxAttempts: 'five' })).toEqual({
      maxAttempts: null,
      noContactDays: null,
    })
  })

  it('parks a lead on the attempt that reaches the threshold, not before', () => {
    const rule = { maxAttempts: 3, noContactDays: null }
    const ctx = { now: NOW, lastActivityAt: null }
    expect(dormancyVerdict(rule, { ...ctx, contactAttempts: 2 }).dormant).toBe(false)

    const verdict = dormancyVerdict(rule, { ...ctx, contactAttempts: 3 })
    expect(verdict.dormant).toBe(true)
    // The sentence is written on the record, so it names the number and where
    // the number came from.
    if (verdict.dormant) {
      expect(verdict.because).toMatch(/3 attempts nobody answered/)
      expect(verdict.because).toMatch(/dormancy recipe/)
    }
  })

  it('parks a lead that has heard nothing for the configured days', () => {
    const rule = { maxAttempts: null, noContactDays: 10 }
    const recent = new Date(NOW.getTime() - 9 * 86_400_000).toISOString()
    const stale = new Date(NOW.getTime() - 11 * 86_400_000).toISOString()

    expect(
      dormancyVerdict(rule, { now: NOW, contactAttempts: 0, lastActivityAt: recent }).dormant,
    ).toBe(false)

    const verdict = dormancyVerdict(rule, {
      now: NOW,
      contactAttempts: 0,
      lastActivityAt: stale,
    })
    expect(verdict.dormant).toBe(true)
    if (verdict.dormant) expect(verdict.because).toMatch(/11 days with no contact/)
  })

  it('does not park a lead nobody has ever contacted on the silence rule', () => {
    // No contact at all is not "gone quiet" — it is never started, and parking
    // it would hide the very rows the engagement layer exists to surface.
    const rule = { maxAttempts: null, noContactDays: 1 }
    expect(
      dormancyVerdict(rule, { now: NOW, contactAttempts: 0, lastActivityAt: null }).dormant,
    ).toBe(false)
  })
})

describe('the parking stage is configuration, not a key spelled in code', () => {
  it('finds the stage an admin flagged, whatever it is called', () => {
    const renamed = [
      stage('cold_storage', { label: 'Cold storage', terminal: true, parksTheLead: true }),
    ]
    expect(parkingStage(renamed)?.key).toBe('cold_storage')
    expect(stageParksTheLead(renamed, 'cold_storage')).toBe(true)
  })

  it('reads the seeded set as its own dormant row', () => {
    expect(parkingStage(STAGES)?.key).toBe('dormant')
    expect(stageParksTheLead(STAGES, 'dormant')).toBe(true)
    expect(stageParksTheLead(STAGES, 'contacted')).toBe(false)
    expect(stageParksTheLead(STAGES, null)).toBe(false)
  })

  it('has no parking stage when the flagged row is retired, rather than a stale key', () => {
    const retired = STAGES.map((row) =>
      row.parksTheLead ? { ...row, active: false } : row,
    )
    expect(parkingStage(retired)).toBeNull()
  })

  it('has none at all when nothing is flagged, so nothing parks a lead by accident', () => {
    expect(parkingStage([stage('contacted'), stage('quoted')])).toBeNull()
  })
})
