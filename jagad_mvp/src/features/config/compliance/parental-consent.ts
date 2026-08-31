/**
 * Parental consent — DPDP's rule that processing a child's personal data needs
 * verifiable consent from a parent or lawful guardian.
 *
 * A health policy covers a family, so minors are on the book by design: a
 * `Member` under eighteen is normal, and the question is never whether they are
 * there but whether a guardian's consent has been recorded against the file they
 * sit on.
 *
 * Everything here is derived from records that already exist. `Member` carries
 * `dateOfBirth`, which gives the age; a member sits on a customer's file, which
 * gives the guardian; and that customer's `consentState` says whether consent was
 * actually given. Nothing is invented, and no new consent artefact is minted for
 * a minor — the guardian's consent IS the customer's consent record, which is
 * what makes this checkable rather than decorative.
 *
 * What it deliberately does not read: `healthDeclaration`, `preExistingConditions`
 * and `diagnosis` are on `Member` and are health class. A register that listed a
 * child's diagnosis in order to say their guardian had not consented would be the
 * exact failure it exists to prevent. Nor does it read `aadhaarLast4`: a name, an
 * age and a relationship are what identify the row here.
 */

import { CONSENT_STATES } from '../../../domain/workflows'
import type { ConsentState } from '../../../domain/workflows'
import type { Customer, Member } from '../../../data/repo'

/** The age below which a guardian's consent is required. */
export const MAJORITY_AGE = 18

/** Whole years between a date of birth and now. Null where no date is on record. */
export function ageYears(dateOfBirth: string | null, now: Date): number | null {
  if (dateOfBirth === null || dateOfBirth.trim() === '') return null
  const born = new Date(dateOfBirth)
  if (Number.isNaN(born.getTime())) return null

  let age = now.getFullYear() - born.getFullYear()
  const monthDelta = now.getMonth() - born.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age -= 1
  return age
}

export type MinorMember = {
  readonly memberId: string
  readonly memberName: string
  readonly relationship: string
  readonly ageYears: number
  readonly customerId: string
  /** The proposer whose file the child sits on: the guardian, as the book has it. */
  readonly guardianName: string
  readonly guardianConsentState: ConsentState
  /** True where the child is actually covered by a policy today. */
  readonly covered: boolean
  /** True while the guardian's own consent has not been given. */
  readonly needsGuardianConsent: boolean
}

/**
 * Every member under eighteen, with the standing of the consent that covers them.
 *
 * A member whose date of birth is not on record is not a minor by default and is
 * not counted as one: an unknown age is a data gap, and `membersWithoutAnAge`
 * reports it separately rather than letting it hide inside this list.
 */
export function minorMembers(
  members: readonly Member[],
  customers: readonly Customer[],
  now: Date,
): readonly MinorMember[] {
  const byId = new Map(customers.map((customer) => [customer.id, customer]))

  return members
    .flatMap((member) => {
      const age = ageYears(member.dateOfBirth, now)
      if (age === null || age >= MAJORITY_AGE) return []

      const guardian = byId.get(member.customerId)
      if (!guardian) return []

      return [
        {
          memberId: member.id,
          memberName: member.fullName,
          relationship: member.relationship,
          ageYears: age,
          customerId: member.customerId,
          guardianName: guardian.fullName,
          guardianConsentState: guardian.consentState,
          covered: member.coveredUnderPolicyIds.length > 0,
          needsGuardianConsent: guardian.consentState !== CONSENT_STATES.submitted,
        },
      ]
    })
    .toSorted((a, b) => a.ageYears - b.ageYears || a.memberName.localeCompare(b.memberName))
}

/** Minors the agency cannot yet show a guardian's consent for. */
export function minorsNeedingConsent(rows: readonly MinorMember[]): readonly MinorMember[] {
  return rows.filter((row) => row.needsGuardianConsent)
}

/**
 * Members with no date of birth on record. Not minors, not adults — unknown, and
 * an unknown age is the reason a guardian-consent check can be quietly wrong.
 */
export function membersWithoutAnAge(members: readonly Member[]): readonly Member[] {
  return members.filter((member) => member.dateOfBirth === null || member.dateOfBirth.trim() === '')
}
