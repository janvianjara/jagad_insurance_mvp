/**
 * Claim — plan §9, FR-11, canvas n37-n50, P2.
 *
 *   raised -- policy inactive --> blocked (agent notified)
 *          -- policy active ----> intimated -> picked_up
 *              +- cashless -> upload_link_sent -> summary_received -> tracked
 *              +- file     -> checklist_raised -> docs_collected
 *                          -> filed_with_insurer <-> query_open
 *                          -> settlement_recorded -> closed
 *
 * The claims team owns a picked-up claim; the sales agent is informed and is not
 * the owner. §9's three bullets: close needs both a settlement record and a
 * company remark, the settlement figure is typed from the insurer's advice, and
 * a claim on an inactive policy is blocked with the agent told why.
 */

import { isMoney } from '../money'
import type { Money } from '../money'
import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const CLAIM_STATES = {
  raised: 'raised',
  blocked: 'blocked',
  intimated: 'intimated',
  pickedUp: 'picked_up',
  uploadLinkSent: 'upload_link_sent',
  summaryReceived: 'summary_received',
  tracked: 'tracked',
  checklistRaised: 'checklist_raised',
  docsCollected: 'docs_collected',
  filedWithInsurer: 'filed_with_insurer',
  queryOpen: 'query_open',
  settlementRecorded: 'settlement_recorded',
  closed: 'closed',
} as const

export type ClaimState = (typeof CLAIM_STATES)[keyof typeof CLAIM_STATES]

export const CLAIM_TYPES = { cashless: 'cashless', file: 'file' } as const
export type ClaimType = (typeof CLAIM_TYPES)[keyof typeof CLAIM_TYPES]

/**
 * What the cashless upload link collects. Named here rather than in the data
 * layer because the guard below is what gives the state its meaning, and the
 * layer rule runs domain to data, never back.
 */
export const CLAIM_UPLOAD_DOC_TYPE = 'discharge_summary'

/** Where the settlement figure came from. Only the insurer's advice is acceptable. */
export const SETTLEMENT_SOURCES = {
  insurerAdvice: 'insurer_advice',
  derived: 'derived',
} as const
export type SettlementSource = (typeof SETTLEMENT_SOURCES)[keyof typeof SETTLEMENT_SOURCES]

export type Settlement = {
  readonly amount?: Money
  readonly deduction?: Money
  readonly source?: SettlementSource
  readonly insurerAdviceRef?: string
}

export type ClaimContext = {
  readonly claimType?: ClaimType
  /** The policy this claim is raised against, as the platform holds it. */
  readonly policyActive?: boolean
  readonly policyStatus?: string
  /** Set by the recipe that tells the sourcing agent a claim was refused. */
  readonly agentNotified?: boolean
  readonly settlement?: Settlement
  /** Free text from the insurer about how they handled it. Feeds the insurer rating. */
  readonly companyRemark?: string
  readonly documentsCollected?: readonly string[]
  readonly checklistItems?: readonly string[]
  /** FR-11: the agent's direct-updates switch. Decides who the status message goes to. */
  readonly agentDirectUpdates?: boolean
  /**
   * Document types actually present against the claim, read off the ledger.
   *
   * Read, never asserted: a caller passing its own opinion of what has arrived is
   * the same mistake `everyRequiredDocumentPresent` was rewritten to stop making.
   */
  readonly presentDocTypes?: readonly string[]
}

export function policyActiveForClaim(ctx: ClaimContext): TransitionResult {
  if (ctx.policyActive !== true) {
    return refuse(
      `This policy is ${ctx.policyStatus ?? 'not active'}, so a claim cannot be intimated against it.`,
    )
  }
  return allow()
}

/** §9: a claim raised on an inactive policy is blocked, and the agent is told. */
export function policyInactiveAndAgentNotified(ctx: ClaimContext): TransitionResult {
  if (ctx.policyActive === true) {
    return refuse('This policy is active, so the claim proceeds to intimation rather than being blocked.')
  }
  if (ctx.agentNotified !== true) {
    return refuse(
      'Blocking a claim notifies the sourcing agent in the same move. A claim that fails silently is how a customer finds out at the hospital desk.',
    )
  }
  return allow()
}

export function claimTypeIsCashless(ctx: ClaimContext): TransitionResult {
  if (ctx.claimType !== CLAIM_TYPES.cashless) {
    return refuse('This is a reimbursement file claim, so it goes to the document checklist, not the cashless upload link.')
  }
  return allow()
}

export function claimTypeIsFile(ctx: ClaimContext): TransitionResult {
  if (ctx.claimType !== CLAIM_TYPES.file) {
    return refuse('This is a cashless claim, so it is tracked with the insurer rather than filed with documents.')
  }
  return allow()
}

export function checklistDocumentsCollected(ctx: ClaimContext): TransitionResult {
  const required = ctx.checklistItems ?? []
  if (required.length === 0) {
    return refuse('Raise the document checklist before marking documents collected.')
  }
  const held = new Set(ctx.documentsCollected ?? [])
  const missing = required.filter((item) => !held.has(item))
  if (missing.length > 0) {
    return refuse(`Still waiting on: ${missing.join(', ')}.`)
  }
  return allow()
}

/**
 * The cashless arm's equivalent of the checklist gate.
 *
 * `summary_received` is a statement about the file, not about the operator's
 * intention, so it is read off the documents present rather than taken on trust.
 * Without this the state could be reached with the upload link still empty, and
 * a claim would say the summary had arrived while the customer was still
 * standing at the discharge desk holding it.
 */
export function dischargeSummaryReceived(ctx: ClaimContext): TransitionResult {
  const present = ctx.presentDocTypes ?? []
  if (!present.includes(CLAIM_UPLOAD_DOC_TYPE)) {
    return refuse(
      'The discharge summary has not arrived yet. This step records a document that is on the file, so it cannot be marked received while the upload link is still empty.',
    )
  }
  return allow()
}

/**
 * §9: "Settlement amount and deduction are typed from the insurer's advice -
 * never derived." Presence and provenance, no arithmetic.
 */
export function settlementTypedFromInsurerAdvice(ctx: ClaimContext): TransitionResult {
  const settlement = ctx.settlement
  if (!settlement || !isMoney(settlement.amount)) {
    return refuse('Type the settled amount from the insurer advice before recording the settlement.')
  }
  if (settlement.source === SETTLEMENT_SOURCES.derived) {
    return refuse(
      'The settled amount is marked as derived. Settlement and deduction are typed from the insurer advice, never worked out from the claimed figure.',
    )
  }
  if (!settlement.insurerAdviceRef || settlement.insurerAdviceRef.trim().length === 0) {
    return refuse('Record the insurer advice reference the settled figure was taken from.')
  }
  return allow()
}

/**
 * §9: "Close requires both a settlement record and a company remark. The remark
 * feeds the insurer rating." Both, not either.
 */
export function claimCloseRequiresSettlementAndCompanyRemark(ctx: ClaimContext): TransitionResult {
  const hasSettlement = ctx.settlement !== undefined && isMoney(ctx.settlement.amount)
  const hasRemark = (ctx.companyRemark ?? '').trim().length > 0

  if (!hasSettlement && !hasRemark) {
    return refuse('A claim closes on a settlement record and a company remark. Neither is present.')
  }
  if (!hasSettlement) {
    return refuse('Record the settlement from the insurer advice before closing this claim.')
  }
  if (!hasRemark) {
    return refuse(
      'Add the company remark before closing. It is what the insurer rating is built from, so an unremarked close costs the agency the data.',
    )
  }
  return allow()
}

export type StatusMessageRouting = {
  readonly to: 'customer' | 'agent'
  /** True when the message was rerouted because the agent's direct-updates switch is off. */
  readonly rerouteLogged: boolean
}

/**
 * FR-11: "Every status change fires a customer message, unless the agent's
 * direct-updates toggle is OFF, in which case it routes to the agent and the
 * reroute is logged." The log is the part people forget.
 */
export function routeStatusMessage(ctx: ClaimContext): StatusMessageRouting {
  if (ctx.agentDirectUpdates === false) {
    return { to: 'agent', rerouteLogged: true }
  }
  return { to: 'customer', rerouteLogged: false }
}

export const CLAIM_TRANSITIONS = {
  raised: {
    blocked: {
      event: 'claim.blocked',
      alsoEmits: ['message.sent'],
      guards: [policyInactiveAndAgentNotified],
    },
    intimated: {
      event: 'claim.intimated',
      alsoEmits: ['message.sent'],
      guards: [policyActiveForClaim],
      note: 'System claim number plus the insurer email, CC the agent.',
    },
  },
  intimated: {
    picked_up: {
      event: 'claim.picked_up',
      alsoEmits: ['message.sent'],
      note: 'The claims team owns it from here; the sales agent is informed, not the owner.',
    },
  },
  picked_up: {
    upload_link_sent: {
      event: 'claim.status_changed',
      alsoEmits: ['message.sent'],
      guards: [claimTypeIsCashless],
    },
    checklist_raised: {
      event: 'claim.status_changed',
      alsoEmits: ['message.sent'],
      guards: [claimTypeIsFile],
    },
  },
  upload_link_sent: {
    summary_received: {
      event: 'claim.status_changed',
      alsoEmits: ['message.sent'],
      guards: [dischargeSummaryReceived],
      note: 'Read off the upload ledger. The link, not the operator, says it arrived.',
    },
  },
  summary_received: {
    tracked: { event: 'claim.status_changed', alsoEmits: ['message.sent'] },
  },
  tracked: {
    settlement_recorded: {
      event: 'claim.settlement_recorded',
      alsoEmits: ['message.sent'],
      guards: [settlementTypedFromInsurerAdvice],
    },
  },
  checklist_raised: {
    docs_collected: {
      event: 'claim.status_changed',
      alsoEmits: ['message.sent'],
      guards: [checklistDocumentsCollected],
      note: 'Collected by the customer or picked up on field. Same state either way.',
    },
  },
  docs_collected: {
    filed_with_insurer: { event: 'claim.status_changed', alsoEmits: ['message.sent'] },
  },
  filed_with_insurer: {
    query_open: { event: 'claim.query_opened', alsoEmits: ['message.sent'] },
    settlement_recorded: {
      event: 'claim.settlement_recorded',
      alsoEmits: ['message.sent'],
      guards: [settlementTypedFromInsurerAdvice],
    },
  },
  query_open: {
    filed_with_insurer: {
      event: 'claim.status_changed',
      alsoEmits: ['message.sent'],
      note: 'The multi-language query loop. It can run several times.',
    },
  },
  settlement_recorded: {
    closed: {
      event: 'claim.closed',
      alsoEmits: ['message.sent'],
      guards: [claimCloseRequiresSettlementAndCompanyRemark],
    },
  },
} as const satisfies TransitionTable<ClaimState, ClaimContext>

export const claimMachine = createMachine<ClaimState, ClaimContext>({
  name: 'claim',
  states: Object.values(CLAIM_STATES),
  initial: CLAIM_STATES.raised,
  transitions: CLAIM_TRANSITIONS,
})
