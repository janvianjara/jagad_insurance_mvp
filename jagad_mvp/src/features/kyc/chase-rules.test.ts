/**
 * One copy of the cadence, proved from the side that imports it.
 *
 * `resendAfterDays` and `quietHours` sat in this file unread for the length of
 * the MVP, because there was no scheduler. The scheduler exists now and lives in
 * `src/domain/automation`, which cannot import a feature — so the definition
 * moved down and this file re-exports it.
 *
 * The risk that creates is the one the playbook backlog named: two copies of
 * quiet hours, one widened without the other, and a customer who gets a 2 a.m.
 * message from the renewal ladder and nothing from the consent chase. This test
 * is what stops the re-export quietly becoming a re-declaration.
 */

import { describe, expect, it } from 'vitest'

import { CONSENT_CADENCE as fromDomain } from '../../domain/automation'
import { CONSENT_CADENCE, CHASE_EXCLUSIONS } from './chase-rules'

describe('the consent cadence', () => {
  it('is the same object the worker reads, not a copy that matches today', () => {
    // Identity, not equality. Two objects that happen to agree now are two
    // objects that can stop agreeing on the day somebody edits one of them.
    expect(CONSENT_CADENCE).toBe(fromDomain)
  })

  it('still drives the cap the bulk chase enforces, which was always live', () => {
    expect(CHASE_EXCLUSIONS.capReached).toBe(
      `already chased ${CONSENT_CADENCE.maxAttempts} times`,
    )
  })
})
