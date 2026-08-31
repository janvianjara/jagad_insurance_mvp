/**
 * The contract side: policies, premium schedules, collections, tasks, renewals
 * and claims.
 *
 * Three things in here are worth reading before the code.
 *
 * The policy adapter builds its machine context from three places rather than
 * one — the entry draft supplies the path (proposal or direct), the customer
 * supplies the KYC state, and the configuration supplies the retention years. All
 * three are facts about the world, and none of them is a value this adapter is
 * free to assume: an issue with no typed Final Premium is refused, and so is an
 * issue where KYC is anything but complete.
 *
 * The retention lock reads the closing date off the event log when the caller
 * does not supply one. That is deliberate: `policy.closed` is emitted on the bus
 * by the transition that closed it, so the audit log is the record of when, and a
 * policy that closed before this store existed honestly has no closing date and
 * is refused rather than guessed at.
 *
 * Tasks have no machine in §9, so `complete` emits `task.completed` directly
 * through the same write path. Everything else here moves through a machine.
 */

import {
  claimMachine,
  collectionMachine,
  policyMachine,
  renewalTaskMachine,
} from '../../domain/workflows'
import type {
  ClaimContext,
  ClaimState,
  CollectionContext,
  CollectionState,
  PolicyContext,
  PolicyEntryPath,
  PolicyState,
  RenewalContext,
  RenewalState,
} from '../../domain/workflows'
import type { Claim, ClaimRepository } from '../repo/claims'
import { PAYMENT_STATES, dealIdOf, precedingPolicyIdOf } from '../repo/policies'
import type {
  CollectionRecord,
  CollectionRepository,
  Policy,
  PolicyDispatch,
  PolicyEntryDraft,
  PolicyNcb,
  PolicyPremiumComponent,
  PolicyRepository,
  PolicyStepCommand,
  PremiumComponentInput,
  PremiumScheduleRepository,
} from '../repo/policies'
import type { Activity, ActivityRepository } from '../repo/activities'
import type { RenewalRepository, RenewalTask, Task, TaskRepository } from '../repo/tasks'
import { notFound, rejected } from '../repo/result'
import type { MutationResult } from '../repo/result'
import { runQuery } from './list'
import type { Latency } from './latency'
import { amendRecord } from './correction'
import { append, create, move, record } from './move'
import { rowsOf } from './store'
import type { MockStore } from './store'

export type ContractDeps = {
  readonly store: MockStore
  readonly latency: Latency
}

export function createContractRepositories(deps: ContractDeps): {
  policies: PolicyRepository
  schedules: PremiumScheduleRepository
  collections: CollectionRepository
  tasks: TaskRepository
  activities: ActivityRepository
  renewals: RenewalRepository
  claims: ClaimRepository
} {
  const { store, latency } = deps
  const t = store.tables
  const wait = () => latency.wait()
  const at = (given?: Date) => given ?? store.now()

  /* -------------------------------------------------------------- policies */

  function retentionYears(): Record<string, number> {
    const years: Record<string, number> = {}
    for (const entry of rowsOf(t.retentionClasses)) years[entry.key] = entry.years
    return years
  }

  function entryPathOf(policyId: string): PolicyEntryPath {
    const draft = rowsOf(t.policyDrafts).find((entry) => entry.policyId === policyId)
    // No draft record means the policy walked the ordinary proposal path. A
    // direct entry always has one, because the direct path is a deliberate act.
    return draft?.entryPath ?? 'proposal'
  }

  function closedAtOf(policyId: string): string | undefined {
    const closing = store
      .eventsFor('Policy', policyId)
      .find((event) => event.name === 'policy.closed')
    return closing?.at
  }

  function policyCtx(
    policy: Policy,
    extra: {
      now: Date
      finalPremium?: Policy['finalPremium']
      finalPremiumSource?: PolicyContext['finalPremiumSource']
      declineReason?: string
      closedAt?: string
    },
  ): PolicyContext {
    const customer = t.customers.get(policy.customerId)
    return {
      now: extra.now,
      entryPath: entryPathOf(policy.id),
      kycState: customer?.kycState ?? 'pending',
      finalPremium: extra.finalPremium ?? policy.finalPremium ?? undefined,
      finalPremiumSource: extra.finalPremiumSource,
      netPremium: policy.netPremium ?? undefined,
      gstAmount: policy.gstAmount ?? undefined,
      retentionClass: policy.retentionClass,
      retentionYearsByClass: retentionYears(),
      closedAt: extra.closedAt ?? closedAtOf(policy.id),
      declineReason: extra.declineReason,
    }
  }

  function step(
    id: string,
    to: PolicyState,
    command: PolicyStepCommand & { declineReason?: string },
  ): MutationResult<Policy> {
    const policy = t.policies.get(id)
    if (!policy) return notFound('Policy', id)

    return move<PolicyState, PolicyContext, Policy>({
      store,
      table: t.policies,
      entity: 'Policy',
      id,
      machine: policyMachine,
      stateOf: (row) => row.status,
      to,
      ctx: policyCtx(policy, {
        now: at(command.now),
        declineReason: command.declineReason,
        closedAt: command.closedAt,
      }),
      actorId: command.actorId,
      detail: command.note === undefined ? undefined : { note: command.note },
      apply: (row) => ({ ...row, status: to }),
    })
  }

  /**
   * The typed components of one policy, replaced wholesale.
   *
   * Replaced rather than merged because the block is entered as a set: a person
   * looking at the insurer's schedule types what is on it, and a component that
   * has disappeared from the schedule should disappear from the record rather
   * than linger from an earlier save. An unrecorded amount is kept as `null` —
   * it is a row saying "nobody typed this", which is not the same as no row.
   */
  function writeComponents(
    policyId: string,
    components: readonly PremiumComponentInput[] | undefined,
    schemaVersion: number,
    stamp: { recordedBy: string; recordedAt: string },
  ): void {
    if (components === undefined) return

    for (const existing of rowsOf(t.policyPremiumComponents)) {
      if (existing.policyId === policyId) t.policyPremiumComponents.delete(existing.id)
    }

    components.forEach((component, index) => {
      const row: PolicyPremiumComponent = {
        id: `ppc-${policyId.replace('pol-', '')}-${component.key}`,
        policyId,
        key: component.key,
        label: component.label,
        amount: component.amount,
        schemaVersion,
        sortOrder: index,
        recordedBy: stamp.recordedBy,
        recordedAt: stamp.recordedAt,
      }
      t.policyPremiumComponents.set(row.id, row)
    })
  }

  const policies: PolicyRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.policies), POLICY_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.policies.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.policies.get(id)).filter((row) => row !== undefined)
    },
    async bySystemNo(no) {
      await wait()
      return rowsOf(t.policies).find((policy) => policy.systemNo === no) ?? null
    },
    async forCustomer(customerId) {
      await wait()
      return rowsOf(t.policies).filter((policy) => policy.customerId === customerId)
    },
    async forHousehold(householdId) {
      await wait()
      const members = new Set(
        rowsOf(t.customers)
          .filter((customer) => customer.householdId === householdId)
          .map((customer) => customer.id),
      )
      return rowsOf(t.policies).filter((policy) => members.has(policy.customerId))
    },
    async completionQueue(query) {
      await wait()
      return runQuery(
        rowsOf(t.policyDrafts).filter((draft) => draft.missingFields.length > 0),
        {
          search: [(row) => row.policyId],
          filters: { entryPath: (row) => row.entryPath, savedBy: (row) => row.savedBy },
          sorts: {
            savedAt: (row) => row.savedAt,
            missing: (row) => row.missingFields.length,
          },
          defaultSort: { field: 'savedAt', direction: 'desc' },
        },
        query,
      )
    },
    async draft(policyId) {
      await wait()
      return rowsOf(t.policyDrafts).find((entry) => entry.policyId === policyId) ?? null
    },
    async versions(policyId) {
      await wait()
      return rowsOf(t.policyVersions)
        .filter((version) => version.policyId === policyId)
        .sort((a, b) => a.version - b.version)
    },
    async premiumComponents(policyId) {
      await wait()
      return rowsOf(t.policyPremiumComponents)
        .filter((row) => row.policyId === policyId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    },
    async ncb(policyId) {
      await wait()
      return rowsOf(t.policyNcbs).find((row) => row.policyId === policyId) ?? null
    },
    async forDeal(dealId) {
      await wait()
      return rowsOf(t.policies).filter((policy) => dealIdOf(policy.provenance) === dealId)
    },
    async renewalsOf(policyId) {
      await wait()
      return rowsOf(t.policies).filter(
        (policy) => precedingPolicyIdOf(policy.provenance) === policyId,
      )
    },
    async expiringBetween(from, to) {
      await wait()
      return rowsOf(t.policies).filter(
        (policy) =>
          policy.expiryDate !== null && policy.expiryDate >= from && policy.expiryDate <= to,
      )
    },

    async create(command) {
      await wait()
      const now = at(command.now)

      const outcome = create({
        store,
        table: t.policies,
        entity: 'Policy',
        // §8 numbers an unissued policy under its own prefix, because the number
        // is read aloud on the phone. A direct entry is a policy the insurer has
        // already issued, so it takes the issued series from the start.
        kind: command.entryPath === 'direct' ? 'policy' : 'policyDraft',
        machine: policyMachine,
        event: 'policy.drafted',
        actorId: command.actorId,
        detail: { entryPath: command.entryPath, dealId: dealIdOf(command.provenance) },
        build: (born): Policy => ({
          id: born.id,
          systemNo: born.systemNo,
          // The company's own number arrives later, through `issue`, and often
          // never arrives at all. Absence is information.
          insurerNo: null,
          customerId: command.customerId,
          companyId: command.companyId,
          productId: command.productId,
          agencyId: command.agencyId,
          agentId: command.agentId ?? null,
          subAgentId: command.subAgentId ?? null,
          status: born.status,
          startDate: command.startDate ?? null,
          expiryDate: command.expiryDate ?? null,
          // Every figure exactly as typed. Nothing here is added up, and an
          // absent one stays absent rather than becoming a zero.
          sumInsured: command.sumInsured ?? null,
          netPremium: command.netPremium ?? null,
          gstAmount: command.gstAmount ?? null,
          finalPremium: command.finalPremium ?? null,
          premiumMode: command.premiumMode,
          paymentState: PAYMENT_STATES.unpaid,
          memberIds: command.memberIds ?? [],
          retentionClass: command.retentionClass,
          provenance: command.provenance,
          schemaVersion: command.schemaVersion,
          // Sensitive fields are not collected by an entry command. They arrive
          // through the flows that guard them.
          proposerBankAccount: null,
          nomineeAadhaarLast4: null,
          medicalReportSummary: null,
        }),
      })

      if (!outcome.ok) return outcome

      // The entry draft is written by the same act, because `issue` reads the
      // entry path back off it: a direct entry with no draft would look like a
      // proposal and be refused by `directEntryPath`.
      const draft: PolicyEntryDraft = {
        // Derived from the policy's own id, so it is unique for the same reason.
        id: `ped-${outcome.record.id.replace('pol-', '')}`,
        policyId: outcome.record.id,
        // Written from `provenance`, never passed separately: one input for one
        // fact is what keeps the draft and the contract from disagreeing later.
        dealId: dealIdOf(command.provenance),
        entryPath: command.entryPath,
        formSchemaId: command.formSchemaId,
        schemaVersion: command.schemaVersion,
        missingFields: command.missingFields ?? [],
        savedBy: command.savedBy,
        savedAt: now.toISOString(),
      }
      t.policyDrafts.set(draft.id, draft)

      // The typed parts, kept. They are written here rather than by a separate
      // call because they were typed in the same act, and a create that dropped
      // them is exactly how a record ends up holding a Net nobody can break down.
      // Nothing reads them back to produce a figure: `netPremium` stays the typed
      // scalar it always was, and `<RollUp>` renders these beside it.
      writeComponents(outcome.record.id, command.components, command.schemaVersion, {
        recordedBy: command.savedBy,
        recordedAt: now.toISOString(),
      })

      if (command.ncb) {
        const ncb: PolicyNcb = {
          id: `ncb-${outcome.record.id.replace('pol-', '')}`,
          policyId: outcome.record.id,
          percentBp: command.ncb.percentBp,
          source: command.ncb.source,
          carriedFromPolicyId: command.ncb.carriedFromPolicyId ?? null,
          recordedBy: command.savedBy,
          recordedAt: now.toISOString(),
        }
        t.policyNcbs.set(ncb.id, ncb)
      }

      return outcome
    },

    async createProposal(id, command) {
      await wait()
      return step(id, 'proposal', command)
    },
    async sendProposal(id, command) {
      await wait()
      return step(id, 'sent', command)
    },

    async issue(id, command) {
      await wait()
      const policy = t.policies.get(id)
      if (!policy) return notFound('Policy', id)

      return move<PolicyState, PolicyContext, Policy>({
        store,
        table: t.policies,
        entity: 'Policy',
        id,
        machine: policyMachine,
        stateOf: (row) => row.status,
        to: 'issued',
        ctx: policyCtx(policy, {
          now: at(command.now),
          finalPremium: command.finalPremium,
          finalPremiumSource: command.finalPremiumSource,
        }),
        actorId: command.actorId,
        detail: { insurerNo: command.insurerNo ?? null },
        apply: (row) => ({
          ...row,
          status: 'issued',
          // Every figure here was typed by the person reading the insurer's
          // document. Net and GST are stored as given; nothing is derived.
          finalPremium: command.finalPremium,
          netPremium: command.netPremium ?? row.netPremium,
          gstAmount: command.gstAmount ?? row.gstAmount,
          insurerNo: command.insurerNo ?? row.insurerNo,
          startDate: command.startDate ?? row.startDate,
          expiryDate: command.expiryDate ?? row.expiryDate,
        }),
      })
    },

    async decline(id, command) {
      await wait()
      return step(id, 'declined', command)
    },
    async dispatch(id, command) {
      await wait()
      const moved = step(id, 'dispatched', command)
      if (!moved.ok) return moved

      // The delivery row is written by the same act as the transition. A
      // `dispatched` policy with no record of where the document went is the
      // state FR-10.9 exists to prevent, so the two cannot come apart.
      const at = command.now ?? store.now()
      const dispatch: PolicyDispatch = {
        id: `dsp-${id.replace('pol-', '')}-${rowsOf(t.policyDispatches).filter((row) => row.policyId === id).length + 1}`,
        policyId: id,
        channel: command.channel,
        documentId: command.documentId ?? null,
        // Nothing is delivered at the moment it is sent. The courier or the
        // customer says so later, and until then the honest state is pending.
        state: 'pending',
        recipientName: command.recipientName,
        recipientContactMasked: command.recipientContactMasked,
        courierName: command.courierName ?? null,
        trackingRef: command.trackingRef ?? null,
        dispatchedBy: command.actorId,
        dispatchedAt: at.toISOString(),
        deliveredAt: null,
        confirmedAt: null,
        confirmedBy: null,
        returnReason: null,
      }
      t.policyDispatches.set(dispatch.id, dispatch)

      return moved
    },
    async dispatches(policyId) {
      await wait()
      return rowsOf(t.policyDispatches)
        .filter((row) => row.policyId === policyId)
        .sort((a, b) => a.dispatchedAt.localeCompare(b.dispatchedAt))
    },
    async recordDelivery(dispatchId, command) {
      await wait()
      const dispatch = t.policyDispatches.get(dispatchId)
      if (!dispatch) return notFound('PolicyDispatch', dispatchId)

      if (command.state === 'returned' && !command.returnReason?.trim()) {
        return rejected(
          'Record what the courier said when it came back. A returned document with no reason cannot be chased.',
        )
      }

      const at = (command.now ?? store.now()).toISOString()
      // Delivery and confirmation are different claims by different people, so
      // one never fills in the other: a courier saying it arrived is not the
      // customer saying they have it.
      const next: PolicyDispatch = {
        ...dispatch,
        state: command.state,
        deliveredAt:
          command.state === 'delivered' || command.state === 'confirmed_by_customer'
            ? (dispatch.deliveredAt ?? at)
            : dispatch.deliveredAt,
        confirmedAt: command.state === 'confirmed_by_customer' ? at : dispatch.confirmedAt,
        confirmedBy:
          command.state === 'confirmed_by_customer' ? command.actorId : dispatch.confirmedBy,
        returnReason: command.state === 'returned' ? (command.returnReason ?? null) : dispatch.returnReason,
      }
      t.policyDispatches.set(next.id, next)
      return { ok: true, record: next, events: [] }
    },
    async collectDocuments(id, command) {
      await wait()
      return step(id, 'documents_collected', command)
    },
    async close(id, command) {
      await wait()
      return step(id, 'closed', command)
    },
    async lock(id, command) {
      await wait()
      return step(id, 'locked', command)
    },

    async amend(id, command) {
      await wait()
      return amendRecord({
        store,
        table: t.policies,
        entity: 'Policy',
        id,
        command,
        /*
         * D3's line, read off the record rather than passed in.
         *
         * Four states mean the insurer has not issued: the policy is still being
         * drafted, the proposal is being prepared, it has gone out, or it came
         * back declined. In every one of those the premium on the record is data
         * entry and a typo in it is correctable. Everything from `issued`
         * onwards is a contract, and its figures change through an endorsement.
         */
        issuedOf: (row) =>
          row.status !== 'draft' &&
          row.status !== 'proposal' &&
          row.status !== 'sent' &&
          row.status !== 'declined',
      })
    },
  }

  /* ------------------------------------------------------------- schedules */

  const schedules: PremiumScheduleRepository = {
    async forPolicy(policyId) {
      await wait()
      return rowsOf(t.premiumSchedules).find((schedule) => schedule.policyId === policyId) ?? null
    },
    async instalments(scheduleId) {
      await wait()
      return rowsOf(t.instalments)
        .filter((instalment) => instalment.scheduleId === scheduleId)
        .sort((a, b) => a.sequence - b.sequence)
    },
    async dueBetween(from, to) {
      await wait()
      return rowsOf(t.instalments).filter(
        (instalment) => instalment.dueDate >= from && instalment.dueDate <= to,
      )
    },
    async mandate(policyId) {
      await wait()
      return rowsOf(t.mandates).find((mandate) => mandate.policyId === policyId) ?? null
    },
    async mandateEvents(mandateId) {
      await wait()
      return rowsOf(t.mandateEvents)
        .filter((event) => event.mandateId === mandateId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    },
  }

  /* ----------------------------------------------------------- collections */

  function collectionCtx(
    row: CollectionRecord,
    extra: Partial<CollectionContext> & { now: Date },
  ): CollectionContext {
    return {
      now: extra.now,
      route: extra.route ?? row.route,
      instrument: extra.instrument ?? row.instrument,
      mode: extra.mode ?? row.mode,
      amount: extra.amount ?? row.amount ?? undefined,
      reference: extra.reference ?? row.reference ?? undefined,
      agencyBooksTouched: extra.agencyBooksTouched,
      collectedBy: extra.collectedBy ?? row.collectedBy ?? undefined,
      verification: extra.verification,
      followUpTaskCreated: extra.followUpTaskCreated,
      followUpTaskDueOn: extra.followUpTaskDueOn,
      bounceReason: extra.bounceReason ?? row.bounceReason ?? undefined,
    }
  }

  const collections: CollectionRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.collections), COLLECTION_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.collections.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.collections.get(id)).filter((row) => row !== undefined)
    },
    async forPolicy(policyId) {
      await wait()
      return rowsOf(t.collections).filter((entry) => entry.policyId === policyId)
    },

    async record(id, command) {
      await wait()
      const existing = t.collections.get(id)
      if (!existing) return notFound('CollectionRecord', id)

      const now = at(command.now)
      // §9 forks on the route: money that went straight to the company is a
      // reference and never touches the agency books.
      const to: CollectionState =
        command.route === 'direct_to_company' ? 'reference_recorded' : 'recorded'

      return move<CollectionState, CollectionContext, CollectionRecord>({
        store,
        table: t.collections,
        entity: 'CollectionRecord',
        id,
        machine: collectionMachine,
        stateOf: (row) => row.state,
        to,
        ctx: collectionCtx(existing, {
          now,
          route: command.route,
          instrument: command.instrument,
          mode: command.mode,
          amount: command.amount,
          reference: command.reference,
          collectedBy: command.collectedBy,
          agencyBooksTouched: false,
        }),
        actorId: command.actorId,
        detail: { route: command.route, instrument: command.instrument, mode: command.mode },
        apply: (row) => ({
          ...row,
          state: to,
          route: command.route,
          instrument: command.instrument,
          mode: command.mode,
          amount: command.amount,
          reference: command.reference ?? row.reference,
          collectedBy: command.collectedBy,
          collectedAt: now.toISOString(),
        }),
      })
    },

    async verify(id, command) {
      await wait()
      const existing = t.collections.get(id)
      if (!existing) return notFound('CollectionRecord', id)
      const now = at(command.now)

      return move<CollectionState, CollectionContext, CollectionRecord>({
        store,
        table: t.collections,
        entity: 'CollectionRecord',
        id,
        machine: collectionMachine,
        stateOf: (row) => row.state,
        to: 'verified',
        ctx: collectionCtx(existing, {
          now,
          verification: {
            userId: command.verifiedBy,
            isBackOffice: command.verifierIsBackOffice,
            verifiedAt: now.toISOString(),
          },
        }),
        actorId: command.actorId,
        apply: (row) => ({
          ...row,
          state: 'verified',
          verifiedBy: command.verifiedBy,
          verifiedAt: now.toISOString(),
        }),
      })
    },

    async markBounced(id, command) {
      await wait()
      const existing = t.collections.get(id)
      if (!existing) return notFound('CollectionRecord', id)

      return move<CollectionState, CollectionContext, CollectionRecord>({
        store,
        table: t.collections,
        entity: 'CollectionRecord',
        id,
        machine: collectionMachine,
        stateOf: (row) => row.state,
        to: 'bounced',
        ctx: collectionCtx(existing, {
          now: at(command.now),
          bounceReason: command.bounceReason,
          followUpTaskCreated: command.followUpTaskCreated,
          followUpTaskDueOn: command.followUpTaskDueOn,
        }),
        actorId: command.actorId,
        detail: { bounceReason: command.bounceReason, followUpDueOn: command.followUpTaskDueOn },
        apply: (row) => ({ ...row, state: 'bounced', bounceReason: command.bounceReason }),
      })
    },

    async close(id, command) {
      await wait()
      const existing = t.collections.get(id)
      if (!existing) return notFound('CollectionRecord', id)

      return move<CollectionState, CollectionContext, CollectionRecord>({
        store,
        table: t.collections,
        entity: 'CollectionRecord',
        id,
        machine: collectionMachine,
        stateOf: (row) => row.state,
        to: 'closed',
        ctx: collectionCtx(existing, {
          now: at(command.now),
          verification:
            existing.verifiedBy === null
              ? undefined
              : {
                  userId: existing.verifiedBy,
                  isBackOffice: true,
                  verifiedAt: existing.verifiedAt ?? at(command.now).toISOString(),
                },
        }),
        actorId: command.actorId,
        apply: (row) => ({ ...row, state: 'closed' }),
      })
    },
  }

  /* ----------------------------------------------------------------- tasks */

  const tasks: TaskRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.tasks), TASK_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.tasks.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.tasks.get(id)).filter((row) => row !== undefined)
    },
    async forOwner(ownerId, query) {
      await wait()
      return runQuery(
        rowsOf(t.tasks).filter((task) => task.ownerId === ownerId),
        TASK_LIST_SPEC,
        query,
      )
    },
    async forSubject(subjectEntity, subjectId) {
      await wait()
      return rowsOf(t.tasks).filter(
        (task) => task.subjectEntity === subjectEntity && task.subjectId === subjectId,
      )
    },
    async open(query) {
      await wait()
      return runQuery(
        rowsOf(t.tasks).filter((task) => task.state === 'open' || task.state === 'in_progress'),
        TASK_LIST_SPEC,
        query,
      )
    },
    async create(command) {
      await wait()
      const now = at(command.now)
      const dueAt = new Date(command.dueAt)
      if (Number.isNaN(dueAt.getTime())) {
        return rejected(
          'That due date could not be read, so nothing would ever surface this task. Pick a date and time.',
        )
      }
      return append<Task>({
        store,
        table: t.tasks,
        entity: 'Task',
        kind: 'task',
        event: 'task.created',
        actorId: command.actorId,
        causedBy: command.causedBy,
        detail: { kind: command.kind, subject: command.subjectId, dueAt: command.dueAt },
        build: (born) => ({
          id: born.id,
          systemNo: born.systemNo,
          kind: command.kind,
          title: command.title,
          subjectEntity: command.subjectEntity,
          subjectId: command.subjectId,
          ownerId: command.ownerId ?? null,
          teamId: command.teamId ?? null,
          agentId: command.agentId ?? null,
          state: 'open',
          priority: command.priority ?? 'normal',
          dueAt: command.dueAt,
          createdAt: now.toISOString(),
          completedAt: null,
          // A person who raised it is named as themselves. Only a recipe gets to
          // be named by key, and then the audit says which recipe fired.
          raisedBy: command.raisedBy ?? command.actorId,
        }),
      })
    },
    async complete(id, command) {
      await wait()
      const now = at(command.now)
      // §9 gives a task no machine of its own, so the write path is the same but
      // the move is a single recorded fact rather than a guarded transition.
      return record<Task>({
        store,
        table: t.tasks,
        entity: 'Task',
        id,
        event: 'task.completed',
        actorId: command.actorId,
        detail: command.note === undefined ? undefined : { note: command.note },
        apply: (row) => ({ ...row, state: 'done', completedAt: now.toISOString() }),
      })
    },
  }

  /* ------------------------------------------------------------ activities */

  /**
   * The engagement log — FR-06.13.
   *
   * Read and append, and nothing else. There is no `update` and no `remove` on
   * the interface, so there is nothing to implement here: a call log somebody can
   * quietly revise afterwards is not evidence of anything, and the way to make
   * that true is for the edit path not to exist rather than for a rule to forbid
   * it.
   *
   * `log` counts the attempt itself rather than taking one from the caller. Two
   * screens supplying their own counters is how a counter starts disagreeing with
   * itself by the second week, and the count is the whole point of "tried three
   * times, never picked up".
   */
  const activities: ActivityRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.activities), ACTIVITY_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.activities.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.activities.get(id)).filter((row) => row !== undefined)
    },
    async forSubject(subjectEntity, subjectId) {
      await wait()
      return rowsOf(t.activities)
        .filter((row) => row.subjectEntity === subjectEntity && row.subjectId === subjectId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    },
    async latestFor(subjectEntity, subjectId) {
      await wait()
      const rows = rowsOf(t.activities)
        .filter((row) => row.subjectEntity === subjectEntity && row.subjectId === subjectId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      return rows[rows.length - 1] ?? null
    },
    async forActor(actorId, query) {
      await wait()
      return runQuery(
        rowsOf(t.activities).filter((row) => row.actorId === actorId),
        ACTIVITY_LIST_SPEC,
        query,
      )
    },
    async log(command) {
      await wait()
      const now = at(command.now)
      const occurredAt = command.occurredAt ?? now.toISOString()
      if (Number.isNaN(new Date(occurredAt).getTime())) {
        return rejected('That contact time could not be read. Say when this happened.')
      }

      const disposition = rowsOf(t.dispositions).find(
        (row) => row.key === command.dispositionKey,
      )
      if (!disposition) {
        return rejected(
          `"${command.dispositionKey}" is not a configured outcome. The list of outcomes is edited in configuration, and an activity has to carry one of them.`,
        )
      }

      const prior = rowsOf(t.activities).filter(
        (row) =>
          row.subjectEntity === command.subjectEntity && row.subjectId === command.subjectId,
      )
      const attempts = prior.reduce((high, row) => Math.max(high, row.attemptNo), 0)

      return append<Activity>({
        store,
        table: t.activities,
        entity: 'Activity',
        kind: 'activity',
        event: 'activity.logged',
        actorId: command.actorId,
        // The disposition and the channel go into the audit trail; the note does
        // not. What was said is on the record, not in the event stream, for the
        // same reason it is `document-content` in the classification registry.
        detail: {
          subject: command.subjectId,
          channel: command.channel,
          direction: command.direction,
          disposition: disposition.key,
        },
        build: (born) => ({
          id: born.id,
          systemNo: born.systemNo,
          subjectEntity: command.subjectEntity,
          subjectId: command.subjectId,
          channel: command.channel,
          direction: command.direction,
          occurredAt,
          actorId: command.actorId,
          dispositionKey: disposition.key,
          notes: command.notes ?? null,
          nextTaskId: command.nextTaskId ?? null,
          attemptNo: disposition.incrementsAttempt ? attempts + 1 : attempts,
          messageLogId: command.messageLogId ?? null,
          createdAt: now.toISOString(),
        }),
      })
    },
  }

  /* -------------------------------------------------------------- renewals */

  const renewals: RenewalRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.renewalTasks), RENEWAL_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.renewalTasks.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.renewalTasks.get(id)).filter((row) => row !== undefined)
    },
    async forPolicy(policyId) {
      await wait()
      return rowsOf(t.renewalTasks).find((task) => task.policyId === policyId) ?? null
    },
    async pool(query) {
      await wait()
      return runQuery(
        rowsOf(t.renewalTasks).filter((task) => task.state === 'in_pool'),
        RENEWAL_LIST_SPEC,
        query,
      )
    },
    async assign(id, command) {
      await wait()
      const task = t.renewalTasks.get(id)
      if (!task) return notFound('RenewalTask', id)

      return move<RenewalState, RenewalContext, RenewalTask>({
        store,
        table: t.renewalTasks,
        entity: 'RenewalTask',
        id,
        machine: renewalTaskMachine,
        stateOf: (row) => row.state,
        to: 'assigned',
        ctx: {
          now: at(command.now),
          expiryDate: task.expiryDate,
          leadDays: command.leadDays,
          assigneeId: command.assigneeId,
          selfAssigned: command.selfAssigned,
          remindersSent: task.remindersSent,
        },
        actorId: command.actorId,
        detail: { assigneeId: command.assigneeId, selfAssigned: command.selfAssigned },
        apply: (row) => ({ ...row, state: 'assigned', assigneeId: command.assigneeId }),
      })
    },
  }

  /* ---------------------------------------------------------------- claims */

  const claims: ClaimRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.claims), CLAIM_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.claims.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.claims.get(id)).filter((row) => row !== undefined)
    },
    async bySystemNo(no) {
      await wait()
      return rowsOf(t.claims).find((claim) => claim.systemNo === no) ?? null
    },
    async forPolicy(policyId) {
      await wait()
      return rowsOf(t.claims).filter((claim) => claim.policyId === policyId)
    },
    async forCustomer(customerId) {
      await wait()
      return rowsOf(t.claims).filter((claim) => claim.customerId === customerId)
    },
    async queue(query) {
      await wait()
      return runQuery(rowsOf(t.claims), CLAIM_LIST_SPEC, query)
    },
    async inPeriod(policyId, from, to) {
      await wait()
      return rowsOf(t.claims).filter(
        (claim) =>
          claim.policyId === policyId &&
          claim.raisedAt.slice(0, 10) >= from &&
          claim.raisedAt.slice(0, 10) <= to,
      )
    },

    async advance(id, to, command) {
      await wait()
      const claim = t.claims.get(id)
      if (!claim) return notFound('Claim', id)
      const policy = t.policies.get(claim.policyId)
      const settlement = command.settlement ?? claim.settlement

      return move<ClaimState, ClaimContext, Claim>({
        store,
        table: t.claims,
        entity: 'Claim',
        id,
        machine: claimMachine,
        stateOf: (row) => row.state,
        to,
        ctx: {
          claimType: claim.claimType,
          policyActive: command.policyActive ?? policy?.status === 'issued',
          policyStatus: command.policyStatus ?? policy?.status,
          agentNotified: command.agentNotified,
          settlement: {
            amount: settlement.amount ?? undefined,
            deduction: settlement.deduction ?? undefined,
            source: settlement.source ?? undefined,
            insurerAdviceRef: settlement.insurerAdviceRef ?? undefined,
          },
          companyRemark: command.companyRemark ?? claim.companyRemark ?? undefined,
          documentsCollected: command.documentsCollected ?? claim.documentsCollected,
          checklistItems: claim.checklistItems,
          presentDocTypes: command.presentDocTypes,
        },
        actorId: command.actorId,
        apply: (row) => ({
          ...row,
          state: to,
          settlement: command.settlement ?? row.settlement,
          companyRemark: command.companyRemark ?? row.companyRemark,
          documentsCollected: command.documentsCollected ?? row.documentsCollected,
        }),
      })
    },

    async amend(id, command) {
      await wait()
      return amendRecord({
        store,
        table: t.claims,
        entity: 'Claim',
        id,
        command,
        /*
         * A claim exists because a policy was issued, so its own record is
         * always past the point where a figure could be corrected. Nothing in
         * `AMEND_POLICIES.Claim` is an amount, and this keeps it that way if one
         * is ever added by mistake.
         */
        issuedOf: () => true,
      })
    },
  }

  return { policies, schedules, collections, tasks, activities, renewals, claims }
}

/* ------------------------------------------------------------- list specs */

const POLICY_LIST_SPEC = {
  search: [
    (row: Policy) => row.systemNo,
    (row: Policy) => row.insurerNo,
  ],
  filters: {
    status: (row: Policy) => row.status,
    companyId: (row: Policy) => row.companyId,
    productId: (row: Policy) => row.productId,
    agencyId: (row: Policy) => row.agencyId,
    agentId: (row: Policy) => row.agentId,
    premiumMode: (row: Policy) => row.premiumMode,
    paymentState: (row: Policy) => row.paymentState,
    customerId: (row: Policy) => row.customerId,
  },
  sorts: {
    systemNo: (row: Policy) => row.systemNo,
    expiryDate: (row: Policy) => row.expiryDate,
    startDate: (row: Policy) => row.startDate,
    finalPremium: (row: Policy) => row.finalPremium?.paise ?? null,
  },
  defaultSort: { field: 'expiryDate', direction: 'asc' as const },
}

const COLLECTION_LIST_SPEC = {
  search: [(row: CollectionRecord) => row.reference],
  filters: {
    state: (row: CollectionRecord) => row.state,
    route: (row: CollectionRecord) => row.route,
    instrument: (row: CollectionRecord) => row.instrument,
    mode: (row: CollectionRecord) => row.mode,
  },
  sorts: { collectedAt: (row: CollectionRecord) => row.collectedAt },
  defaultSort: { field: 'collectedAt', direction: 'desc' as const },
}

const TASK_LIST_SPEC = {
  search: [(row: Task) => row.title, (row: Task) => row.systemNo],
  filters: {
    state: (row: Task) => row.state,
    kind: (row: Task) => row.kind,
    priority: (row: Task) => row.priority,
    ownerId: (row: Task) => row.ownerId,
    teamId: (row: Task) => row.teamId,
    subjectEntity: (row: Task) => row.subjectEntity,
  },
  sorts: {
    dueAt: (row: Task) => row.dueAt,
    createdAt: (row: Task) => row.createdAt,
    priority: (row: Task) => row.priority,
  },
  defaultSort: { field: 'dueAt', direction: 'asc' as const },
}

const ACTIVITY_LIST_SPEC = {
  search: [(row: Activity) => row.systemNo, (row: Activity) => row.dispositionKey],
  filters: {
    channel: (row: Activity) => row.channel,
    direction: (row: Activity) => row.direction,
    dispositionKey: (row: Activity) => row.dispositionKey,
    actorId: (row: Activity) => row.actorId,
    subjectEntity: (row: Activity) => row.subjectEntity,
    subjectId: (row: Activity) => row.subjectId,
  },
  sorts: {
    occurredAt: (row: Activity) => row.occurredAt,
    createdAt: (row: Activity) => row.createdAt,
  },
  // Newest first: a contact log is read to find out what happened last.
  defaultSort: { field: 'occurredAt', direction: 'desc' as const },
}

const RENEWAL_LIST_SPEC = {
  search: [(row: RenewalTask) => row.policyId],
  filters: {
    state: (row: RenewalTask) => row.state,
    assigneeId: (row: RenewalTask) => row.assigneeId,
  },
  sorts: {
    dueOn: (row: RenewalTask) => row.dueOn,
    expiryDate: (row: RenewalTask) => row.expiryDate,
  },
  defaultSort: { field: 'dueOn', direction: 'asc' as const },
}

const CLAIM_LIST_SPEC = {
  search: [(row: Claim) => row.systemNo],
  filters: {
    state: (row: Claim) => row.state,
    claimType: (row: Claim) => row.claimType,
    ownerId: (row: Claim) => row.ownerId,
    policyId: (row: Claim) => row.policyId,
  },
  sorts: { raisedAt: (row: Claim) => row.raisedAt, systemNo: (row: Claim) => row.systemNo },
  defaultSort: { field: 'raisedAt', direction: 'desc' as const },
}
