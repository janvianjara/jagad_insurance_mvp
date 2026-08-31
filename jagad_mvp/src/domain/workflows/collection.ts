/**
 * Payment and collection — plan §9, FR-10.4 and FR-12.9, canvas n20-n23, P1.
 *
 *   fork -+- direct_to_company -> reference recorded (no agency books)
 *         +- via_agency -> recorded -> verified (back-office) -> closed
 *                             +- cheque -> bounced -> follow-up task, collection reopens
 *
 * Record-only, and more literally here than anywhere else in the product: the
 * platform notes that money moved and issues nothing. §9's two bullets are the
 * receipt refusal and back-office verification before an on-field collection can
 * close.
 */

import { isMoney } from '../money'
import type { Money } from '../money'
import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const COLLECTION_STATES = {
  pending: 'pending',
  referenceRecorded: 'reference_recorded',
  recorded: 'recorded',
  verified: 'verified',
  bounced: 'bounced',
  closed: 'closed',
} as const

export type CollectionState = (typeof COLLECTION_STATES)[keyof typeof COLLECTION_STATES]

export const COLLECTION_ROUTES = {
  directToCompany: 'direct_to_company',
  viaAgency: 'via_agency',
} as const
export type CollectionRoute = (typeof COLLECTION_ROUTES)[keyof typeof COLLECTION_ROUTES]

export const COLLECTION_INSTRUMENTS = {
  cash: 'cash',
  cheque: 'cheque',
  online: 'online',
  mandate: 'mandate',
} as const
export type CollectionInstrument =
  (typeof COLLECTION_INSTRUMENTS)[keyof typeof COLLECTION_INSTRUMENTS]

/** Where the money was taken. On-field is the one §9 singles out. */
export const COLLECTION_MODES = { backOffice: 'back_office', onField: 'on_field' } as const
export type CollectionMode = (typeof COLLECTION_MODES)[keyof typeof COLLECTION_MODES]

export type Verification = {
  readonly userId: string
  /** The verifier sits in the back office, not in the field. */
  readonly isBackOffice: boolean
  readonly verifiedAt: string
}

export type CollectionContext = {
  readonly now: Date
  readonly route: CollectionRoute
  readonly instrument: CollectionInstrument
  readonly mode: CollectionMode
  /** Typed by whoever recorded it. Presence is checked; the figure is never produced here. */
  readonly amount?: Money
  /** The insurer's or bank's own reference for a direct payment. */
  readonly reference?: string
  /** True if a caller tried to post a direct-to-company payment into the agency books. */
  readonly agencyBooksTouched?: boolean
  readonly collectedBy?: string
  readonly verification?: Verification
  /** Set by the recipe that raises the bounce follow-up. */
  readonly followUpTaskCreated?: boolean
  readonly followUpTaskDueOn?: string
  readonly bounceReason?: string
}

export function amountRecorded(ctx: CollectionContext): TransitionResult {
  if (!isMoney(ctx.amount)) {
    return refuse('Type the amount collected. The platform records what was paid; it never fills the figure in.')
  }
  return allow()
}

/** §9: "direct_to_company -> reference recorded (no agency books)". */
export function directToCompanyWritesNoAgencyBooks(ctx: CollectionContext): TransitionResult {
  if (ctx.route !== COLLECTION_ROUTES.directToCompany) {
    return refuse('This collection is routed via the agency, so it is recorded in the agency books rather than as a reference.')
  }
  if (!ctx.reference || ctx.reference.trim().length === 0) {
    return refuse('Record the insurer or bank reference for the direct payment.')
  }
  if (ctx.agencyBooksTouched === true) {
    return refuse(
      'A payment made straight to the company never touches the agency books. Record the reference only.',
    )
  }
  return allow()
}

export function routedViaAgency(ctx: CollectionContext): TransitionResult {
  if (ctx.route !== COLLECTION_ROUTES.viaAgency) {
    return refuse('This payment went straight to the company, so there is nothing for the agency to record.')
  }
  return allow()
}

/** §9: verification is a back-office act. The person who collected cannot wave it through. */
export function backOfficeVerification(ctx: CollectionContext): TransitionResult {
  const verification = ctx.verification
  if (!verification) {
    return refuse('Back-office verification is missing for this collection.')
  }
  if (!verification.isBackOffice) {
    return refuse(`${verification.userId} is not back-office staff. Verification of a collection is a back-office act.`)
  }
  if (ctx.collectedBy && ctx.collectedBy === verification.userId) {
    return refuse('The person who collected the money cannot be the person who verifies it.')
  }
  return allow()
}

/** §9: "On-field collections require back-office verification before the item can close." */
export function onFieldRequiresBackOfficeVerification(ctx: CollectionContext): TransitionResult {
  if (ctx.mode !== COLLECTION_MODES.onField) return allow()
  return backOfficeVerification(ctx)
}

export function instrumentIsCheque(ctx: CollectionContext): TransitionResult {
  if (ctx.instrument !== COLLECTION_INSTRUMENTS.cheque) {
    return refuse(`A ${ctx.instrument} payment cannot bounce. Only a cheque can.`)
  }
  return allow()
}

/** §9: "cheque -> bounced -> follow-up task auto-created, collection reopens". */
export function bounceRaisesFollowUpTask(ctx: CollectionContext): TransitionResult {
  if (!ctx.bounceReason || ctx.bounceReason.trim().length === 0) {
    return refuse('Record the bank reason for the bounce.')
  }
  if (ctx.followUpTaskCreated !== true) {
    return refuse(
      'A bounced cheque raises a follow-up task as part of the same move. Without it the collection quietly stops being chased.',
    )
  }
  return allow()
}

/**
 * §9: "Record-only. No receipt slip is issued by the platform." A function
 * rather than a comment, so the screen can say it in the customer's words.
 */
export function canIssueReceipt(): TransitionResult {
  return refuse(
    'This platform records collections; it does not issue receipts. The receipt comes from the insurer or the agency, on their own stationery.',
  )
}

export const COLLECTION_TRANSITIONS = {
  pending: {
    reference_recorded: {
      event: 'payment.reference_recorded',
      guards: [directToCompanyWritesNoAgencyBooks, amountRecorded],
    },
    recorded: {
      event: 'collection.recorded',
      guards: [routedViaAgency, amountRecorded],
    },
  },
  reference_recorded: {
    closed: { event: 'collection.closed' },
  },
  recorded: {
    verified: { event: 'collection.verified', guards: [backOfficeVerification] },
    bounced: {
      /*
       * This edge used to carry `alsoEmits: ['task.created', 'message.sent']`,
       * and both were fictions: the events fired with the COLLECTION as their
       * subject, no `Task` row was ever written and no `MessageLog` either, so
       * the FR-15 queue stayed empty while the audit trail said a task had been
       * raised. That is the P-15 backlog entry.
       *
       * The follow-up is now raised by the `collection.bounceFollowUp` recipe,
       * which is what that recipe has always said it does — it writes a real task
       * through `TaskRepository.create`, and the `task.created` that comes back
       * carries the task's own id as its subject and this event's id as its
       * cause. The guard below stays: §9's rule is that a bounce raises a
       * follow-up as part of the same move, and it is the caller's promise to
       * make whether or not automation is the thing that keeps it.
       */
      event: 'cheque.bounced',
      guards: [instrumentIsCheque, bounceRaisesFollowUpTask],
    },
    closed: {
      event: 'collection.closed',
      guards: [onFieldRequiresBackOfficeVerification],
      note: '§9: an on-field collection cannot close without back-office verification.',
    },
  },
  verified: {
    closed: { event: 'collection.closed' },
  },
  bounced: {
    recorded: {
      event: 'collection.reopened',
      guards: [routedViaAgency],
      note: '§9: the collection reopens; the money is still owed.',
    },
  },
} as const satisfies TransitionTable<CollectionState, CollectionContext>

export const collectionMachine = createMachine<CollectionState, CollectionContext>({
  name: 'collection',
  states: Object.values(COLLECTION_STATES),
  initial: COLLECTION_STATES.pending,
  transitions: COLLECTION_TRANSITIONS,
})
