/**
 * The event bus — plan §7 "Events".
 *
 * The PRD's automation engine is an event bus, so the MVP emits the same event
 * names from a small synchronous in-memory dispatcher on every workflow
 * transition. Two things fall out free: the audit timeline is just the event log,
 * and when a real backend arrives the names already match the FR contracts.
 *
 * Names below are drawn from the §9 machines. Later steps add to the list; they
 * do not rename what is here, because these strings are a contract.
 */

export const DOMAIN_EVENT_NAMES = [
  // Inquiry — FR-06.3
  'inquiry.created',
  'inquiry.assigned',
  'inquiry.confirmed',
  'inquiry.unconfirmed',
  'inquiry.accepted',
  'inquiry.reassigned',
  'inquiry.unrouted',
  'inquiry.escalated',
  'inquiry.converted',
  'inquiry.lost',

  // Quotation — FR-06.5 to .10
  'quotation.created',
  'quotation.composed',
  'quotation.generated',
  'quotation.shared',
  'quotation.revision_requested',
  'quotation.won',
  'quotation.lost',

  // Deal and policy — FR-06.11, FR-10.1
  'deal.created',
  'deal.line_items_set',
  'deal.consumed',
  'policy.drafted',
  'policy.proposal_created',
  'policy.proposal_sent',
  'policy.issued',
  'policy.declined',
  'policy.dispatched',
  'policy.documents_collected',
  'policy.closed',
  'policy.locked',
  'policy.lapsed',

  // KYC and consent — FR-09.3, .9
  'kyc.started',
  'kyc.partial',
  'kyc.completed',
  'consent.link_issued',
  'consent.submitted',
  'consent.expired',
  'credentials.generated',

  // Payment and collection — FR-10.4, FR-12.9
  'collection.recorded',
  'collection.verified',
  'payment.reference_recorded',
  'cheque.bounced',
  'collection.reopened',
  'collection.closed',

  // Claim — FR-11
  'claim.raised',
  'claim.blocked',
  'claim.intimated',
  'claim.picked_up',
  'claim.status_changed',
  'claim.query_opened',
  'claim.settlement_recorded',
  'claim.closed',

  // Renewal and notice batch — FR-12
  'renewal.scheduled',
  'renewal.due',
  'renewal.assigned',
  'renewal.reminded',
  'renewal.completed',
  'renewal.lapsed',
  'renewal.win_back_listed',
  'notice.batch_uploaded',
  'notice.ocr_started',
  'notice.ocr_completed',
  'notice.row_matched',
  'notice.row_unmatched',
  'notice.row_rejected',
  'notice.sent',

  // Premium schedule and mandate — D-A
  'schedule.created',
  'schedule.activated',
  'schedule.superseded',
  'schedule.completed',
  'instalment.due',
  'instalment.paid',
  'instalment.missed',
  'instalment.in_grace',
  'instalment.resumed',
  'instalment.grace_expired',
  'mandate.registered',
  'mandate.debit_succeeded',
  'mandate.failed',
  'mandate.cancelled',
  'mandate.expired',

  // Endorsement and cancellation — FR-13
  'endorsement.type_selected',
  'endorsement.delta_recorded',
  'endorsement.refund_recorded',
  'endorsement.refund_blocked',
  'endorsement.submitted',
  'endorsement.approved',
  'policy.versioned',

  // Money — FR-07.3a, FR-14.9
  'commission.booked',

  // Work, records, messaging
  'task.created',
  'task.completed',
  'document.uploaded',
  'document.verified',
  'message.sent',

  // Assistant — FR-22
  'assistant.notice_raised',
  'assistant.action_confirmed',
] as const

export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number]

/** What the event happened to. Enough for the audit timeline to link back. */
export type EventSubject = {
  readonly entity: string
  readonly id: string
}

export type DomainEvent = {
  readonly name: DomainEventName
  readonly at: string
  readonly actorId?: string
  readonly subject?: EventSubject
  /**
   * Workflow detail — a reason, a previous state, a count. Never an amount value
   * and never a sensitive field: this log is read by the audit timeline and, in
   * projected form, by the Assistant.
   */
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>
}

export type EventInit = Omit<DomainEvent, 'name' | 'at'> & { at?: string }

export type EventHandler = (event: DomainEvent) => void
export type Unsubscribe = () => void

export type EventBus = {
  emit(name: DomainEventName, init?: EventInit): DomainEvent
  on(name: DomainEventName, handler: EventHandler): Unsubscribe
  onAny(handler: EventHandler): Unsubscribe
  /**
   * The audit seam. Sinks registered here see every event before the ordinary
   * subscribers, which is what makes the audit trail complete rather than
   * best-effort. FR-20.4's append-only store subscribes here.
   */
  onAudit(sink: EventHandler): Unsubscribe
}

export type EventBusOptions = {
  /** Injectable so fixtures and tests produce identical timestamps. */
  now?: () => Date
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const now = options.now ?? (() => new Date())
  const byName = new Map<DomainEventName, Set<EventHandler>>()
  const anyHandlers = new Set<EventHandler>()
  const auditSinks = new Set<EventHandler>()

  function subscribe(set: Set<EventHandler>, handler: EventHandler): Unsubscribe {
    set.add(handler)
    return () => {
      set.delete(handler)
    }
  }

  return {
    emit(name, init = {}) {
      const { at, ...rest } = init
      const event: DomainEvent = { name, at: at ?? now().toISOString(), ...rest }

      // Audit first, and errors are not swallowed: a failed audit write must fail
      // the transition, not leave an unlogged mutation behind.
      for (const sink of auditSinks) sink(event)
      for (const handler of byName.get(name) ?? []) handler(event)
      for (const handler of anyHandlers) handler(event)

      return event
    },

    on(name, handler) {
      const set = byName.get(name) ?? new Set<EventHandler>()
      byName.set(name, set)
      return subscribe(set, handler)
    },

    onAny(handler) {
      return subscribe(anyHandlers, handler)
    },

    onAudit(sink) {
      return subscribe(auditSinks, sink)
    },
  }
}

/** The bus the running app uses. Tests and fixtures create their own. */
export const eventBus: EventBus = createEventBus()

export function isDomainEventName(value: string): value is DomainEventName {
  return (DOMAIN_EVENT_NAMES as readonly string[]).includes(value)
}
