/**
 * The shape of one line in an assignment trail.
 *
 * Kept apart from the component so the feature that builds a trail (P-11's
 * inquiry detail, and any later module that hands work between people) depends
 * on a type rather than on a rendered tree, and so the builder can be tested
 * without a DOM.
 *
 * Two fields carry the §9 promises that this component exists to make visible:
 *
 *   `until`   — when the holder let go. Present on every closed hold, absent on
 *               the current one, which is what lets the trail show how long each
 *               person actually sat on the record rather than only who has it.
 *   `carries` — the holders an escalation took with it. §9 is explicit that
 *               "escalation carries the full assignment history, not just the
 *               item", so the escalation line renders the whole trail it brought
 *               rather than pointing at the item and leaving the manager to go
 *               looking.
 */

import type { Tone } from '../../ui/tone'
import type { IconName } from '../../ui/Icon'

export const TRAIL_KINDS = {
  created: 'created',
  assigned: 'assigned',
  accepted: 'accepted',
  reassigned: 'reassigned',
  escalated: 'escalated',
  unrouted: 'unrouted',
  converted: 'converted',
  lost: 'lost',
  notified: 'notified',
} as const

export type TrailKind = (typeof TRAIL_KINDS)[keyof typeof TRAIL_KINDS]

/** How each kind reads. Colour comes from the shared tone map, never from here. */
export const TRAIL_KIND_STYLE: Readonly<Record<TrailKind, { tone: Tone; icon: IconName }>> = {
  created: { tone: 'info', icon: 'plus' },
  assigned: { tone: 'warn', icon: 'users' },
  accepted: { tone: 'ok', icon: 'check' },
  reassigned: { tone: 'warn', icon: 'sort' },
  escalated: { tone: 'bad', icon: 'alert' },
  unrouted: { tone: 'attn', icon: 'inbox' },
  converted: { tone: 'ok', icon: 'doc' },
  lost: { tone: 'idle', icon: 'close' },
  notified: { tone: 'info', icon: 'msg' },
}

/** One holder carried into an escalation. */
export type TrailCarry = {
  readonly id: string
  /** Who held it. */
  readonly label: string
  readonly from: string
  readonly to?: string | null
  readonly reason?: string
}

export type TrailEntry = {
  readonly id: string
  readonly kind: TrailKind
  /** The sentence the line leads with. Written for the person reading it. */
  readonly title: string
  /** When it happened, ISO. */
  readonly at: string
  /** When the hold this line opened ended. Absent while it is still open. */
  readonly until?: string | null
  readonly detail?: string
  /** Who did it, resolved to a name by the caller — this component reads no repository. */
  readonly actorName?: string
  /**
   * The allowance the hold was measured against, in minutes. Comes from the
   * routing recipe's category; this module holds no default and renders no clock
   * without one.
   */
  readonly tatMinutes?: number
  /** The full assignment history an escalation brought with it. */
  readonly carries?: readonly TrailCarry[]
}
