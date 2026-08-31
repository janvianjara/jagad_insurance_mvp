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
  // The decision, and its reversal. `quotation.won` now follows the deal that
  // the award produced rather than standing in for it.
  'quotation.awarded',
  'quotation.award_voided',
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

  // Configuration. A config edit is a mutation like any other and belongs in the
  // audit trail: FR-20.4 makes the event log the audit timeline, and a template
  // or an integration changing is exactly the kind of change somebody later asks
  // "who did that, and when".
  'config.template_saved',
  'config.integration_saved',

  // Engagement — FR-06.12 to .19. What happened, as against what must happen:
  // `task.created` is an intention and `activity.logged` is a fact, and the two
  // are separate names because a timeline that conflates them cannot answer
  // "when did somebody last actually speak to this person".
  'activity.logged',
  'inquiry.stage_changed',
  'inquiry.next_action_set',
  'inquiry.dormant',
  'inquiry.recycled',
  'requirement.captured',
  'requirement.revised',

  // Work, records, messaging
  'task.created',
  'task.completed',
  'document.uploaded',
  'document.verified',
  /*
   * FR-16.7: every open of a document is logged. The vault records this today in
   * an append-only log inside its own desk because there was no name for it here;
   * with the name, that log collapses to one emit and one read of the event
   * stream, like every other record timeline in the product.
   */
  'document.opened',
  'message.sent',

  /*
   * Correction, discard and erasure — FR-20.2, FR-20.4.
   *
   * `record.` rather than `inquiry.` or `customer.` because a correction is the
   * one act in this vocabulary that is genuinely the same act on every entity:
   * six entity-prefixed names for it would be six names nobody could subscribe
   * to as one, and the audit timeline would have to know all six to render "what
   * has been corrected on this file". The subject says which record it was.
   *
   * What the detail may carry is settled by `DomainEvent.detail` above and
   * implemented in `src/domain/amend.ts`: which fields changed, the reason and
   * the actor always; a before and after only for an ordinary field, and never
   * for a money or classified one. That is why there is no `record.field_set`
   * carrying a value — a name that invited one would be a name somebody used.
   */
  'record.amended',
  'record.discarded',
  'record.restored',
  /*
   * The data principal's request and its decision — FR-20.2. Two names rather
   * than one because a request that is refused retention is still a request the
   * platform received, and a log that only records granted erasures cannot
   * answer "did anybody ever ask".
   */
  'erasure.requested',
  'erasure.decided',

  // Assistant — FR-22
  'assistant.notice_raised',
  'assistant.action_confirmed',

  /*
   * Automation — FR-21, and the reason the rest of this list has been inert.
   *
   * `clock.tick` is the one name here that no transition emits. Every other
   * event in this file is a thing somebody did; a tick is a date arriving, and
   * without a name for that a time-triggered recipe has nothing to subscribe to.
   * The emitter is elected rather than ambient — see `src/domain/automation/lease.ts`
   * — because five open tabs emitting five ticks is five ladders, not one.
   *
   * The task rungs are separate names rather than one `task.escalated` with a
   * level in `detail`, for the reason `task.created` and `activity.logged` are
   * separate: a timeline that has to read a detail field to know whether somebody
   * was nudged or their work was taken away cannot be filtered on. The emitter
   * for the rungs is the SLA ladder, which lands with the write paths it needs;
   * the names are here now because the dispatcher's depth guard and the run
   * ledger are written against the whole vocabulary, not half of it.
   *
   * There is deliberately no `recipe.run_recorded`. A run is written to the
   * ledger in `src/data/repo/recipes.ts`, not emitted, and the reason is
   * mechanical: an event announcing that a recipe ran is an event a recipe can
   * subscribe to, and the run that produces would announce itself in turn. The
   * depth guard counts recipe hops through `causedBy`, and a repository emitting
   * on its own behalf has no trigger to point at — so each announcement would
   * root a fresh chain at depth zero and the guard would never close. The ledger
   * is queryable by recipe and by subject, which is what FR-21.5 actually asks
   * for; the bus is the wrong place to put it.
   */
  'clock.tick',
  'task.nudged',
  'task.reclaimed',
  'task.escalated',
  'task.unrouted',
  'sla.breached',
] as const

export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number]

/** What the event happened to. Enough for the audit timeline to link back. */
export type EventSubject = {
  readonly entity: string
  readonly id: string
}

export type DomainEvent = {
  /**
   * This event's own identity — FR-21.5.
   *
   * The audit timeline could always show a sequence; it could never show a
   * chain, because there was nothing for one event to point at. A recipe that
   * reacts to an event and emits another sets `causedBy` to this, which is what
   * turns the log from a list into a graph — and it is the same field the
   * dispatcher's depth guard counts, so one addition closes the traceability
   * hole and the runaway-recursion hole together.
   *
   * The bus assigns it. A caller cannot supply one, because an id a caller chose
   * is an id a caller can repeat.
   */
  readonly id: string
  readonly name: DomainEventName
  readonly at: string
  /**
   * The id of the event that caused this one, when a recipe produced it. Absent
   * on anything a person did: those are roots, and a root is depth zero.
   */
  readonly causedBy?: string
  readonly actorId?: string
  readonly subject?: EventSubject
  /**
   * Workflow detail — a reason, a previous state, a count. Never an amount value
   * and never a sensitive field: this log is read by the audit timeline and, in
   * projected form, by the Assistant.
   */
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>
}

export type EventInit = Omit<DomainEvent, 'id' | 'name' | 'at'> & { at?: string }

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
  /**
   * Injectable for the same reason `now` is, and it defaults to a per-bus
   * counter rather than to a random id: two stores built from the same fixture
   * set must produce two identical logs, and a uuid would break that on the
   * first comparison. The counter is per-bus, so ids are unique inside one
   * session's log and mean nothing outside it — which is all `causedBy` needs.
   */
  nextEventId?: () => string
}

const EVENT_ID_WIDTH = 6

/** `evt-000001`, counting from one. Ordinal, and therefore replayable. */
export function createEventIdCounter(): () => string {
  let issued = 0
  return () => {
    issued += 1
    return `evt-${String(issued).padStart(EVENT_ID_WIDTH, '0')}`
  }
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const now = options.now ?? (() => new Date())
  const nextEventId = options.nextEventId ?? createEventIdCounter()
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
      const { at, causedBy, ...rest } = init
      const event: DomainEvent = {
        // The caller's fields first and the platform's last, so a caller who got
        // past the type — a plain object widened to `EventInit`, a JSON payload —
        // still cannot choose its own id. An id a caller picks is an id a caller
        // can repeat, and `causedBy` resolves by id.
        ...rest,
        // Spread rather than assigned, so a caller passing `causedBy: undefined`
        // — which every write helper does on the ordinary path, where a person
        // rather than a recipe made the change — leaves a root event with no key
        // at all rather than one carrying an empty parent.
        ...(causedBy === undefined ? {} : { causedBy }),
        id: nextEventId(),
        name,
        at: at ?? now().toISOString(),
      }

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
