/**
 * Correction, discard and erasure — FR-20.2, D3, plan §9 and §14.
 *
 * Every write in this platform up to now was either a creation or a machine
 * transition, which is correct for a lifecycle and useless for a typo. A mobile
 * number taken down wrong on the phone had no path back out of the record, and a
 * duplicate customer imported from a spreadsheet had no path out at all. This
 * module is the third kind of write: correcting what a person entered, and
 * removing what should never have been entered.
 *
 * Three rules shape everything below, and each one is a refusal somebody will
 * read on a screen rather than a boolean somebody has to guess at.
 *
 *   1. Correction is an ALLOW-LIST. `AMEND_POLICIES` names, per entity, exactly
 *      the fields a person may correct. Everything else — identity, provenance,
 *      lifecycle state, an issued contract's figures, an identifier the insurer
 *      gave us, an Aadhaar in any form — refuses with its own sentence saying
 *      why. A deny-list would let the next field somebody adds through by
 *      default, which is the failure this file exists to prevent.
 *
 *   2. Discard is SOFT, REVERSIBLE and NARROW. Three pre-contractual entities
 *      may be discarded — an inquiry, a quotation, a deal — because a duplicate
 *      lead is a mistake rather than a record with obligations. Customers,
 *      policies, claims, endorsements, collections and commission carry
 *      regulatory retention and are absent from `DISCARDABLE_ENTITIES`
 *      altogether, so the type system refuses them rather than the runtime.
 *
 *   3. Erasure is a DECISION, not a delete. FR-20.2 gives a data principal the
 *      right to ask; the honest answer where a live contract exists is that the
 *      record is retained under a named obligation and marketing use is locked
 *      instead. `assessErasure` produces that answer, and it never returns a
 *      silent refusal.
 *
 * Record-only money (D3) is the rule with the sharpest edge here. A premium on a
 * policy the insurer has already issued is a contractual figure and changes
 * through an endorsement, never through an edit. Before issue the same field is
 * data entry and is correctable. `amendTouchesNoIssuedMoney` is that line, and
 * nothing in this module ever computes an amount — a correction records the
 * paise a person typed and nothing else.
 */

import { allow, refuse } from './workflows/machine'
import type { TransitionResult } from './workflows/machine'

/* ------------------------------------------------------------------ values */

/**
 * What a correction may carry.
 *
 * Deliberately scalar. A `Money` field is corrected by its integer paise, which
 * is the shape the amount is stored and transported in anyway, so a screen types
 * one number and the repository rebuilds the branded value — no float ever
 * becomes an amount on this path. Collections, nested objects and machine state
 * are not correctable by any route, so nothing here can express them.
 */
export type AmendValue = string | number | null

export type AmendCommand = {
  readonly changes: Readonly<Record<string, AmendValue>>
  /** Why. Required, never defaulted, never blank. */
  readonly reason: string
  readonly actorId: string
}

/* ------------------------------------------------------------- the allow-list */

export const AMENDABLE_ENTITIES = [
  'Inquiry',
  'Quotation',
  'Deal',
  'Customer',
  'Policy',
  'Claim',
] as const

export type AmendableEntity = (typeof AMENDABLE_ENTITIES)[number]

export type AmendPolicy = {
  /** The only fields a correction may touch on this entity. */
  readonly fields: readonly string[]
  /**
   * Of those, the ones holding a `Money` value. Correctable while the record is
   * still data entry; refused once the insurer has issued, per D3.
   */
  readonly money: readonly string[]
  /**
   * The field this entity's machine owns. Named per entity because the name is
   * not the same everywhere and because `Customer.state` is an address, not a
   * lifecycle — a blanket refusal of "state" would block correcting Gujarat.
   */
  readonly lifecycleField: string
}

/**
 * Per entity, exactly what a person may correct.
 *
 * The shape of the list is the argument: contact details, names, addresses,
 * dates of birth, free-text reasons, and the references a human picked off a
 * dropdown at intake. Those are the fields that get mistyped. Nothing here
 * decides anything — a corrected `agentId` re-points an attribution, it does not
 * recompute a commission — and nothing here is a status.
 */
export const AMEND_POLICIES = {
  Inquiry: {
    fields: ['contactName', 'contactMobile', 'contactEmail', 'notes', 'agentId', 'subAgentId'],
    money: [],
    lifecycleField: 'status',
  },
  Quotation: {
    fields: ['revisionReason', 'lostReason', 'agentId', 'subAgentId'],
    money: [],
    lifecycleField: 'status',
  },
  /*
   * A deal carries no prose of its own: it is an award turned into an
   * application, and every descriptive field on it belongs to the quotation
   * behind it. What does get picked wrong is the attribution, so that is what is
   * correctable and all that is.
   */
  Deal: {
    fields: ['agentId', 'subAgentId'],
    money: [],
    lifecycleField: 'status',
  },
  Customer: {
    fields: [
      'fullName',
      'mobile',
      'altMobile',
      'email',
      'addressLine',
      'city',
      'state',
      'pincode',
      'dateOfBirth',
      'agentId',
      'subAgentId',
    ],
    money: [],
    lifecycleField: 'status',
  },
  /*
   * The four figures are correctable only while the policy is still being
   * entered. `amendTouchesNoIssuedMoney` is what makes that true; listing them
   * here without that guard would be a D3 violation shipped as a feature.
   */
  Policy: {
    fields: [
      'insurerNo',
      'startDate',
      'expiryDate',
      'sumInsured',
      'netPremium',
      'gstAmount',
      'finalPremium',
      'agentId',
      'subAgentId',
    ],
    money: ['sumInsured', 'netPremium', 'gstAmount', 'finalPremium'],
    lifecycleField: 'status',
  },
  /*
   * The settlement figure is absent on purpose. It is typed from the insurer's
   * advice through `claimMachine`, and a claim's own state field is `state`
   * rather than `status`.
   */
  Claim: {
    fields: ['insurerNo', 'memberId', 'agentId', 'ownerId'],
    money: [],
    lifecycleField: 'state',
  },
} as const satisfies Record<AmendableEntity, AmendPolicy>

export type AmendableField<E extends AmendableEntity> =
  (typeof AMEND_POLICIES)[E]['fields'][number]

export function amendableFields(entity: AmendableEntity): readonly string[] {
  return AMEND_POLICIES[entity].fields
}

export function isAmendableField(entity: AmendableEntity, field: string): boolean {
  return (AMEND_POLICIES[entity].fields as readonly string[]).includes(field)
}

export function isMoneyField(entity: AmendableEntity, field: string): boolean {
  return (AMEND_POLICIES[entity].money as readonly string[]).includes(field)
}

/**
 * Identity and provenance. Not correctable on any entity, because a record whose
 * number can change is a record two people can be looking at while holding
 * different numbers for it.
 */
export const UNAMENDABLE_IDENTITY_FIELDS = ['id', 'systemNo', 'createdAt', 'raisedAt'] as const

/**
 * Anything whose name says identity, bank or health.
 *
 * Belt and braces over the allow-list: no such field is listed above, and if one
 * is ever added by mistake this refuses it by name before the allow-list is even
 * consulted. Aadhaar is named first because §14.1 forbids it in every form,
 * masked included.
 */
const SENSITIVE_FIELD_NAME =
  /(aadhaar|^pan$|panNumber|bankAccount|bankIfsc|^ifsc$|health|diagnosis|preExisting|extractedText|ocrFields|fileName|fileUrl|medicalReport|^token$|companyRemark)/i

/* --------------------------------------------------------------- the context */

export type AmendContext = {
  readonly entity: AmendableEntity
  readonly reason: string
  readonly changes: Readonly<Record<string, AmendValue>>
  /**
   * The record's current value for each field named in `changes`, in the same
   * scalar shape — a `Money` field reads back as its paise. Supplied by the
   * repository, never by a screen: a caller that could describe the "before"
   * could describe a no-op into a change.
   */
  readonly before: Readonly<Record<string, AmendValue>>
  /**
   * True when the insurer has already issued this record. Read off the record's
   * own state by the repository; a policy still in draft, proposal, sent or
   * declined has not been issued.
   */
  readonly issued: boolean
}

/* ---------------------------------------------------------------- the guards */

export function amendCarriesAReason(ctx: AmendContext): TransitionResult {
  if (ctx.reason.trim() === '') {
    return refuse(
      'A correction has to say why it is being made. The reason is written into the record’s trail beside the change, and a blank one leaves the next person reading it with a value that changed for no stated cause.',
    )
  }
  return allow()
}

export function amendNamesAField(ctx: AmendContext): TransitionResult {
  if (Object.keys(ctx.changes).length === 0) {
    return refuse('A correction has to name at least one field to correct.')
  }
  return allow()
}

export function amendTouchesNoIdentity(ctx: AmendContext): TransitionResult {
  const field = Object.keys(ctx.changes).find((name) =>
    (UNAMENDABLE_IDENTITY_FIELDS as readonly string[]).includes(name),
  )
  if (field !== undefined) {
    return refuse(
      `${field} is how this record is identified and where it came from. It is not correctable: a number that can be edited is a number two people can be reading aloud while holding different records.`,
    )
  }
  return allow()
}

export function amendTouchesNoLifecycleState(ctx: AmendContext): TransitionResult {
  const lifecycle = AMEND_POLICIES[ctx.entity].lifecycleField
  if (Object.prototype.hasOwnProperty.call(ctx.changes, lifecycle)) {
    return refuse(
      'A status changes through the workflow, not through a correction. Use the move that belongs to it, so the guards that protect the move actually run.',
    )
  }
  return allow()
}

export function amendTouchesNoAadhaar(ctx: AmendContext): TransitionResult {
  const field = Object.keys(ctx.changes).find((name) => /aadhaar/i.test(name))
  if (field !== undefined) {
    return refuse(
      'An Aadhaar number is never edited here, in full or masked. It is captured once through KYC and nowhere else, and a masked one is still an identifier.',
    )
  }
  return allow()
}

export function amendTouchesNoSensitiveField(ctx: AmendContext): TransitionResult {
  const field = Object.keys(ctx.changes).find((name) => SENSITIVE_FIELD_NAME.test(name))
  if (field !== undefined) {
    return refuse(
      `${field} holds identity, bank or health data, which no correction may reach. It is captured where it is captured and changed nowhere.`,
    )
  }
  return allow()
}

export function amendTouchesNoIssuedMoney(ctx: AmendContext): TransitionResult {
  if (!ctx.issued) return allow()

  const field = Object.keys(ctx.changes).find((name) => isMoneyField(ctx.entity, name))
  if (field !== undefined) {
    return refuse(
      `${field} is a contractual figure on a record the insurer has already issued. A premium changes through an endorsement, never through a correction — raise one so the delta and the refund are recorded against the version they belong to.`,
    )
  }
  return allow()
}

export function amendTouchesNoInsurerNumber(ctx: AmendContext): TransitionResult {
  if (!Object.prototype.hasOwnProperty.call(ctx.changes, 'insurerNo')) return allow()

  const current = ctx.before.insurerNo ?? null
  if (current !== null) {
    return refuse(
      `The insurer number ${String(current)} came from the insurer. Once it is on the record it is not ours to correct; ask them to reissue it if it is wrong.`,
    )
  }
  return allow()
}

export function amendStaysInsideTheAllowList(ctx: AmendContext): TransitionResult {
  const field = Object.keys(ctx.changes).find((name) => !isAmendableField(ctx.entity, name))
  if (field !== undefined) {
    return refuse(
      `${field} is not a correctable field on a ${ctx.entity}. Corrections are limited to ${amendableFields(ctx.entity).join(', ')}.`,
    )
  }
  return allow()
}

export function amendChangesSomething(ctx: AmendContext): TransitionResult {
  if (changedFields(ctx).length === 0) {
    return refuse(
      'Nothing in this correction differs from what is already recorded. Change a value, or cancel — an amendment that changes nothing still writes a reason into the trail, and a trail full of those is a trail nobody reads.',
    )
  }
  return allow()
}

/**
 * In order, first refusal wins. Legality before no-op deliberately: told that a
 * status is not correctable is more use than told the status is already that.
 */
export const AMEND_GUARDS: readonly ((ctx: AmendContext) => TransitionResult)[] = [
  amendCarriesAReason,
  amendNamesAField,
  amendTouchesNoIdentity,
  amendTouchesNoLifecycleState,
  amendTouchesNoAadhaar,
  amendTouchesNoSensitiveField,
  amendTouchesNoIssuedMoney,
  amendTouchesNoInsurerNumber,
  amendStaysInsideTheAllowList,
  amendChangesSomething,
]

export function amendVerdict(ctx: AmendContext): TransitionResult {
  for (const guard of AMEND_GUARDS) {
    const verdict = guard(ctx)
    if (!verdict.ok) return { ...verdict, guard: verdict.guard ?? guard.name }
  }
  return allow()
}

/* ----------------------------------------------------------- what changed */

/** The fields whose supplied value differs from what is recorded, in order. */
export function changedFields(ctx: AmendContext): readonly string[] {
  return Object.keys(ctx.changes).filter(
    (field) => ctx.changes[field] !== (ctx.before[field] ?? null),
  )
}

/**
 * Whether this field's before and after may appear in the audit event.
 *
 * `DomainEvent.detail` is read by the audit timeline and, in projected form, by
 * the Assistant, and its own doc comment says plainly: never an amount value and
 * never a sensitive field. So a money field and anything whose name reads like
 * identity, bank or health is recorded by NAME ONLY — the trail still says that
 * the premium was corrected, who corrected it and why, and carries no figure.
 */
export function mayEchoValue(entity: AmendableEntity, field: string): boolean {
  return !isMoneyField(entity, field) && !SENSITIVE_FIELD_NAME.test(field)
}

/**
 * The `record.amended` payload.
 *
 * Flat, because `detail` is flat. Which fields changed, the reason and the actor
 * always; the before and after only for a field `mayEchoValue` allows.
 */
export function amendDetail(
  ctx: AmendContext,
): Readonly<Record<string, string | number | boolean | null>> {
  const changed = changedFields(ctx)
  const detail: Record<string, string | number | boolean | null> = {
    reason: ctx.reason.trim(),
    fields: changed.join(', '),
    fieldCount: changed.length,
  }

  for (const field of changed) {
    if (!mayEchoValue(ctx.entity, field)) continue
    detail[`before.${field}`] = ctx.before[field] ?? null
    detail[`after.${field}`] = ctx.changes[field]
  }

  return detail
}

/* --------------------------------------------------------------- discard */

export const DISCARD_REASONS = {
  duplicate: 'duplicate',
  enteredInError: 'entered_in_error',
  testRecord: 'test_record',
  wrongNumber: 'wrong_number',
  spam: 'spam',
  customerRequest: 'customer_request',
} as const

export type DiscardReason = (typeof DISCARD_REASONS)[keyof typeof DISCARD_REASONS]

export const DISCARD_REASON_LABELS: Readonly<Record<DiscardReason, string>> = {
  duplicate: 'Duplicate of another record',
  entered_in_error: 'Entered in error',
  test_record: 'Test record',
  wrong_number: 'Wrong number',
  spam: 'Spam',
  customer_request: 'Customer asked us not to hold it',
}

export function isDiscardReason(value: string): value is DiscardReason {
  return (Object.values(DISCARD_REASONS) as readonly string[]).includes(value)
}

export type DiscardCommand = {
  readonly reason: DiscardReason
  readonly note?: string
  readonly actorId: string
}

/**
 * Bringing one back. `reason` is free text rather than a `DiscardReason`: the
 * reasons above say why a record should not have existed, and none of them
 * explains why it should exist again.
 */
export type RestoreCommand = {
  readonly reason: string
  readonly actorId: string
}

/**
 * The three that may be discarded, and the list is the design.
 *
 * All three are pre-contractual. A duplicate lead or a quotation raised against
 * the wrong customer is a mistake; nothing is owed on it and nothing regulatory
 * depends on it. Customers, policies, claims, endorsements, collections and
 * commission are absent, and absent is stronger than a runtime refusal would be:
 * `discard` is not on those repository interfaces at all, so the attempt does not
 * compile. The regulated path for those records is `assessErasure` below.
 */
export const DISCARDABLE_ENTITIES = ['Inquiry', 'Quotation', 'Deal'] as const
export type DiscardableEntity = (typeof DISCARDABLE_ENTITIES)[number]

/**
 * The entities that are never discarded, listed so the reason is written down
 * once rather than rediscovered. Nothing reads this at runtime — the absence of
 * a method is the control — but a reviewer asking "why can I not delete this
 * customer" gets the answer here.
 */
export const RETAINED_ENTITIES = [
  'Customer',
  'Policy',
  'Claim',
  'Endorsement',
  'CollectionRecord',
  'LedgerEntry',
] as const

export type DiscardMark = {
  readonly reason: DiscardReason
  readonly note: string | null
  readonly discardedBy: string
  /** The bus's stamp, so the mark and the event agree to the millisecond. */
  readonly discardedAt: string
}

/**
 * Mixed into the three discardable entities. Optional rather than nullable so a
 * record that has never been discarded carries nothing at all — which is what a
 * fixture, and a real row loaded from a spreadsheet, honestly is.
 */
export type Discardable = {
  readonly discard?: DiscardMark | null
}

export function discardMarkOf(record: unknown): DiscardMark | null {
  if (record === null || typeof record !== 'object') return null
  const mark = (record as Discardable).discard
  return mark ?? null
}

/** True for a row that has been discarded and not restored. */
export function isDiscarded(record: unknown): boolean {
  return discardMarkOf(record) !== null
}

export type DiscardContext = {
  readonly entity: DiscardableEntity
  readonly reason: string
  readonly note: string | null
  readonly alreadyDiscarded: boolean
  /**
   * What this record produced, named for the sentence — "the application
   * APP-0104", "a policy". Null when it produced nothing, which is the ordinary
   * case and the only one a discard is allowed in.
   */
  readonly downstream: string | null
}

export function discardCarriesARecognisedReason(ctx: DiscardContext): TransitionResult {
  if (!isDiscardReason(ctx.reason)) {
    return refuse(
      `"${ctx.reason}" is not a reason this platform records for a discard. Choose one of: ${Object.values(DISCARD_REASONS).join(', ')}.`,
    )
  }
  return allow()
}

export function discardIsNotRepeated(ctx: DiscardContext): TransitionResult {
  if (ctx.alreadyDiscarded) {
    return refuse(
      `This ${ctx.entity.toLowerCase()} has already been discarded. Restore it first if the discard was itself a mistake.`,
    )
  }
  return allow()
}

/**
 * A record that produced something downstream is part of the book.
 *
 * Discarding a deal a policy was written from would strip a rung out of the
 * audit spine — the policy would still point at it and the queues would no
 * longer show it. So the discard is refused and the sentence says what to undo
 * first, rather than the platform quietly orphaning a contract.
 */
export function discardLeavesNothingStranded(ctx: DiscardContext): TransitionResult {
  if (ctx.downstream !== null) {
    return refuse(
      `This ${ctx.entity.toLowerCase()} produced ${ctx.downstream}, so it is part of the record now and cannot be discarded. Undo what came of it first, or correct it instead.`,
    )
  }
  return allow()
}

export const DISCARD_GUARDS: readonly ((ctx: DiscardContext) => TransitionResult)[] = [
  discardCarriesARecognisedReason,
  discardIsNotRepeated,
  discardLeavesNothingStranded,
]

export function discardVerdict(ctx: DiscardContext): TransitionResult {
  for (const guard of DISCARD_GUARDS) {
    const verdict = guard(ctx)
    if (!verdict.ok) return { ...verdict, guard: verdict.guard ?? guard.name }
  }
  return allow()
}

export type RestoreContext = {
  readonly entity: DiscardableEntity
  readonly reason: string
  readonly discarded: boolean
}

export function restoreCarriesAReason(ctx: RestoreContext): TransitionResult {
  if (ctx.reason.trim() === '') {
    return refuse(
      'Bringing a discarded record back has to say why, for the same reason discarding it did.',
    )
  }
  return allow()
}

export function restoreFindsADiscardedRecord(ctx: RestoreContext): TransitionResult {
  if (!ctx.discarded) {
    return refuse(
      `This ${ctx.entity.toLowerCase()} has not been discarded, so there is nothing to restore.`,
    )
  }
  return allow()
}

export const RESTORE_GUARDS: readonly ((ctx: RestoreContext) => TransitionResult)[] = [
  restoreCarriesAReason,
  restoreFindsADiscardedRecord,
]

export function restoreVerdict(ctx: RestoreContext): TransitionResult {
  for (const guard of RESTORE_GUARDS) {
    const verdict = guard(ctx)
    if (!verdict.ok) return { ...verdict, guard: verdict.guard ?? guard.name }
  }
  return allow()
}

/** The `record.discarded` payload. The note is prose a person typed, so it goes. */
export function discardDetail(
  reason: DiscardReason,
  note: string | null,
): Readonly<Record<string, string | number | boolean | null>> {
  return { reason, note }
}

/* --------------------------------------------------------------- erasure */

/**
 * FR-20.2, the data principal's right to ask, and the honest set of answers.
 *
 * There is no fourth verdict called "refused". A request that cannot be granted
 * comes back as `retained_by_obligation` naming the obligation, because "no" with
 * no reason attached is exactly the answer the regulation exists to abolish.
 */
export const ERASE_VERDICTS = {
  erased: 'erased',
  retainedByObligation: 'retained_by_obligation',
  partial: 'partial',
} as const

export type EraseVerdict = (typeof ERASE_VERDICTS)[keyof typeof ERASE_VERDICTS]

export const RETENTION_OBLIGATIONS = {
  livePolicy: 'live_policy',
  openClaim: 'open_claim',
  retentionPeriod: 'retention_period',
} as const

export type RetentionObligation =
  (typeof RETENTION_OBLIGATIONS)[keyof typeof RETENTION_OBLIGATIONS]

/**
 * The sentence each obligation is explained with. Rendered as written, and
 * written for the person asking rather than for the person answering.
 */
export const RETENTION_OBLIGATION_SENTENCES: Readonly<Record<RetentionObligation, string>> = {
  live_policy:
    'A live insurance contract is held in this name. The insurer and this agency are required to keep the policy record for as long as the contract runs and for the retention period after it ends, so it cannot be erased today.',
  open_claim:
    'A claim on this file is still open. The claim record has to be kept until it is settled or closed and its retention period has run.',
  retention_period:
    'Closed records on this file are still inside their retention period. They are erased when it expires, and nothing on them is used for marketing in the meantime.',
}

/**
 * What is switched off in place of deletion. FR-20.2's "locks marketing use",
 * plus the automated chasing that would otherwise keep contacting somebody who
 * has asked us to stop.
 */
export const SUPPRESSIONS = {
  marketing: 'marketing',
  automatedReminders: 'automated_reminders',
} as const

export type Suppression = (typeof SUPPRESSIONS)[keyof typeof SUPPRESSIONS]

/** What the platform actually holds against this subject, counted by the caller. */
export type ErasureFacts = {
  readonly livePolicyCount: number
  readonly openClaimCount: number
  /** Closed records still inside their retention class's window. */
  readonly recordsInRetention: number
}

export type EraseAssessment = {
  readonly verdict: EraseVerdict
  readonly obligations: readonly RetentionObligation[]
  /** The obligations, joined into the prose the screen shows. Empty when erased. */
  readonly obligationNote: string
  readonly suppressed: readonly Suppression[]
}

/**
 * The decision, from facts alone.
 *
 * Pure and injectable so the screen, the test and the repository all reach the
 * same verdict. Note that suppression happens on every path except a full
 * erasure — where nothing is retained there is nothing left to suppress.
 */
export function assessErasure(facts: ErasureFacts): EraseAssessment {
  const obligations: RetentionObligation[] = []
  if (facts.livePolicyCount > 0) obligations.push(RETENTION_OBLIGATIONS.livePolicy)
  if (facts.openClaimCount > 0) obligations.push(RETENTION_OBLIGATIONS.openClaim)

  if (obligations.length > 0) {
    return {
      verdict: ERASE_VERDICTS.retainedByObligation,
      obligations,
      obligationNote: obligations
        .map((obligation) => RETENTION_OBLIGATION_SENTENCES[obligation])
        .join(' '),
      suppressed: [SUPPRESSIONS.marketing, SUPPRESSIONS.automatedReminders],
    }
  }

  if (facts.recordsInRetention > 0) {
    return {
      verdict: ERASE_VERDICTS.partial,
      obligations: [RETENTION_OBLIGATIONS.retentionPeriod],
      obligationNote: RETENTION_OBLIGATION_SENTENCES.retention_period,
      suppressed: [SUPPRESSIONS.marketing, SUPPRESSIONS.automatedReminders],
    }
  }

  return {
    verdict: ERASE_VERDICTS.erased,
    obligations: [],
    obligationNote: '',
    suppressed: [],
  }
}
