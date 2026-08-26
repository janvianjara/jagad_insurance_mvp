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

import { addMinutes } from '../fixtures/clock'
import {
  archiveQuotationVersion,
  consentMachine,
  dealMachine,
  inquiryMachine,
  kycMachine,
  quotationMachine,
} from '../../domain/workflows'
import type {
  AgencyScope,
  ConsentLink,
  ConsentState,
  KycConsentState,
  QuotationColumn,
  QuotationContext,
  QuotationVersion,
} from '../../domain/workflows'
import type { ConsentRecord, Customer, CustomerRepository } from '../repo/customers'
import type { DealRepository } from '../repo/deals'
import type { Inquiry, InquiryRepository } from '../repo/inquiries'
import type { Quotation, QuotationLine, QuotationRepository } from '../repo/quotations'
import { notFound, rejected } from '../repo/result'
import type { MutationResult } from '../repo/result'
import { runQuery } from './list'
import type { Latency } from './latency'
import { move } from './move'
import { rowsOf } from './store'
import type { MockStore } from './store'

export type PipelineDeps = {
  readonly store: MockStore
  readonly latency: Latency
}

export function createPipelineRepositories(deps: PipelineDeps): {
  customers: CustomerRepository
  inquiries: InquiryRepository
  quotations: QuotationRepository
  deals: DealRepository
} {
  const { store, latency } = deps
  const t = store.tables
  const wait = () => latency.wait()
  const at = (given?: Date) => given ?? store.now()

  /* ------------------------------------------------------------- customers */

  function consentFor(customerId: string): ConsentRecord | null {
    return rowsOf(t.consentRecords).find((entry) => entry.customerId === customerId) ?? null
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

    async advanceKyc(customerId, to, command) {
      await wait()
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
          requiredDocuments: command.requiredDocuments,
          presentDocuments: command.presentDocuments,
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
        apply: (row) => ({ ...row, consentState: to }),
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
  }

  /* ------------------------------------------------------------ quotations */

  function linesOf(quotationId: string, version?: number): QuotationLine[] {
    return rowsOf(t.quotationLines).filter(
      (line) => line.quotationId === quotationId && (version === undefined || line.version === version),
    )
  }

  function columnsOf(quotation: Quotation): QuotationColumn[] {
    return linesOf(quotation.id, quotation.version).map((line) => ({
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
    extra: { version?: number; revisionReason?: string; lostReason?: string; columns?: QuotationColumn[] },
  ): QuotationContext {
    return {
      columns: extra.columns ?? columnsOf(quotation),
      version: extra.version ?? quotation.version,
      priorVersions: priorVersionsOf(quotation),
      revisionReason: extra.revisionReason ?? quotation.revisionReason ?? undefined,
      lostReason: extra.lostReason ?? quotation.lostReason ?? undefined,
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

    async markWon(id, command) {
      await wait()
      const quotation = t.quotations.get(id)
      if (!quotation) return notFound('Quotation', id)

      const accepted = command.acceptedColumnKey
        ? linesOf(id, quotation.version).find((line) => line.columnKey === command.acceptedColumnKey)
        : undefined

      return move({
        store,
        table: t.quotations,
        entity: 'Quotation',
        id,
        machine: quotationMachine,
        stateOf: (row) => row.status,
        to: 'won',
        ctx: quotationCtx(quotation, {}),
        actorId: command.actorId,
        detail: { column: command.acceptedColumnKey ?? null },
        apply: (row) => ({
          ...row,
          status: 'won',
          // The accepted column's typed figure becomes the header figure. It is
          // carried across, never recalculated.
          finalPayablePremium: accepted?.finalPayablePremium ?? row.finalPayablePremium,
        }),
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
    const scopes = rowsOf(t.agencyScopes).filter(
      (scope) => scope.agencyId === agencyId && scope.active,
    )
    return {
      agencyId,
      companyIds: [...new Set(scopes.map((scope) => scope.companyId))],
      productIds: [...new Set(scopes.map((scope) => scope.productId))],
    }
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
    async forCustomer(customerId, query) {
      await wait()
      return runQuery(
        rowsOf(t.deals).filter((deal) => deal.customerId === customerId),
        DEAL_LIST_SPEC,
        query,
      )
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

  return { customers, inquiries, quotations, deals }
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
  },
  sorts: {
    createdAt: (row: Inquiry) => row.createdAt,
    tatDueAt: (row: Inquiry) => row.tatDueAt,
    systemNo: (row: Inquiry) => row.systemNo,
  },
  defaultSort: { field: 'createdAt', direction: 'desc' as const },
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
