/**
 * How a claim reads: its wording, its colour, how much trouble it is in, and
 * who its next status message goes to.
 *
 * Pure, and deliberately outside the screens, for the same reason the inquiry
 * module keeps its own view module: three of the things decided here are §9
 * assertions rather than presentation choices, and each is easier to keep honest
 * when it can be tested without a DOM.
 *
 *   - a machine state maps to a tone through `src/ui/tone.ts` and nowhere else;
 *   - the pipeline a claim is walking is the machine's own fork (cashless or
 *     file), so the stage strip cannot show a step the machine would refuse;
 *   - FR-11's message routing is `routeStatusMessage` from the domain, read
 *     through the agent's own `directUpdatesEnabled` field. This module adds the
 *     wording, never the decision.
 */

import { routeStatusMessage } from '../../domain/workflows'
import type { ClaimState, ClaimType, StatusMessageRouting } from '../../domain/workflows'
import type { Agent, Claim } from '../../data/repo'
import type { Severity, Tone } from '../../ui/tone'

/** The one place a claim state becomes a colour. U7 wording, U7 tones. */
export const CLAIM_TONE: Readonly<Record<ClaimState, Tone>> = {
  raised: 'attn',
  blocked: 'bad',
  intimated: 'info',
  picked_up: 'info',
  upload_link_sent: 'warn',
  summary_received: 'info',
  tracked: 'info',
  checklist_raised: 'attn',
  docs_collected: 'info',
  filed_with_insurer: 'warn',
  query_open: 'attn',
  settlement_recorded: 'ok',
  closed: 'idle',
}

export const CLAIM_LABEL: Readonly<Record<ClaimState, string>> = {
  raised: 'Raised',
  blocked: 'Blocked',
  intimated: 'Intimated',
  picked_up: 'Picked up',
  upload_link_sent: 'Upload link sent',
  summary_received: 'Summary received',
  tracked: 'Tracked with insurer',
  checklist_raised: 'Checklist raised',
  docs_collected: 'Documents collected',
  filed_with_insurer: 'Filed with insurer',
  query_open: 'Query open',
  settlement_recorded: 'Settlement recorded',
  closed: 'Closed',
}

export const CLAIM_TYPE_LABEL: Readonly<Record<ClaimType, string>> = {
  cashless: 'Cashless',
  file: 'Reimbursement file',
}

/**
 * Queue stripe severity — how much trouble the row is in, not which state it
 * holds. The pill beside it already says the state.
 */
export function claimSeverity(claim: Claim): Severity {
  switch (claim.state) {
    case 'blocked':
      return 'hot'
    case 'raised':
    case 'query_open':
    case 'checklist_raised':
      return 'attn'
    case 'upload_link_sent':
    case 'filed_with_insurer':
      return 'warm'
    case 'settlement_recorded':
      return 'good'
    default:
      return 'cool'
  }
}

/** Unowned work sorts above owned work, and blocked above everything. */
export function claimPinRank(claim: Claim): number {
  if (claim.state === 'blocked') return 0
  if (claim.state === 'query_open') return 1
  if (claim.ownerId === null && claim.state !== 'closed') return 2
  if (claim.state === 'raised') return 3
  return 4
}

/* ------------------------------------------------------------------ pipeline */

/** The fork §9 draws: a claim walks one of these two, never a mixture. */
export const CASHLESS_PIPELINE: readonly ClaimState[] = [
  'raised',
  'intimated',
  'picked_up',
  'upload_link_sent',
  'summary_received',
  'tracked',
  'settlement_recorded',
  'closed',
]

export const FILE_PIPELINE: readonly ClaimState[] = [
  'raised',
  'intimated',
  'picked_up',
  'checklist_raised',
  'docs_collected',
  'filed_with_insurer',
  'settlement_recorded',
  'closed',
]

export function pipelineFor(claimType: ClaimType): readonly ClaimState[] {
  return claimType === 'cashless' ? CASHLESS_PIPELINE : FILE_PIPELINE
}

/**
 * Where the claim has got to on its own pipeline. `query_open` is not a step —
 * §9 draws it as a loop off `filed_with_insurer` that can run several times — so
 * it reads as the step it loops from.
 */
export function pipelineIndex(claim: Claim): number {
  const pipeline = pipelineFor(claim.claimType)
  const state = claim.state === 'query_open' ? 'filed_with_insurer' : claim.state
  return pipeline.indexOf(state)
}

/** Documents on the checklist that have not arrived. Drives the collected gate. */
export function outstandingChecklist(claim: Claim): readonly string[] {
  const held = new Set(claim.documentsCollected)
  return claim.checklistItems.filter((item) => !held.has(item))
}

/* ------------------------------------------------------------------- routing */

export type StatusMessagePlan = StatusMessageRouting & {
  /** Rendered in the confirm gate's note, before anything is written. */
  readonly note: string
}

/**
 * FR-11: "Every status change fires a customer message, unless the agent's
 * direct-updates toggle is OFF, in which case it routes to the agent and the
 * reroute is logged."
 *
 * The decision is `routeStatusMessage`'s, from §9. What this adds is the
 * sentence, and the fact that a claim with no sourcing agent still messages the
 * customer — there is no toggle to be off.
 */
export function planStatusMessage(
  customerName: string,
  agent: Agent | null,
): StatusMessagePlan {
  const routing = routeStatusMessage({
    ...(agent === null ? {} : { agentDirectUpdates: agent.directUpdatesEnabled }),
  })

  if (routing.to === 'agent' && agent !== null) {
    return {
      ...routing,
      note: `Direct updates are off for ${agent.name}, so this status message routes to them rather than to ${customerName}. The reroute is logged on the claim.`,
    }
  }

  return {
    ...routing,
    note: `${customerName} is messaged with the claim number as this status changes. ${
      agent === null
        ? 'No sourcing agent is linked to this claim.'
        : `${agent.name} is copied as the sourcing agent.`
    }`,
  }
}
