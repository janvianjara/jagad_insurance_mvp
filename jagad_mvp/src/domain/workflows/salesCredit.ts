/**
 * Sales credit — plan §9, FR-07.3a and FR-14.9, scenario 2.7, P1.
 *
 * Who gets paid for a sale, resolved once and recorded with the reason.
 *
 * The agent and the sub-agent are the two facts the commission chain cannot be
 * reckoned without, and until now each record in the pipeline declared them for
 * itself: an inquiry carried both, a quotation carried only the agent, and a
 * deal carried columns for both that nothing ever filled in. The result was a
 * chain that could only be reconstructed by hand after the policy was issued.
 *
 * This module is the one place the question is answered. It is pure — no clock,
 * no repository, no session — so a screen can preview the answer inside a
 * `<ConfirmGate>` before anything is written, and a test can assert it without
 * rendering. That is the same shape `planEscalation` already has for routing,
 * and for the same reason.
 *
 * Two rules carry the whole module:
 *
 *   **One rung decides, and a lower one may only complete it.** The rungs are
 *   tried in order and the first that names anybody wins the agent. A lower rung
 *   can supply a missing sub-agent, but only when it names the same agent —
 *   otherwise it describes a different arrangement, and the sub-agent share is
 *   carved from the agent's own cut, so pairing two people who never agreed
 *   would carve it out of somebody else's money.
 *
 *   **The rung is recorded.** `source` says which record the answer came from,
 *   so a commission booking that looks wrong can be traced to the row that
 *   caused it instead of being argued about.
 *
 * What this module does NOT do is decide whether the answer is usable. A
 * sub-agent with no agent is a real state of the data and it is returned as
 * found; `subAgentRequiresAgent` in `./deal` is what refuses it, at the point
 * where a person can still fix it.
 */

import { allow, refuse } from './machine'
import type { TransitionResult } from './machine'

/** Which record the credit was read off. Recorded on the deal beside the ids. */
export const SALES_CREDIT_SOURCES = {
  /** Named on the award itself, by the person closing the sale. */
  stated: 'stated',
  quotation: 'quotation',
  inquiry: 'inquiry',
  customer: 'customer',
} as const

export type SalesCreditSource =
  (typeof SALES_CREDIT_SOURCES)[keyof typeof SALES_CREDIT_SOURCES]

/** One record's answer to the question. Both halves, or neither. */
export type SalesCreditRung = {
  readonly agentId: string | null
  readonly subAgentId: string | null
}

/**
 * The rungs, highest precedence first in the type as well as in the code, so the
 * order is readable without following the implementation.
 */
export type SalesCreditInput = {
  readonly stated?: SalesCreditRung | null
  readonly quotation?: SalesCreditRung | null
  readonly inquiry?: SalesCreditRung | null
  readonly customer?: SalesCreditRung | null
}

export type SalesCredit = SalesCreditRung & {
  /** `null` when no record named anybody — an unattributed sale is a real state. */
  readonly source: SalesCreditSource | null
}

/** The precedence, stated once. Read by `resolveSalesCredit` and by its test. */
export const SALES_CREDIT_PRECEDENCE = [
  SALES_CREDIT_SOURCES.stated,
  SALES_CREDIT_SOURCES.quotation,
  SALES_CREDIT_SOURCES.inquiry,
  SALES_CREDIT_SOURCES.customer,
] as const

function namesAnybody(rung: SalesCreditRung | null | undefined): rung is SalesCreditRung {
  if (!rung) return false
  return rung.agentId !== null || rung.subAgentId !== null
}

/**
 * The first rung that names anybody, taken whole — then completed, carefully.
 *
 * The winning rung decides the agent. Where it names an agent but no sub-agent,
 * a lower rung may supply one, and only on a strict condition: that rung must
 * name **the same agent**. A quotation composed by Kiran and a customer record
 * that puts Meera under Kiran describe one arrangement between them, so reading
 * the sub-agent off the customer completes a fact rather than inventing one. A
 * customer record naming Meera under somebody else describes a different
 * arrangement entirely, and that sub-agent is left where they are.
 *
 * That condition is the whole safety of the fall-through. Without it this would
 * pair two people who were never on one agreement, and since the sub-agent share
 * is carved from the agent's own cut, the chain would carve it out of a cut that
 * belongs to somebody who never agreed to it.
 *
 * An empty result is not a failure. Plenty of business is written with no agent
 * at all — direct customers, walk-ins, renewals the agency owns outright — and
 * the commission chain handles that case by paying the agency the lot. Inventing
 * an agent for those would be worse than leaving the field empty.
 */
export function resolveSalesCredit(input: SalesCreditInput): SalesCredit {
  for (let i = 0; i < SALES_CREDIT_PRECEDENCE.length; i += 1) {
    const source = SALES_CREDIT_PRECEDENCE[i]
    const rung = input[source]
    if (!namesAnybody(rung)) continue

    if (rung.subAgentId !== null || rung.agentId === null) {
      return { agentId: rung.agentId, subAgentId: rung.subAgentId, source }
    }

    // The agent is known and the sub-agent is not. Look down the remaining
    // rungs for one describing the same agent, and take only its sub-agent.
    for (let j = i + 1; j < SALES_CREDIT_PRECEDENCE.length; j += 1) {
      const lower = input[SALES_CREDIT_PRECEDENCE[j]]
      if (!lower) continue
      if (lower.agentId === rung.agentId && lower.subAgentId !== null) {
        return { agentId: rung.agentId, subAgentId: lower.subAgentId, source }
      }
    }
    return { agentId: rung.agentId, subAgentId: null, source }
  }
  return { agentId: null, subAgentId: null, source: null }
}

/**
 * §9's arrangement rule, raised one step earlier than the booking.
 *
 * `commissionChain` already refuses a sub-agent with no agent, because the share
 * is carved from the agent's cut and there is nothing to carve from. By then the
 * policy has been issued and the sale is history. Asking the same question when
 * the deal is opened puts the refusal where somebody can still answer it, and
 * the wording is deliberately close to the chain's own so the two read as one
 * rule rather than two.
 */
export function subAgentRequiresAgent(credit: SalesCreditRung): TransitionResult {
  if (credit.subAgentId !== null && credit.agentId === null) {
    return refuse(
      `A sub-agent share is carved from the agent cut, so this sale needs the agent ${credit.subAgentId} sits under. Name the agent before taking the deal forward.`,
    )
  }
  return allow()
}
