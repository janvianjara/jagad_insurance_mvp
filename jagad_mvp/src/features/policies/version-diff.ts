/**
 * The policy's version history, read as a diff — FR-10, decision D-A.
 *
 * An endorsement versions a policy; this module turns the two records that act
 * leaves behind — the immutable `PolicyVersion` and the `Endorsement` that
 * caused it — into the one thing a person opens a version history to find out:
 * what changed, why, and who said so.
 *
 * Three honesty rules run through it, and each is the reason a field exists.
 *
 * **A version is never edited, so this module never produces one.** It reads.
 * There is no function here that writes a version, merges two, or infers a
 * version that was not recorded.
 *
 * **The record keeps WHICH fields an endorsement changed, not what each held
 * before.** `Endorsement.changedFields` is a list of field keys and there is no
 * per-version snapshot anywhere in §8, so a before-and-after column would have
 * to be invented. It is not invented: `changes` names the fields, and
 * `PRIOR_VALUES_NOT_KEPT` is the single line the screen prints instead of a
 * column of guesses.
 *
 * **Some changes cannot be attributed.** `memberAdded` and `memberRemoved` are
 * bare strings on `changedFields`, so the record can say a member joined a
 * floater and cannot say which member. `attributable: false` carries that, and
 * the screen prints it rather than reaching for a name the platform does not
 * hold.
 *
 * No React, no repository. Given rows in, entries out — which is what lets the
 * diff be asserted without mounting a screen.
 */

import type { Endorsement, PolicyVersion } from '../../data/repo'
import { ENDORSEMENT_TYPE_LABEL, figureOf } from '../endorsements/endorsement-view'
import type { EndorsementReading } from '../endorsements/endorsement-view'
import { shapeFor } from '../endorsements/form-shape'

/** The sentence the history prints where a before-and-after column would go. */
export const PRIOR_VALUES_NOT_KEPT =
  'The record keeps which fields an endorsement changed, not what each of them held beforehand. The earlier values are not stored, so they are not shown.'

/** What one unattributable change can honestly be said to be. */
export const CHANGE_NOT_ATTRIBUTED =
  'The record names the kind of change and not the row it touched, so this platform cannot say which member.'

/**
 * Changed-field keys the record cannot pin to a row.
 *
 * Both are floater membership: `changedFields` is `readonly string[]`, so
 * "a member was added" is everything that was written down. Naming a person here
 * would be inventing one.
 */
const UNATTRIBUTABLE_KEYS: readonly string[] = ['memberAdded', 'memberRemoved']

/**
 * Every field an endorsement of any type may change, by key.
 *
 * Built from the capture form's own shapes so the history reads in the words the
 * back office used when it raised the change. A key nobody configured falls back
 * to itself rather than to "Unknown field" — the string on the record is more
 * use than a placeholder.
 */
const FIELD_LABELS: ReadonlyMap<string, string> = new Map(
  (['non_financial', 'financial', 'cancellation'] as const).flatMap((type) =>
    shapeFor(type).changeFields.map((field) => [field.key, field.label] as const),
  ),
)

export function changeFieldLabel(key: string): string {
  return FIELD_LABELS.get(key) ?? key
}

export type VersionChange = {
  readonly key: string
  readonly label: string
  /** False where the record names the kind of change but not the row it touched. */
  readonly attributable: boolean
}

export type VersionEntry = {
  readonly id: string
  readonly version: number
  /** The version in force. Exactly one entry carries this. */
  readonly current: boolean
  readonly effectiveFrom: string
  readonly createdAt: string
  readonly note: string
  readonly endorsementNo: string | null
  readonly insurerEndorsementNo: string | null
  readonly documentId: string | null
  /** The endorsement that caused this version. Null on the version issued at inception. */
  readonly endorsement: Endorsement | null
  /** What changed against the version before it. Empty on the first version. */
  readonly changes: readonly VersionChange[]
  /** The type of change, in the words the endorsement queue uses. */
  readonly typeLabel: string | null
  /** The money figure the endorsement recorded, or null where it carries none. */
  readonly figure: EndorsementReading | null
  readonly approvedBy: string | null
  readonly approvedAt: string | null
}

function changesOf(endorsement: Endorsement | null): readonly VersionChange[] {
  if (endorsement === null) return []
  return endorsement.changedFields.map((key) => ({
    key,
    label: changeFieldLabel(key),
    attributable: !UNATTRIBUTABLE_KEYS.includes(key),
  }))
}

/**
 * The history, newest version first, each version paired with its cause.
 *
 * The pairing is by `policyVersionId` — the endorsement names the version it
 * wrote, which is the only link either record actually carries. Matching on the
 * endorsement number instead would work today and break the moment two
 * endorsements against one policy share a note.
 *
 * `current` is the highest version number rather than the newest `createdAt`,
 * because the version in force is the last one written and version numbers are
 * what `versionPolicy` counts. A policy with no versions has no current version
 * and the function says so by returning nothing.
 */
export function versionHistory(
  versions: readonly PolicyVersion[],
  endorsements: readonly Endorsement[],
): readonly VersionEntry[] {
  const byVersionId = new Map(
    endorsements
      .filter((row): row is Endorsement & { policyVersionId: string } => row.policyVersionId !== null)
      .map((row) => [row.policyVersionId, row] as const),
  )

  const highest = versions.reduce((top, row) => Math.max(top, row.version), 0)

  return [...versions]
    .sort((a, b) => b.version - a.version)
    .map((version) => {
      const endorsement = byVersionId.get(version.id) ?? null
      return {
        id: version.id,
        version: version.version,
        current: version.version === highest,
        effectiveFrom: version.effectiveFrom,
        createdAt: version.createdAt,
        note: version.note,
        endorsementNo: version.endorsementNo,
        insurerEndorsementNo: version.insurerEndorsementNo,
        documentId: version.documentId,
        endorsement,
        changes: changesOf(endorsement),
        typeLabel: endorsement === null ? null : ENDORSEMENT_TYPE_LABEL[endorsement.type],
        figure: endorsement === null ? null : figureOf(endorsement),
        approvedBy: endorsement?.approvedBy ?? null,
        approvedAt: endorsement?.approvedAt ?? null,
      }
    })
}

/**
 * Endorsements against this policy that have not yet written a version.
 *
 * They belong on the history screen because their absence is the question a
 * person asks next: "the customer says the sum insured went up — where is it?"
 * The answer is that the endorsement is still in flight, and the history says so
 * rather than looking complete.
 */
export function endorsementsInFlight(
  endorsements: readonly Endorsement[],
): readonly Endorsement[] {
  return [...endorsements]
    .filter((row) => row.policyVersionId === null)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
}
