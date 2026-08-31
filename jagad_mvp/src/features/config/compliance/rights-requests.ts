/**
 * Data-principal rights — FR-20.2, and the acceptance criterion §12 is written
 * around: "a delete request on a live policy returns legal-obligation retention,
 * locks marketing use, and logs the decision".
 *
 * Three kinds of request, one decision path, and the decision is DERIVED rather
 * than chosen. That is the whole design. A compliance officer does not get a
 * dropdown of outcomes on an erasure request: the register reads the records the
 * agency actually holds for that person, runs each one past the retention rule
 * that already governs it, and returns what the law leaves the agency free to do.
 * The officer confirms it, and the confirmation is what gets logged.
 *
 * The retention rule is not restated here. `retentionWindowElapsed` in
 * `src/domain/workflows/policy.ts` is the machine's own guard — the same function
 * the policy machine calls before it locks a record — and it reads its years off
 * the retention classes an admin configures on the next section of this screen.
 * So the sentence this register shows for a held record is the machine's, word
 * for word, and "ten years" appears in neither.
 *
 * No React and no repository: this module takes rows and returns a verdict, which
 * is what lets the acceptance criterion be a test rather than a screenshot.
 */

import { POLICY_ENTRY_PATHS, retentionWindowElapsed } from '../../../domain/workflows'
import type { KycState } from '../../../domain/workflows'
import type { Customer, DocumentRecord, Policy, RetentionClass } from '../../../data/repo'

/* ------------------------------------------------------------- the vocabulary */

export const RIGHT_KINDS = {
  /** "Tell me what you hold about me." */
  access: 'access',
  /** "This is wrong; correct it." */
  correction: 'correction',
  /** "Delete what you hold about me." */
  erasure: 'erasure',
} as const

export type RightKind = (typeof RIGHT_KINDS)[keyof typeof RIGHT_KINDS]

export const RIGHT_KIND_LABELS: Readonly<Record<RightKind, string>> = {
  access: 'Access',
  correction: 'Correction',
  erasure: 'Erase',
}

export const RIGHT_KIND_SENTENCES: Readonly<Record<RightKind, string>> = {
  access: 'The person has asked what this agency holds about them.',
  correction: 'The person says something on their record is wrong and has asked for it to be corrected.',
  erasure: 'The person has asked for their data to be deleted.',
}

export const REQUEST_STATES = {
  received: 'received',
  decided: 'decided',
} as const

export type RequestState = (typeof REQUEST_STATES)[keyof typeof REQUEST_STATES]

export const REQUEST_OUTCOMES = {
  /** Answered in full. Nothing stood in the way. */
  fulfilled: 'fulfilled',
  /** Answered as far as the law allows; the rest is held under an obligation. */
  retained: 'retained_under_legal_obligation',
} as const

export type RequestOutcome = (typeof REQUEST_OUTCOMES)[keyof typeof REQUEST_OUTCOMES]

export const REQUEST_OUTCOME_LABELS: Readonly<Record<RequestOutcome, string>> = {
  fulfilled: 'Fulfilled',
  retained_under_legal_obligation: 'Legal-obligation retention',
}

/**
 * The window this agency answers a rights request in.
 *
 * It is a published commitment rather than a statutory period, and it is a
 * constant here rather than a configured number — which makes it the one figure
 * on this screen that has the flaw the retention section was built to avoid. It
 * is written down in one place, said out loud on screen, and named in the report
 * as the config row this build still owes. Nothing derives from it except a clock.
 */
export const RIGHTS_RESPONSE_DAYS = 30

export const RIGHTS_RESPONSE_MS = RIGHTS_RESPONSE_DAYS * 24 * 60 * 60 * 1000

export const RIGHTS_WINDOW_NOTE = `Thirty days is this agency's own published commitment, not a statutory period, and it is a constant in code rather than a configured value — the one number on this screen that is not read from configuration.`

/* ----------------------------------------------------------------- the record */

/** One record the agency must keep, and the sentence that says why. */
export type RetentionHold = {
  readonly recordKind: 'policy' | 'document'
  readonly recordId: string
  /** The record's own number, so an auditor can go and find it. */
  readonly recordNo: string
  readonly retentionClass: string
  readonly classLabel: string
  /** Years configured for the class. Null where the class has no period set. */
  readonly years: number | null
  /** The domain's own refusal, unedited. */
  readonly reason: string
}

export type RightsDecision = {
  readonly outcome: RequestOutcome
  /** What was decided, in a sentence a client can read. */
  readonly reason: string
  readonly decidedAt: string
  readonly decidedBy: string
  /** Set by an erasure decision: the record may be kept, but not used to sell. */
  readonly marketingLocked: boolean
  readonly holds: readonly RetentionHold[]
}

export type DataPrincipalRequest = {
  readonly id: string
  readonly customerId: string
  readonly kind: RightKind
  /** When the request arrived. The clock runs from here. */
  readonly receivedAt: string
  /** How it arrived and anything the person said, in the officer's words. */
  readonly note: string
  readonly recordedBy: string
  readonly decision: RightsDecision | null
}

export function requestState(request: DataPrincipalRequest): RequestState {
  return request.decision === null ? REQUEST_STATES.received : REQUEST_STATES.decided
}

/* -------------------------------------------------------------- what is held */

/**
 * What the agency holds about one person, counted.
 *
 * Counts and nothing else. An access request is answered with a copy of the
 * record, and assembling that copy is the import and export engine's job; what
 * this register can prove on its own is how many records of each kind exist, and
 * a count carries no health note, no document text and no identifier.
 */
export type Holdings = {
  readonly policies: number
  readonly livePolicies: number
  readonly documents: number
  readonly consentRecords: number
  readonly messages: number
}

/** A policy the agency is still on the hook for. Retention has not started. */
const CLOSED_STATES: readonly string[] = ['closed', 'locked']

export function isLivePolicy(policy: Policy): boolean {
  return !CLOSED_STATES.includes(policy.status)
}

export type HoldingsInput = {
  readonly customerId: string
  readonly policies: readonly Policy[]
  readonly documents: readonly DocumentRecord[]
  readonly consentRecords: number
  readonly messages: number
}

export function holdingsFor(input: HoldingsInput): Holdings {
  const policies = policiesOf(input.customerId, input.policies)
  return {
    policies: policies.length,
    livePolicies: policies.filter(isLivePolicy).length,
    documents: documentsOf(input.customerId, policies, input.documents).length,
    consentRecords: input.consentRecords,
    messages: input.messages,
  }
}

export function policiesOf(customerId: string, policies: readonly Policy[]): readonly Policy[] {
  return policies.filter((policy) => policy.customerId === customerId)
}

/**
 * The documents that belong to a person: the ones filed against the customer,
 * and the ones filed against each of their policies. Metadata only — this reads
 * `subjectId`, `systemNo` and `retentionClass`, and never a file name, an
 * extraction or a word of what a document says.
 */
export function documentsOf(
  customerId: string,
  policies: readonly Policy[],
  documents: readonly DocumentRecord[],
): readonly DocumentRecord[] {
  const policyIds = new Set(policies.map((policy) => policy.id))
  return documents.filter(
    (record) =>
      (record.subjectEntity === 'Customer' && record.subjectId === customerId) ||
      policyIds.has(record.subjectId),
  )
}

/* ------------------------------------------------------------- the assessment */

export type AssessmentInput = {
  readonly customer: Customer
  readonly policies: readonly Policy[]
  readonly documents: readonly DocumentRecord[]
  readonly retentionClasses: readonly RetentionClass[]
  readonly now: Date
}

export type RightsAssessment = {
  readonly kind: RightKind
  readonly outcome: RequestOutcome
  readonly marketingLocked: boolean
  readonly holds: readonly RetentionHold[]
  /** The decision, written out. This is what gets logged and what a client reads. */
  readonly reason: string
}

function yearsByClass(classes: readonly RetentionClass[]): Readonly<Record<string, number>> {
  return Object.fromEntries(classes.map((entry) => [entry.key, entry.years]))
}

function labelOf(classes: readonly RetentionClass[], key: string): string {
  return classes.find((entry) => entry.key === key)?.label ?? key
}

function yearsOf(classes: readonly RetentionClass[], key: string): number | null {
  return classes.find((entry) => entry.key === key)?.years ?? null
}

/**
 * Every record that stands in the way of erasing this person, with the machine's
 * own reason against each.
 *
 * The policy half calls `retentionWindowElapsed`, which is the guard the policy
 * machine itself runs before it will lock a record: it refuses while a policy has
 * no closing date at all — a live contract — and refuses again while a closed one
 * is inside the window its retention class configures. Either refusal is a record
 * the agency is obliged to keep, and the sentence shown is the guard's.
 *
 * `Policy` carries no `closedAt`, so a closed or locked policy is measured from
 * its expiry date, which is the only closing instant the record holds. Where even
 * that is absent the guard says so rather than assuming one.
 */
export function assessErasure(input: AssessmentInput): readonly RetentionHold[] {
  const classes = input.retentionClasses
  const byClass = yearsByClass(classes)
  const policies = policiesOf(input.customer.id, input.policies)

  const policyHolds: RetentionHold[] = []
  for (const policy of policies) {
    const closed = CLOSED_STATES.includes(policy.status)
    const verdict = retentionWindowElapsed({
      now: input.now,
      // Neither is read by this guard; the context type requires them, and the
      // honest values are the ones on the records rather than invented ones.
      entryPath: POLICY_ENTRY_PATHS.direct,
      kycState: input.customer.kycState as KycState,
      retentionClass: policy.retentionClass,
      retentionYearsByClass: byClass,
      ...(closed && policy.expiryDate !== null ? { closedAt: policy.expiryDate } : {}),
    })

    if (verdict.ok) continue

    policyHolds.push({
      recordKind: 'policy',
      recordId: policy.id,
      recordNo: policy.insurerNo ?? policy.systemNo,
      retentionClass: policy.retentionClass,
      classLabel: labelOf(classes, policy.retentionClass),
      years: yearsOf(classes, policy.retentionClass),
      reason: verdict.reason,
    })
  }

  const documentHolds: RetentionHold[] = documentsOf(
    input.customer.id,
    policies,
    input.documents,
  ).map((record) => {
    const years = yearsOf(classes, record.retentionClass)
    return {
      recordKind: 'document' as const,
      recordId: record.id,
      recordNo: record.systemNo,
      retentionClass: record.retentionClass,
      classLabel: labelOf(classes, record.retentionClass),
      years,
      reason:
        years === null
          ? `No retention period is configured for retention class "${record.retentionClass}". Retention comes from the class, not from a constant in code, so nothing releases this document until somebody configures one.`
          : `Held under the "${labelOf(classes, record.retentionClass)}" class, which this agency configures at ${years} years. A document carries no closing date of its own: it is released when the record it evidences is.`,
    }
  })

  return [...policyHolds, ...documentHolds]
}

/**
 * The decision, derived. Nobody picks the outcome.
 *
 * Erasure is the branch the acceptance criterion is about: any held record turns
 * the answer into legal-obligation retention, and every erasure decision — held
 * records or none — locks marketing use, because a record kept for an obligation
 * may be kept only for that obligation.
 */
export function assessRequest(kind: RightKind, input: AssessmentInput): RightsAssessment {
  if (kind === RIGHT_KINDS.erasure) {
    const holds = assessErasure(input)
    const retained = holds.length > 0
    const policyHolds = holds.filter((hold) => hold.recordKind === 'policy').length
    const documentHolds = holds.length - policyHolds

    return {
      kind,
      outcome: retained ? REQUEST_OUTCOMES.retained : REQUEST_OUTCOMES.fulfilled,
      marketingLocked: true,
      holds,
      reason: retained
        ? `Erasure is refused in part: ${policyHolds} ${policyHolds === 1 ? 'policy record' : 'policy records'} and ${documentHolds} ${documentHolds === 1 ? 'document' : 'documents'} are held under a legal obligation the agency cannot set aside, each under the retention class configured for it. Those records stay, they stay readable, and they are never hard-deleted. Marketing use of this person's data is locked from now on: what is kept may be kept only for the obligation that requires it.`
        : `Nothing this agency holds for this person is under a retention obligation, so the erasure can be carried out in full. Marketing use is locked in the same act.`,
    }
  }

  if (kind === RIGHT_KINDS.access) {
    return {
      kind,
      outcome: REQUEST_OUTCOMES.fulfilled,
      marketingLocked: false,
      holds: [],
      reason:
        'A copy of what the agency holds is compiled for the person: their own record, their policies, the documents filed against them and the messages sent to them. The copy reproduces no Aadhaar number — the platform holds only the last four digits and shows only those — and it is assembled by the export engine rather than typed by hand.',
    }
  }

  return {
    kind,
    outcome: REQUEST_OUTCOMES.fulfilled,
    marketingLocked: false,
    holds: [],
    reason:
      'The correction is made on the record where the field lives, so the edit is audited against that record rather than against this register. This entry logs that the request arrived and when it was answered.',
  }
}

/* ---------------------------------------------------------------- selectors */

export function outstandingRequests(
  requests: readonly DataPrincipalRequest[],
): readonly DataPrincipalRequest[] {
  return requests.filter((request) => request.decision === null)
}

/** Requests whose response window has already run out. */
export function overdueRequests(
  requests: readonly DataPrincipalRequest[],
  now: Date,
): readonly DataPrincipalRequest[] {
  return outstandingRequests(requests).filter(
    (request) => now.getTime() - new Date(request.receivedAt).getTime() >= RIGHTS_RESPONSE_MS,
  )
}

/** Every customer whose marketing use a decision has locked. */
export function marketingLockedCustomers(
  requests: readonly DataPrincipalRequest[],
): readonly string[] {
  return [
    ...new Set(
      requests
        .filter((request) => request.decision?.marketingLocked === true)
        .map((request) => request.customerId),
    ),
  ]
}
