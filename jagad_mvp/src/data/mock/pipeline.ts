/**
 * The demand pipeline: customers and their KYC, inquiries, quotations, deals.
 *
 * Everything that writes here writes through a §9 machine. That is not a stylistic
 * preference — it is the only way the guards stay true. `accept` does not set
 * `status = 'accepted'` and then hope somebody checked the TAT; it hands
 * `inquiryMachine` the assignment time and the confirmation time and lets
 * `confirmedWithinTat` decide, so a late confirmation comes back as the sentence
 * the screen shows rather than as an accepted inquiry nobody questioned.
 *
 * The quotation adapter is the one with real work in it. A revision has to open
 * v+1 while leaving v readable exactly as sent, so the prior version's lines are
 * archived through `archiveQuotationVersion` — frozen and locked — and handed to
 * the machine, which refuses the revision outright if any of them is still
 * editable.
 */

import {
  canEnterStage,
  dormancyVerdict,
  parkingStage,
  stageParksTheLead,
  nextActionSatisfied,
  readDormancyRule,
  stageByKey,
  stageCountsAsOpen,
} from '../../domain/workflows'
import { addMinutes } from '../fixtures/clock'
import {
  archiveQuotationVersion,
  CONSENT_STATES,
  consentMachine,
  carriedPremiumIsTypedNotComputed,
  agencyScopeFrom,
  awardKeyFor,
  dealHasLineItems,
  dealIsUniquePerAward,
  dealMachine,
  dealSalesCreditIsWhole,
  inquiryMachine,
  kycMachine,
  quotationMachine,
} from '../../domain/workflows'
import type {
  AgencyScope,
  ConsentLink,
  ConsentState,
  DealContext,
  KycConsentState,
  QuotationColumn,
  QuotationContext,
  QuotationVersion,
} from '../../domain/workflows'
import { deriveCustomerState, requirementsFor } from '../../domain/derive'
import type { CustomerFacts, DocumentFact } from '../../domain/derive'
import { CUSTOMER_STATUSES } from '../repo/customers'
import type {
  ConsentRecord,
  Customer,
  CustomerRepository,
  KycFactsOptions,
} from '../repo/customers'
import { sumMoney } from '../../domain/money'
import type { Deal, DealRepository } from '../repo/deals'
import type { ActivityRepository } from '../repo/activities'
import type { Inquiry, InquiryRepository } from '../repo/inquiries'
import type { RequirementRecord, RequirementRepository } from '../repo/requirements'
import type { Task, TaskRepository } from '../repo/tasks'
import type { Quotation, QuotationLine, QuotationRepository } from '../repo/quotations'
import { committed, notFound, rejected } from '../repo/result'
import type { MutationResult } from '../repo/result'
import { runQuery } from './list'
import type { Latency } from './latency'
import { create, move, record } from './move'
import { rowsOf } from './store'
import type { MockStore } from './store'

export type PipelineDeps = {
  readonly store: MockStore
  readonly latency: Latency
  /**
   * The two the inquiry repository genuinely depends on — FR-06.15.
   *
   * Recording one contact raises a follow-up and appends to the engagement log,
   * and both of those are somebody else's repository. Taking them as
   * dependencies rather than reaching into their tables keeps one write path per
   * entity: the attempt counter is still counted in exactly one place, and a
   * task raised by an engagement is numbered by the same sequence as every other
   * task.
   */
  readonly tasks: TaskRepository
  readonly activities: ActivityRepository
}

export function createPipelineRepositories(deps: PipelineDeps): {
  customers: CustomerRepository
  inquiries: InquiryRepository
  requirements: RequirementRepository
  quotations: QuotationRepository
  deals: DealRepository
} {
  const { store, latency, tasks, activities } = deps
  const t = store.tables
  const wait = () => latency.wait()
  const at = (given?: Date) => given ?? store.now()

  /* ------------------------------------------------------------- customers */

  function consentFor(customerId: string): ConsentRecord | null {
    return rowsOf(t.consentRecords).find((entry) => entry.customerId === customerId) ?? null
  }

  /**
   * Which checklist this customer's KYC is measured against.
   *
   * §8: a `DocChecklist` hangs off a company and optionally off one product of
   * that company, so the applicable list is the one for the cover being written
   * now — the most recent policy. A customer with no policy has no company yet
   * and therefore no checklist; that returns an empty list, which
   * `deriveCustomerState` reads as "nobody has decided what this file needs"
   * rather than as "it needs nothing".
   */
  function checklistItemsFor(customerId: string): readonly string[] {
    const latest = [...rowsOf(t.policies)]
      .filter((policy) => policy.customerId === customerId)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0]
    if (!latest) return []

    const product = t.products.get(latest.productId)
    if (!product) return []

    const all = rowsOf(t.docChecklists).filter((entry) => entry.purpose === 'kyc')
    const checklist =
      all.find((entry) => entry.productId === latest.productId) ??
      all.find((entry) => entry.companyId === product.companyId && entry.productId === null)

    return checklist?.items ?? []
  }

  /**
   * The KYC file as evidence.
   *
   * Everything here is read from this store's own tables. That is the whole
   * point: the guard used to be handed a list of what was required and a list of
   * what was present, both by the caller, and compared them — so a screen could
   * describe a complete file into existence. Nothing a caller passes can widen
   * what this returns.
   */
  function factsFor(customerId: string, options?: KycFactsOptions): CustomerFacts | null {
    const customer = t.customers.get(customerId)
    if (!customer) return null

    const documents: readonly DocumentFact[] = rowsOf(t.documents)
      .filter(
        (document) =>
          document.subjectEntity === 'Customer' && document.subjectId === customerId,
      )
      .map((document) => ({
        docType: document.docType,
        isPresent: document.isPresent,
        reviewState: document.reviewState,
        expiresAt: null,
      }))

    return {
      now: options?.now ?? store.now(),
      requirements: requirementsFor(checklistItemsFor(customerId)),
      documents,
      receipts: (options?.receipts ?? []).map((key) => ({ key })),
      policies: rowsOf(t.policies)
        .filter((policy) => policy.customerId === customerId)
        .map((policy) => ({ status: policy.status })),
      aadhaarLast4Present:
        customer.aadhaarLast4 !== null || options?.pendingAadhaarLast4 !== undefined,
    }
  }

  const customers: CustomerRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.customers), CUSTOMER_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.customers.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.customers.get(id)).filter((row) => row !== undefined)
    },
    async bySystemNo(no) {
      await wait()
      return rowsOf(t.customers).find((customer) => customer.systemNo === no) ?? null
    },
    async forOwner(ownerId, query) {
      await wait()
      return runQuery(
        rowsOf(t.customers).filter((customer) => customer.ownerId === ownerId),
        CUSTOMER_LIST_SPEC,
        query,
      )
    },
    async household(householdId) {
      await wait()
      const household = t.households.get(householdId)
      if (!household) return null
      return {
        household,
        customers: rowsOf(t.customers).filter((customer) => customer.householdId === householdId),
        members: rowsOf(t.members).filter((member) => member.householdId === householdId),
      }
    },
    async members(customerId) {
      await wait()
      return rowsOf(t.members).filter((member) => member.customerId === customerId)
    },
    async consent(customerId) {
      await wait()
      return consentFor(customerId)
    },
    async credentials(customerId) {
      await wait()
      return rowsOf(t.customerCredentials).filter((entry) => entry.customerId === customerId)
    },

    async create(command) {
      await wait()
      const fullName = command.fullName.trim()
      const mobile = command.mobile.trim()
      if (fullName === '') {
        return rejected('A customer needs a name. It is what every other record hangs off.')
      }
      if (mobile === '') {
        return rejected(
          'A customer needs a mobile number. Without one there is no way to reach them and no way to send a consent link.',
        )
      }

      const now = at(command.now)

      return create({
        store,
        table: t.customers,
        entity: 'Customer',
        kind: 'customer',
        // The KYC file opens with the record, so the KYC machine is the one the
        // customer is born into. Consent starts at its own machine's initial
        // state rather than at a string written here.
        machine: kycMachine,
        event: 'kyc.started',
        actorId: command.actorId,
        detail: { source: command.source },
        build: (born): Customer => ({
          id: born.id,
          systemNo: born.systemNo,
          householdId: command.householdId ?? null,
          status: command.status ?? CUSTOMER_STATUSES.prospect,
          source: command.source,
          createdAt: now.toISOString(),
          ownerId: command.ownerId,
          agentId: command.agentId ?? null,
          subAgentId: command.subAgentId ?? null,
          kycState: born.status,
          consentState: consentMachine.initial,
          // Nobody has sent this person anything yet, and null says exactly that.
          lastConsentChaseAt: null,
          consentChaseCount: 0,
          fullName,
          mobile,
          altMobile: command.altMobile ?? null,
          email: command.email ?? null,
          addressLine: command.addressLine ?? null,
          city: command.city,
          state: command.state,
          pincode: command.pincode ?? null,
          dateOfBirth: command.dateOfBirth ?? null,
          // Never populated, here least of all: the field exists so the
          // classification has something to forbid.
          aadhaarNumber: null,
          aadhaarLast4: null,
          panNumber: command.panNumber ?? null,
          bankAccountNumber: null,
          bankIfsc: null,
        }),
      })
    },

    async kycFacts(customerId, options) {
      await wait()
      return factsFor(customerId, options)
    },

    async derivedState(customerId, options) {
      await wait()
      const facts = factsFor(customerId, options)
      return facts === null ? null : deriveCustomerState(facts)
    },

    async advanceKyc(customerId, to, command) {
      await wait()
      // Derived here, from this store's tables, and never taken from the command.
      // A caller can record that a document arrived; it cannot claim the file is
      // complete, because the sentence that decides is written below, not above.
      const facts = factsFor(customerId, {
        now: command.now,
        receipts: command.receipts,
        pendingAadhaarLast4: command.aadhaarLast4,
      })
      const derived = facts === null ? undefined : deriveCustomerState(facts)

      return move<KycConsentState, Parameters<typeof kycMachine.canTransition>[2], Customer>({
        store,
        table: t.customers,
        entity: 'Customer',
        id: customerId,
        machine: kycMachine,
        stateOf: (customer) => customer.kycState,
        to,
        ctx: {
          now: at(command.now),
          route: command.route,
          derived,
          extractedFields: command.extractedFields,
          aadhaarLast4: command.aadhaarLast4,
        },
        actorId: command.actorId,
        detail: { route: command.route },
        apply: (customer) => ({
          ...customer,
          kycState: to,
          aadhaarLast4: command.aadhaarLast4 ?? customer.aadhaarLast4,
        }),
      })
    },

    async advanceConsent(customerId, to, command) {
      await wait()
      const customer = t.customers.get(customerId)
      if (!customer) return notFound('Customer', customerId)

      const existing = consentFor(customerId)
      const token = command.token ?? existing?.token
      const expiresAt = command.expiresAt ?? existing?.expiresAt

      if (!token || !expiresAt) {
        return rejected(
          'A consent move needs the link it is about. Issue a link, or pass the token and expiry of the one already out.',
        )
      }

      // Built through the domain helper, so `carriesSession` and
      // `grantsPortalAccess` are false by construction rather than by care.
      const link: ConsentLink = {
        token,
        expiresAt,
        carriesSession: false,
        grantsPortalAccess: false,
      }
      const now = at(command.now)

      const outcome = move<ConsentState, { now: Date; link: ConsentLink }, Customer>({
        store,
        table: t.customers,
        entity: 'Customer',
        id: customerId,
        machine: consentMachine,
        stateOf: (row) => row.consentState,
        to,
        ctx: { now, link },
        actorId: command.actorId,
        // Sending a link is the chase, so it is recorded on the move that sends
        // it rather than by whoever remembered to. Every route into
        // `link_issued` — a person on the customer file, the queue's bulk
        // action, FR-21's cadence when it lands — comes through here, so there
        // is no path that sends a link and leaves no trace of having sent one.
        // The other transitions leave both fields alone: a customer submitting
        // their form is not the agency chasing them.
        apply: (row) =>
          to === CONSENT_STATES.linkIssued
            ? {
                ...row,
                consentState: to,
                lastConsentChaseAt: now.toISOString(),
                consentChaseCount: row.consentChaseCount + 1,
              }
            : { ...row, consentState: to },
      })

      if (!outcome.ok) return outcome

      // The consent record follows the customer's state; it is the audit of which
      // link was used, which is why the token is stored rather than re-derived.
      const channel = command.channel ?? existing?.channel ?? 'whatsapp'
      const record: ConsentRecord = {
        id: existing?.id ?? `cns-${customerId}`,
        customerId,
        state: to,
        token,
        channel,
        issuedAt: existing?.issuedAt ?? now.toISOString(),
        expiresAt,
        submittedAt: to === 'submitted' ? now.toISOString() : (existing?.submittedAt ?? null),
      }
      t.consentRecords.set(record.id, record)

      return outcome
    },
  }

  /* ------------------------------------------------------------- inquiries */

  function inquiryCtx(
    inquiry: Inquiry,
    extra: {
      now: Date
      tatMinutes?: number
      confirmedAt?: string
      nextOwnerId?: string
      nextOwnerCategoryGroupId?: string
      routingMatchFound?: boolean
      adminAlertRaised?: boolean
      lostReason?: string
    },
  ) {
    return {
      now: extra.now,
      assignedAt: inquiry.assignedAt ?? undefined,
      tatMinutes: extra.tatMinutes,
      confirmedAt: extra.confirmedAt,
      categoryGroupId: inquiry.categoryId ?? undefined,
      nextOwnerCategoryGroupId: extra.nextOwnerCategoryGroupId,
      nextOwnerId: extra.nextOwnerId,
      assignmentHistory: inquiry.assignmentHistory,
      routingMatchFound: extra.routingMatchFound,
      adminAlertRaised: extra.adminAlertRaised,
      lostReason: extra.lostReason,
    }
  }

  const inquiries: InquiryRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.inquiries), INQUIRY_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.inquiries.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.inquiries.get(id)).filter((row) => row !== undefined)
    },
    async bySystemNo(no) {
      await wait()
      return rowsOf(t.inquiries).find((inquiry) => inquiry.systemNo === no) ?? null
    },
    async forOwner(ownerId, query) {
      await wait()
      return runQuery(
        rowsOf(t.inquiries).filter((inquiry) => inquiry.ownerId === ownerId),
        INQUIRY_LIST_SPEC,
        query,
      )
    },
    async referredBy(referrerId, query) {
      await wait()
      return runQuery(
        rowsOf(t.inquiries).filter((inquiry) => inquiry.referral?.referrerId === referrerId),
        INQUIRY_LIST_SPEC,
        query,
      )
    },
    async unrouted(query) {
      await wait()
      return runQuery(
        rowsOf(t.inquiries).filter((inquiry) => inquiry.status === 'unrouted'),
        INQUIRY_LIST_SPEC,
        query,
      )
    },
    async breachingTat(when, query) {
      await wait()
      const cutoff = when.getTime()
      return runQuery(
        rowsOf(t.inquiries).filter(
          (inquiry) =>
            inquiry.tatDueAt !== null &&
            new Date(inquiry.tatDueAt).getTime() < cutoff &&
            (inquiry.status === 'assigned' || inquiry.status === 'reassigned'),
        ),
        INQUIRY_LIST_SPEC,
        query,
      )
    },

    async create(command) {
      await wait()
      const contactName = command.contactName.trim()
      const contactMobile = command.contactMobile.trim()
      if (contactName === '') {
        return rejected(
          'An inquiry needs a name. It is the only thing the person on the phone always has.',
        )
      }
      if (contactMobile === '') {
        return rejected(
          'An inquiry needs a mobile number. Without one there is nobody to route the inquiry to.',
        )
      }

      /*
       * A referral and its referrer are one fact, so neither half is accepted
       * without the other. `referral` was a source value with nothing on the
       * end of it for long enough that the enum read as working attribution;
       * refusing both directions here is what stops it drifting back.
       */
      const referral = command.referral ?? null
      if (command.source === 'referral' && referral === null) {
        return rejected(
          'This inquiry says it came from a referral but does not say who referred it. A referral with no referrer cannot be attributed, thanked or paid.',
        )
      }
      if (command.source !== 'referral' && referral !== null) {
        return rejected(
          `A referrer was named on an inquiry whose source is "${command.source}". Set the source to Referral, or leave the referrer off.`,
        )
      }
      const referrerId = referral?.referrerId?.trim() ?? ''
      const referrerName = referral?.referrerName?.trim() ?? ''
      if (referral !== null && referral.kind !== 'external' && referrerId === '') {
        return rejected(
          'Pick the referrer. A referral attributed to nobody in particular is the same as one attributed to nobody.',
        )
      }
      if (referral !== null && referral.kind === 'external' && referrerName === '') {
        return rejected(
          'Name whoever referred this lead. Somebody outside the system is still somebody, and a name is the least the record can hold.',
        )
      }

      const now = at(command.now)

      return create({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        kind: 'inquiry',
        machine: inquiryMachine,
        // `new` is the machine's initial state, so there is no transition to
        // make. The event still goes out: the routing recipe triggers on it, and
        // a creation nobody can observe is the silent drop §9 warns about.
        event: 'inquiry.created',
        actorId: command.actorId,
        detail: {
          source: command.source,
          subAgentId: command.subAgentId ?? null,
          referrerKind: referral?.kind ?? null,
        },
        build: (born): Inquiry => ({
          id: born.id,
          systemNo: born.systemNo,
          status: born.status,
          source: command.source,
          categoryId: command.categoryId ?? null,
          productInterest: command.productInterest ?? [],
          // Routing decides who owns this. An inquiry that arrived pre-owned
          // would have skipped the recipe that makes the TAT clock meaningful.
          ownerId: null,
          teamId: null,
          agentId: command.agentId ?? null,
          subAgentId: command.subAgentId ?? null,
          assignedAt: null,
          tatDueAt: null,
          assignmentHistory: [],
          escalationLevel: 0,
          createdAt: now.toISOString(),
          customerId: command.customerId ?? null,
          referral:
            referral === null
              ? null
              : {
                  kind: referral.kind,
                  referrerId: referral.kind === 'external' ? null : referrerId,
                  referrerName: referral.kind === 'external' ? referrerName : null,
                  capturedAt: now.toISOString(),
                },
          contactName,
          contactMobile,
          contactEmail: command.contactEmail ?? null,
          notes: command.notes ?? null,
          // Nobody has spoken to them yet, and that absence is the fact the
          // engagement layer reports on rather than a gap to fill in.
          stageKey: null,
          stageEnteredAt: null,
          contactAttempts: 0,
          lastActivityAt: null,
          nextActionAt: null,
        }),
      })
    },

    async assign(id, command) {
      await wait()
      const now = at(command.now)
      const inquiry = t.inquiries.get(id)
      if (!inquiry) return notFound('Inquiry', id)

      return move({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        id,
        machine: inquiryMachine,
        stateOf: (row) => row.status,
        to: 'assigned',
        ctx: inquiryCtx(inquiry, {
          now,
          tatMinutes: command.tatMinutes,
          nextOwnerId: command.nextOwnerId,
          nextOwnerCategoryGroupId: command.nextOwnerCategoryGroupId,
          routingMatchFound: command.routingMatchFound,
        }),
        actorId: command.actorId,
        detail: { assignee: command.nextOwnerId, tatMinutes: command.tatMinutes },
        apply: (row) => ({
          ...row,
          status: 'assigned',
          ownerId: command.nextOwnerId,
          teamId: command.teamId ?? row.teamId,
          assignedAt: now.toISOString(),
          tatDueAt: addMinutes(now, command.tatMinutes).toISOString(),
          assignmentHistory: [
            ...row.assignmentHistory,
            {
              assigneeId: command.nextOwnerId,
              assignedAt: now.toISOString(),
              reason: command.reason,
            },
          ],
        }),
      })
    },

    async accept(id, command) {
      await wait()
      const inquiry = t.inquiries.get(id)
      if (!inquiry) return notFound('Inquiry', id)

      return move({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        id,
        machine: inquiryMachine,
        stateOf: (row) => row.status,
        to: 'accepted',
        ctx: inquiryCtx(inquiry, {
          now: at(command.now),
          tatMinutes: command.tatMinutes,
          confirmedAt: command.confirmedAt,
        }),
        actorId: command.actorId,
        // The clock stops here, so the due time is cleared rather than left to
        // haunt a queue that filters on it.
        apply: (row) => ({ ...row, status: 'accepted', tatDueAt: null }),
      })
    },

    async reassign(id, command) {
      await wait()
      const now = at(command.now)
      const inquiry = t.inquiries.get(id)
      if (!inquiry) return notFound('Inquiry', id)

      return move({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        id,
        machine: inquiryMachine,
        stateOf: (row) => row.status,
        to: 'reassigned',
        ctx: inquiryCtx(inquiry, {
          now,
          tatMinutes: command.tatMinutes,
          nextOwnerId: command.nextOwnerId,
          nextOwnerCategoryGroupId: command.nextOwnerCategoryGroupId,
        }),
        actorId: command.actorId,
        detail: { assignee: command.nextOwnerId },
        apply: (row) => ({
          ...row,
          status: 'reassigned',
          ownerId: command.nextOwnerId,
          assignedAt: now.toISOString(),
          tatDueAt: addMinutes(now, command.tatMinutes).toISOString(),
          assignmentHistory: [
            // The trail keeps the previous holder with a release time, because
            // escalation reads the whole thing, not the last line.
            ...row.assignmentHistory.map((entry, index, all) =>
              index === all.length - 1 && entry.releasedAt === undefined
                ? {
                    ...entry,
                    releasedAt: now.toISOString(),
                    reason: command.reason ?? 'TAT elapsed without confirmation',
                  }
                : entry,
            ),
            { assigneeId: command.nextOwnerId, assignedAt: now.toISOString() },
          ],
        }),
      })
    },

    async escalate(id, command) {
      await wait()
      const inquiry = t.inquiries.get(id)
      if (!inquiry) return notFound('Inquiry', id)

      return move({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        id,
        machine: inquiryMachine,
        stateOf: (row) => row.status,
        to: 'escalated',
        ctx: inquiryCtx(inquiry, { now: at(command.now), tatMinutes: command.tatMinutes }),
        actorId: command.actorId,
        detail: { escalatedTo: command.toUserId, holders: inquiry.assignmentHistory.length },
        apply: (row) => ({
          ...row,
          status: 'escalated',
          ownerId: command.toUserId,
          escalationLevel: row.escalationLevel + 1,
        }),
      })
    },

    async markUnrouted(id, command) {
      await wait()
      const inquiry = t.inquiries.get(id)
      if (!inquiry) return notFound('Inquiry', id)

      return move({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        id,
        machine: inquiryMachine,
        stateOf: (row) => row.status,
        to: 'unrouted',
        ctx: inquiryCtx(inquiry, {
          now: at(command.now),
          routingMatchFound: false,
          adminAlertRaised: command.adminAlertRaised,
        }),
        actorId: command.actorId,
        apply: (row) => ({ ...row, status: 'unrouted', ownerId: null, tatDueAt: null }),
      })
    },

    async convert(id, command) {
      await wait()
      const inquiry = t.inquiries.get(id)
      if (!inquiry) return notFound('Inquiry', id)

      return move({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        id,
        machine: inquiryMachine,
        stateOf: (row) => row.status,
        to: 'converted',
        ctx: inquiryCtx(inquiry, { now: at(command.now) }),
        actorId: command.actorId,
        detail: { quotationId: command.quotationId ?? null },
        apply: (row) => ({ ...row, status: 'converted' }),
      })
    },

    async markLost(id, command) {
      await wait()
      const inquiry = t.inquiries.get(id)
      if (!inquiry) return notFound('Inquiry', id)

      return move({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        id,
        machine: inquiryMachine,
        stateOf: (row) => row.status,
        to: 'lost',
        ctx: inquiryCtx(inquiry, { now: at(command.now), lostReason: command.lostReason }),
        actorId: command.actorId,
        detail: { lostReason: command.lostReason ?? null },
        apply: (row) => ({ ...row, status: 'lost' }),
      })
    },

    async dormant(query) {
      await wait()
      const stages = rowsOf(t.inquiryStages)
      return runQuery(
        rowsOf(t.inquiries).filter((inquiry) => stageParksTheLead(stages, inquiry.stageKey)),
        INQUIRY_LIST_SPEC,
        query,
      )
    },

    async recycle(id, command) {
      await wait()
      const now = at(command.now)
      const inquiry = t.inquiries.get(id)
      if (!inquiry) return notFound('Inquiry', id)

      if (!stageParksTheLead(rowsOf(t.inquiryStages), inquiry.stageKey)) {
        return rejected(
          'Only a parked inquiry can be recycled, and this one is not parked. There is nothing to bring back.',
        )
      }
      if (command.reason.trim() === '') {
        return rejected(
          'Say why this lead is coming back off the parked list. A record that reappears with no reason is one nobody can account for later.',
        )
      }

      return record<Inquiry>({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        id,
        event: 'inquiry.recycled',
        actorId: command.actorId,
        detail: { reason: command.reason.trim(), toPool: command.toPool ?? false },
        apply: (row) => ({
          ...row,
          // Unstaged rather than back to where it was parked from: nobody has
          // spoken to them lately, and that is exactly what no stage means.
          stageKey: null,
          stageEnteredAt: now.toISOString(),
          contactAttempts: 0,
          nextActionAt: null,
          ...(command.toPool === true ? { ownerId: null } : {}),
        }),
      })
    },

    async nextActionOverdue(when, query) {
      await wait()
      const cutoff = when.getTime()
      const stages = rowsOf(t.inquiryStages)
      return runQuery(
        rowsOf(t.inquiries).filter(
          (inquiry) =>
            inquiry.status === 'accepted' &&
            stageCountsAsOpen(stages, inquiry.stageKey) &&
            inquiry.nextActionAt !== null &&
            new Date(inquiry.nextActionAt).getTime() < cutoff,
        ),
        INQUIRY_LIST_SPEC,
        query,
      )
    },

    /**
     * One contact and everything that follows from it — FR-06.13 to .17.
     *
     * The order below is the whole design. Every refusal comes before the first
     * write, so a blocked engagement leaves no half-record behind: no orphan
     * activity, no task pointing at a stage the inquiry never entered, no
     * attempt counted for a call that was not accepted. And the two rules are
     * asked in the words they will be shown in — the mandate's and the stage
     * module's own sentences, unedited.
     */
    async logEngagement(id, command) {
      await wait()
      const now = at(command.now)
      const inquiry = t.inquiries.get(id)
      if (!inquiry) return notFound('Inquiry', id)

      const disposition = rowsOf(t.dispositions).find(
        (row) => row.key === command.dispositionKey,
      )
      if (!disposition) {
        return rejected(
          `"${command.dispositionKey}" is not a configured outcome. The list is edited in configuration, and every activity carries one of them.`,
        )
      }
      if (!disposition.active) {
        return rejected(
          `"${disposition.label}" has been retired as an outcome. Records that already carry it keep it; pick one still in use.`,
        )
      }
      if (
        disposition.channelKeys.length > 0 &&
        !disposition.channelKeys.includes(command.channel)
      ) {
        return rejected(
          `"${disposition.label}" is not an outcome you can record against a ${command.channel}. It is configured for: ${disposition.channelKeys.join(', ')}.`,
        )
      }

      const stages = rowsOf(t.inquiryStages)
      const toStage = disposition.stageKey

      // Rule one: the mandate. An open inquiry may not be left without a date.
      const mandate = nextActionSatisfied({
        now,
        disposition: {
          key: disposition.key,
          label: disposition.label,
          terminal: stageByKey(stages, toStage)?.terminal ?? false,
          requiresNextAction: disposition.requiresNextAction,
          requiresReason: disposition.requiresReason,
        },
        nextAction: command.nextAction ?? null,
        reason: command.reason ?? null,
      })
      if (!mandate.ok) return rejected(mandate.reason, mandate.code, mandate.guard)

      // Rule two: the pipeline. Only asked when the outcome moves the stage.
      if (toStage !== null && toStage !== inquiry.stageKey) {
        const staged = canEnterStage(toStage, stages, {
          status: inquiry.status,
          fromKey: inquiry.stageKey,
          hasNextAction: Boolean(command.nextAction),
        })
        if (!staged.ok) return rejected(staged.reason, staged.code, staged.guard)
      }

      // Past every refusal. From here the three writes go together.
      let raised: Task | null = null
      if (command.nextAction) {
        const taskOutcome = await tasks.create({
          actorId: command.actorId,
          kind: command.nextAction.kind,
          title: `${inquiry.contactName} - ${disposition.label.toLowerCase()}`,
          subjectEntity: 'Inquiry',
          subjectId: inquiry.id,
          dueAt: command.nextAction.dueAt,
          ownerId: command.nextAction.assigneeId ?? inquiry.ownerId,
          teamId: inquiry.teamId,
          agentId: inquiry.agentId,
          raisedBy: command.actorId,
          now,
        })
        if (!taskOutcome.ok) return taskOutcome
        raised = taskOutcome.record
      }

      const logged = await activities.log({
        actorId: command.actorId,
        subjectEntity: 'Inquiry',
        subjectId: inquiry.id,
        channel: command.channel,
        direction: command.direction,
        dispositionKey: disposition.key,
        occurredAt: command.occurredAt ?? now.toISOString(),
        notes: command.notes ?? null,
        nextTaskId: raised?.id ?? null,
        messageLogId: command.messageLogId ?? null,
        now,
      })
      if (!logged.ok) return logged

      /*
       * Going cold, decided after the contact is on the books — FR-06.17.
       *
       * It runs last on purpose. The attempt this call just added is what tips
       * the count over, so asking before logging would always be one behind, and
       * a lead would sit at "not reachable" for one more round than the agency
       * configured. Dormancy overrides the disposition's own stage, which is the
       * matrix row "after X attempts, dormant" doing exactly what it says.
       */
      const rule = readDormancyRule(
        rowsOf(t.recipes).find((row) => row.key === 'inquiry.dormancy' && row.active)
          ?.parameters ?? null,
      )
      const cold = dormancyVerdict(rule, {
        now,
        contactAttempts: logged.record.attemptNo,
        lastActivityAt: logged.record.occurredAt,
      })
      // No configured parking stage means nowhere to park, so dormancy does not
      // fire — the same answer an absent recipe gets, rather than a key from here.
      const parked = parkingStage(stages)
      const landsOn =
        cold.dormant && parked !== null && toStage !== null && !stageByKey(stages, toStage)?.terminal
          ? parked.key
          : toStage

      const stamped = record<Inquiry>({
        store,
        table: t.inquiries,
        entity: 'Inquiry',
        id,
        event:
          parked !== null && landsOn === parked.key && landsOn !== toStage
            ? 'inquiry.dormant'
            : landsOn === null
              ? 'inquiry.next_action_set'
              : 'inquiry.stage_changed',
        actorId: command.actorId,
        detail: {
          disposition: disposition.key,
          stage: landsOn,
          attempts: logged.record.attemptNo,
          nextActionAt: command.nextAction?.dueAt ?? null,
          ...(cold.dormant ? { because: cold.because } : {}),
        },
        apply: (row) => ({
          ...row,
          stageKey: landsOn ?? row.stageKey,
          stageEnteredAt:
            landsOn !== null && landsOn !== row.stageKey
              ? now.toISOString()
              : row.stageEnteredAt,
          contactAttempts: logged.record.attemptNo,
          // When the contact happened, not when it was typed up. A note written
          // on Friday about a Tuesday call did not touch this lead on Friday.
          lastActivityAt: logged.record.occurredAt,
          // A parked lead owes nobody a date. Leaving the follow-up on it would
          // put a dormant inquiry back in the overdue sweep every morning.
          nextActionAt:
            parked !== null && landsOn === parked.key
              ? null
              : (command.nextAction?.dueAt ?? null),
        }),
      })
      if (!stamped.ok) return stamped

      return committed(
        { inquiry: stamped.record, activity: logged.record, task: raised },
        [...logged.events, ...stamped.events],
      )
    },
  }

  /* ---------------------------------------------------------- requirements */

  /**
   * What the customer said they need — FR-06.16.
   *
   * One per inquiry, replaced rather than appended. A requirement is a current
   * statement of what somebody wants and wants change on the second call, which
   * is the opposite of an `Activity` — that records a thing that happened and can
   * never be revised. The event log carries the history either way.
   */
  const requirements: RequirementRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.requirements), REQUIREMENT_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.requirements.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.requirements.get(id)).filter((row) => row !== undefined)
    },
    async forInquiry(inquiryId) {
      await wait()
      return rowsOf(t.requirements).find((row) => row.inquiryId === inquiryId) ?? null
    },
    async capture(command) {
      await wait()
      const now = at(command.now)
      const inquiry = t.inquiries.get(command.inquiryId)
      if (!inquiry) return notFound('Inquiry', command.inquiryId)

      const existing = rowsOf(t.requirements).find(
        (row) => row.inquiryId === command.inquiryId,
      )

      if (existing) {
        return record<RequirementRecord>({
          store,
          table: t.requirements,
          entity: 'RequirementRecord',
          id: existing.id,
          event: 'requirement.revised',
          actorId: command.actorId,
          // The answers themselves stay off the event stream, for the same
          // reason `values` is `document-content` in the registry.
          detail: { inquiryId: command.inquiryId, schemaVersion: command.schemaVersion },
          apply: (row) => ({
            ...row,
            formSchemaId: command.formSchemaId,
            objectKey: command.objectKey,
            schemaVersion: command.schemaVersion,
            values: command.values,
            revisedAt: now.toISOString(),
          }),
        })
      }

      const id = `req-${command.inquiryId}`
      const emitted = store.bus.emit('requirement.captured', {
        actorId: command.actorId,
        subject: { entity: 'RequirementRecord', id },
        detail: { inquiryId: command.inquiryId, schemaVersion: command.schemaVersion },
      })
      const row: RequirementRecord = {
        id,
        inquiryId: command.inquiryId,
        formSchemaId: command.formSchemaId,
        objectKey: command.objectKey,
        schemaVersion: command.schemaVersion,
        values: command.values,
        capturedBy: command.actorId,
        capturedAt: now.toISOString(),
        revisedAt: null,
      }
      t.requirements.set(id, row)
      return committed(row, [emitted])
    },
  }

  /* ------------------------------------------------------------ quotations */

  function linesOf(quotationId: string, version?: number): QuotationLine[] {
    return rowsOf(t.quotationLines).filter(
      (line) => line.quotationId === quotationId && (version === undefined || line.version === version),
    )
  }

  function columnsOf(quotation: Quotation): QuotationColumn[] {
    return linesOf(quotation.id, quotation.version).map((line) => ({
      columnKey: line.columnKey,
      label: line.label,
      companyId: line.companyId,
      productId: line.productId,
      finalPayablePremium: line.finalPayablePremium ?? undefined,
      finalPremiumSource: line.finalPremiumSource ?? undefined,
    }))
  }

  /**
   * The archived versions, frozen. `priorVersionsRemainImmutable` refuses a
   * revision unless every earlier version is both locked and actually frozen, so
   * they are built through the domain's own helper rather than by hand.
   */
  function priorVersionsOf(quotation: Quotation): QuotationVersion[] {
    const byVersion = new Map<number, QuotationColumn[]>()
    for (const line of linesOf(quotation.id)) {
      if (line.version >= quotation.version) continue
      const columns = byVersion.get(line.version) ?? []
      columns.push({
        label: line.label,
        companyId: line.companyId,
        productId: line.productId,
        finalPayablePremium: line.finalPayablePremium ?? undefined,
        finalPremiumSource: line.finalPremiumSource ?? undefined,
      })
      byVersion.set(line.version, columns)
    }
    return [...byVersion.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([version, columns]) => archiveQuotationVersion({ version, columns }))
  }

  function quotationCtx(
    quotation: Quotation,
    extra: {
      version?: number
      revisionReason?: string
      lostReason?: string
      columns?: QuotationColumn[]
      acceptedColumnKeys?: readonly string[]
      dealId?: string
      awardVoidReason?: string
    },
  ): QuotationContext {
    return {
      columns: extra.columns ?? columnsOf(quotation),
      version: extra.version ?? quotation.version,
      priorVersions: priorVersionsOf(quotation),
      revisionReason: extra.revisionReason ?? quotation.revisionReason ?? undefined,
      lostReason: extra.lostReason ?? quotation.lostReason ?? undefined,
      // The stored keys are the fallback so `won` can be checked against the
      // award that was actually recorded rather than against the caller's word.
      acceptedColumnKeys: extra.acceptedColumnKeys ?? quotation.acceptedColumnKeys,
      dealId: extra.dealId,
      awardVoidReason: extra.awardVoidReason,
    }
  }

  function writeLines(
    quotationId: string,
    version: number,
    lines: readonly Omit<QuotationLine, 'id' | 'quotationId' | 'version' | 'locked'>[],
  ): void {
    lines.forEach((line, index) => {
      const id = `qln-${quotationId.replace('qtn-', '')}-v${version}-${index + 1}`
      t.quotationLines.set(id, { ...line, id, quotationId, version, locked: false })
    })
  }

  function lockVersion(quotationId: string, version: number): void {
    for (const line of linesOf(quotationId, version)) {
      t.quotationLines.set(line.id, { ...line, locked: true })
    }
  }

  const quotations: QuotationRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.quotations), QUOTATION_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.quotations.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.quotations.get(id)).filter((row) => row !== undefined)
    },
    async bySystemNo(no) {
      await wait()
      return rowsOf(t.quotations).find((quotation) => quotation.systemNo === no) ?? null
    },
    async forInquiry(inquiryId) {
      await wait()
      return rowsOf(t.quotations).filter((quotation) => quotation.inquiryId === inquiryId)
    },
    async forCustomer(customerId, query) {
      await wait()
      return runQuery(
        rowsOf(t.quotations).filter((quotation) => quotation.customerId === customerId),
        QUOTATION_LIST_SPEC,
        query,
      )
    },
    async lines(quotationId) {
      await wait()
      const quotation = t.quotations.get(quotationId)
      if (!quotation) return []
      return linesOf(quotationId, quotation.version)
    },
    async allLines(quotationId) {
      await wait()
      return linesOf(quotationId)
    },

    async create(command) {
      await wait()
      const now = at(command.now)

      return create({
        store,
        table: t.quotations,
        entity: 'Quotation',
        kind: 'quotation',
        machine: quotationMachine,
        event: 'quotation.created',
        actorId: command.actorId,
        detail: { customerId: command.customerId, inquiryId: command.inquiryId ?? null },
        build: (born): Quotation => ({
          id: born.id,
          systemNo: born.systemNo,
          version: 1,
          status: born.status,
          customerId: command.customerId,
          inquiryId: command.inquiryId ?? null,
          ownerId: command.ownerId,
          agentId: command.agentId ?? null,
          subAgentId: command.subAgentId ?? null,
          // The matrix arrives at `compose`, along with the typed premiums the
          // machine checks. A draft holds no columns and no figure.
          companyIds: [],
          productIds: [],
          benefitRows: [],
          premiumMode: command.premiumMode,
          finalPayablePremium: null,
          sharedAt: null,
          acceptedColumnKeys: [],
          awardedAt: null,
          revisionReason: null,
          lostReason: null,
          createdAt: now.toISOString(),
          documentId: null,
        }),
      })
    },

    async compose(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)

      const columns: QuotationColumn[] = command.lines.map((line) => ({
        label: line.label,
        companyId: line.companyId,
        productId: line.productId,
        finalPayablePremium: line.finalPayablePremium ?? undefined,
        finalPremiumSource: line.finalPremiumSource ?? undefined,
      }))

      const outcome: MutationResult<Quotation> = move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'composed',
        ctx: quotationCtx(quotation, { columns }),
        actorId: command.actorId,
        detail: { columns: command.lines.length, rows: command.benefitRows.length },
        apply: (row) => ({
          ...row,
          status: 'composed',
          benefitRows: command.benefitRows,
          companyIds: [...new Set(command.lines.map((line) => line.companyId))],
          productIds: [...new Set(command.lines.map((line) => line.productId))],
        }),
      })

      if (outcome.ok) writeLines(id, quotation.version, command.lines)
      return outcome
    },

    async generate(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)

      return move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'generated',
        ctx: quotationCtx(quotation, {}),
        actorId: command.actorId,
        apply: (row) => ({ ...row, status: 'generated', documentId: command.documentId ?? row.documentId }),
      })
    },

    async share(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)
      const now = at(command.now)

      return move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'shared',
        ctx: quotationCtx(quotation, {}),
        actorId: command.actorId,
        detail: { channel: command.channel ?? 'whatsapp' },
        apply: (row) => ({ ...row, status: 'shared', sharedAt: now.toISOString() }),
      })
    },

    async requestRevision(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)

      return move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'revision_requested',
        ctx: quotationCtx(quotation, { revisionReason: command.revisionReason }),
        actorId: command.actorId,
        detail: { revisionReason: command.revisionReason },
        apply: (row) => ({
          ...row,
          status: 'revision_requested',
          revisionReason: command.revisionReason,
        }),
      })
    },

    async regenerate(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)

      // The version the customer already saw is archived before the machine is
      // asked, because the guard checks that it is — and because writing v+1
      // over the top is the thing the guard exists to stop.
      lockVersion(id, quotation.version)
      const nextVersion = quotation.version + 1
      const columns: QuotationColumn[] = command.lines.map((line) => ({
        label: line.label,
        companyId: line.companyId,
        productId: line.productId,
        finalPayablePremium: line.finalPayablePremium ?? undefined,
        finalPremiumSource: line.finalPremiumSource ?? undefined,
      }))

      const outcome: MutationResult<Quotation> = move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'generated',
        ctx: {
          columns,
          version: nextVersion,
          priorVersions: priorVersionsOf({ ...quotation, version: nextVersion }),
          revisionReason: command.revisionReason,
        },
        actorId: command.actorId,
        detail: { version: nextVersion, revisionReason: command.revisionReason },
        apply: (row) => ({
          ...row,
          status: 'generated',
          version: nextVersion,
          revisionReason: command.revisionReason,
          documentId: command.documentId ?? row.documentId,
        }),
      })

      if (outcome.ok) {
        writeLines(id, nextVersion, command.lines)
      } else {
        // A refusal writes nothing, so the archive is undone too.
        for (const line of linesOf(id, quotation.version)) {
          t.quotationLines.set(line.id, { ...line, locked: false })
        }
      }
      return outcome
    },

    async markAwarded(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)
      const now = at(command.now)

      // The accepted columns' typed figures, added up. Addition over figures a
      // person typed is the one arithmetic D3 allows, and the header has always
      // been "the figure of the column the customer accepted" — with two
      // accepted columns it is the figure of both, not of whichever came first.
      const accepted = linesOf(id, quotation.version).filter((line) =>
        command.acceptedColumnKeys.includes(line.columnKey),
      )
      const typed = accepted
        .map((line) => line.finalPayablePremium)
        .filter((amount): amount is NonNullable<typeof amount> => amount !== null)
      const headline = typed.length === accepted.length && typed.length > 0 ? sumMoney(typed) : null

      return move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'awarded',
        ctx: quotationCtx(quotation, { acceptedColumnKeys: command.acceptedColumnKeys }),
        actorId: command.actorId,
        detail: { columns: command.acceptedColumnKeys.join(',') },
        apply: (row) => ({
          ...row,
          status: 'awarded',
          acceptedColumnKeys: [...command.acceptedColumnKeys],
          awardedAt: now.toISOString(),
          finalPayablePremium: headline ?? row.finalPayablePremium,
        }),
      })
    },

    async voidAward(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)

      return move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'shared',
        ctx: quotationCtx(quotation, { awardVoidReason: command.awardVoidReason }),
        actorId: command.actorId,
        detail: { reason: command.awardVoidReason },
        apply: (row) => ({
          ...row,
          status: 'shared',
          acceptedColumnKeys: [],
          awardedAt: null,
        }),
      })
    },

    async markWon(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)

      return move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'won',
        ctx: quotationCtx(quotation, { dealId: command.dealId }),
        actorId: command.actorId,
        detail: { dealId: command.dealId ?? null },
        apply: (row) => ({ ...row, status: 'won' }),
      })
    },

    async markLost(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)

      return move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'lost',
        ctx: quotationCtx(quotation, { lostReason: command.lostReason }),
        actorId: command.actorId,
        detail: { lostReason: command.lostReason ?? null },
        apply: (row) => ({ ...row, status: 'lost', lostReason: command.lostReason ?? null }),
      })
    },
  }

  /* ----------------------------------------------------------------- deals */

  function agencyScopeOf(agencyId: string): AgencyScope | undefined {
    if (!t.agencies.has(agencyId)) return undefined
    return agencyScopeFrom(agencyId, rowsOf(t.agencyScopes))
  }

  const deals: DealRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.deals), DEAL_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.deals.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.deals.get(id)).filter((row) => row !== undefined)
    },
    async bySystemNo(no) {
      await wait()
      return rowsOf(t.deals).find((deal) => deal.systemNo === no) ?? null
    },
    async forQuotation(quotationId) {
      await wait()
      return rowsOf(t.deals).filter((deal) => deal.quotationId === quotationId)
    },
    async forCustomer(customerId, query) {
      await wait()
      return runQuery(
        rowsOf(t.deals).filter((deal) => deal.customerId === customerId),
        DEAL_LIST_SPEC,
        query,
      )
    },
    async byAwardKey(awardKey) {
      await wait()
      return rowsOf(t.deals).find((deal) => deal.awardKey === awardKey) ?? null
    },
    async awaitingPolicyEntry(query) {
      await wait()
      return runQuery(
        rowsOf(t.deals).filter(
          (deal) => deal.status === 'line_items_set' && deal.consumedByPolicyId === null,
        ),
        DEAL_LIST_SPEC,
        query,
      )
    },

    async create(command) {
      await wait()
      const now = at(command.now)
      const awardKey = awardKeyFor(
        command.quotationId,
        command.quotationVersion,
        command.acceptedColumnKeys,
      )
      const existing = rowsOf(t.deals).find((deal) => deal.awardKey === awardKey)

      return create<Deal['status'], DealContext, Deal>({
        store,
        table: t.deals,
        entity: 'Deal',
        kind: 'deal',
        machine: dealMachine,
        // §9's zero-line-item block, applied at birth by the machine's own guard
        // so the refusal carries the machine's own sentence. The agency scope is
        // not checked here — placement is `setLineItems`, and that is where
        // `placementInsideAgencyScope` runs.
        //
        // The other two are birth checks for the same reason: a deal that opens
        // with a derived premium, or with a sub-agent and no agent, is a record
        // the commission chain will refuse to book months later. Refusing it here
        // puts the sentence where somebody can still act on it.
        entry: {
          guards: [
            dealHasLineItems,
            carriedPremiumIsTypedNotComputed,
            dealSalesCreditIsWhole,
            dealIsUniquePerAward,
          ],
          ctx: {
            lineItems: command.lineItems,
            agentId: command.agentId ?? null,
            subAgentId: command.subAgentId ?? null,
            awardKey,
            // Read here, in the only layer that can see two rows at once, and
            // handed to the guard. `null` says "looked, found nothing".
            existingDealForAwardKey: existing
              ? { id: existing.id, systemNo: existing.systemNo }
              : null,
          },
        },
        event: 'deal.created',
        actorId: command.actorId,
        detail: {
          quotationId: command.quotationId,
          awardKey,
          lineItems: command.lineItems.length,
        },
        build: (born): Deal => ({
          id: born.id,
          systemNo: born.systemNo,
          status: born.status,
          quotationId: command.quotationId,
          customerId: command.customerId,
          ownerId: command.ownerId,
          agentId: command.agentId ?? null,
          subAgentId: command.subAgentId ?? null,
          agencyId: null,
          lineItems: command.lineItems,
          quotationVersion: command.quotationVersion,
          acceptedColumnKeys: [...command.acceptedColumnKeys],
          awardKey,
          salesCreditSource: command.salesCreditSource ?? null,
          createdAt: now.toISOString(),
          consumedByPolicyId: null,
        }),
      })
    },

    async setLineItems(id, command) {
      await wait()
      return move({
        store,
        table: t.deals,
        entity: 'Deal',
        id,
        machine: dealMachine,
        stateOf: (row) => row.status,
        to: 'line_items_set',
        ctx: {
          lineItems: command.lineItems,
          agencyScope: agencyScopeOf(command.agencyId),
        },
        actorId: command.actorId,
        detail: { agencyId: command.agencyId, lineItems: command.lineItems.length },
        apply: (row) => ({
          ...row,
          status: 'line_items_set',
          agencyId: command.agencyId,
          lineItems: command.lineItems,
        }),
      })
    },

    async consume(id, command) {
      await wait()
      const deal = t.deals.get(id)
      if (!deal) return notFound('Deal', id)

      return move({
        store,
        table: t.deals,
        entity: 'Deal',
        id,
        machine: dealMachine,
        stateOf: (row) => row.status,
        to: 'consumed',
        ctx: {
          lineItems: deal.lineItems,
          agencyScope: deal.agencyId ? agencyScopeOf(deal.agencyId) : undefined,
          consumedByPolicyId: command.policyId,
        },
        actorId: command.actorId,
        detail: { policyId: command.policyId },
        apply: (row) => ({ ...row, status: 'consumed', consumedByPolicyId: command.policyId }),
      })
    },
  }

  return { customers, inquiries, requirements, quotations, deals }
}

/* ------------------------------------------------------------- list specs */

const CUSTOMER_LIST_SPEC = {
  search: [
    (row: Customer) => row.fullName,
    (row: Customer) => row.mobile,
    (row: Customer) => row.systemNo,
  ],
  filters: {
    status: (row: Customer) => row.status,
    source: (row: Customer) => row.source,
    kycState: (row: Customer) => row.kycState,
    consentState: (row: Customer) => row.consentState,
    ownerId: (row: Customer) => row.ownerId,
    agentId: (row: Customer) => row.agentId,
    city: (row: Customer) => row.city,
  },
  sorts: {
    fullName: (row: Customer) => row.fullName,
    createdAt: (row: Customer) => row.createdAt,
    systemNo: (row: Customer) => row.systemNo,
    // Never chased sorts as the empty string, which puts it first ascending —
    // the right end for a chase list, because a file nobody has ever written to
    // is more overdue than one chased last week, not less.
    lastConsentChaseAt: (row: Customer) => row.lastConsentChaseAt ?? '',
  },
  defaultSort: { field: 'createdAt', direction: 'desc' as const },
}

const INQUIRY_LIST_SPEC = {
  search: [
    (row: Inquiry) => row.contactName,
    (row: Inquiry) => row.contactMobile,
    (row: Inquiry) => row.systemNo,
  ],
  filters: {
    status: (row: Inquiry) => row.status,
    source: (row: Inquiry) => row.source,
    categoryId: (row: Inquiry) => row.categoryId,
    ownerId: (row: Inquiry) => row.ownerId,
    teamId: (row: Inquiry) => row.teamId,
    subAgentId: (row: Inquiry) => row.subAgentId,
    agentId: (row: Inquiry) => row.agentId,
    stageKey: (row: Inquiry) => row.stageKey,
  },
  sorts: {
    createdAt: (row: Inquiry) => row.createdAt,
    tatDueAt: (row: Inquiry) => row.tatDueAt,
    systemNo: (row: Inquiry) => row.systemNo,
    nextActionAt: (row: Inquiry) => row.nextActionAt,
    lastActivityAt: (row: Inquiry) => row.lastActivityAt,
  },
  defaultSort: { field: 'createdAt', direction: 'desc' as const },
}

const REQUIREMENT_LIST_SPEC = {
  search: [(row: RequirementRecord) => row.inquiryId],
  filters: {
    inquiryId: (row: RequirementRecord) => row.inquiryId,
    objectKey: (row: RequirementRecord) => row.objectKey,
  },
  sorts: { capturedAt: (row: RequirementRecord) => row.capturedAt },
  defaultSort: { field: 'capturedAt', direction: 'desc' as const },
}

const QUOTATION_LIST_SPEC = {
  search: [(row: Quotation) => row.systemNo],
  filters: {
    status: (row: Quotation) => row.status,
    ownerId: (row: Quotation) => row.ownerId,
    agentId: (row: Quotation) => row.agentId,
    customerId: (row: Quotation) => row.customerId,
  },
  sorts: {
    createdAt: (row: Quotation) => row.createdAt,
    systemNo: (row: Quotation) => row.systemNo,
    version: (row: Quotation) => row.version,
  },
  defaultSort: { field: 'createdAt', direction: 'desc' as const },
}

const DEAL_LIST_SPEC = {
  search: [(row: { systemNo: string }) => row.systemNo],
  filters: {
    status: (row: { status: string }) => row.status,
    ownerId: (row: { ownerId: string }) => row.ownerId,
    agencyId: (row: { agencyId: string | null }) => row.agencyId,
  },
  sorts: {
    createdAt: (row: { createdAt: string }) => row.createdAt,
    systemNo: (row: { systemNo: string }) => row.systemNo,
  },
  defaultSort: { field: 'createdAt', direction: 'desc' as const },
}
