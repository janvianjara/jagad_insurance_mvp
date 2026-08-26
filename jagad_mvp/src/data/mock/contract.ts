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
import type {
  CollectionRecord,
  CollectionRepository,
  Policy,
  PolicyRepository,
  PolicyStepCommand,
  PremiumScheduleRepository,
} from '../repo/policies'
import type { RenewalRepository, RenewalTask, Task, TaskRepository } from '../repo/tasks'
import { notFound } from '../repo/result'
import type { MutationResult } from '../repo/result'
import { runQuery } from './list'
import type { Latency } from './latency'
import { move, record } from './move'
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
    async expiringBetween(from, to) {
      await wait()
      return rowsOf(t.policies).filter(
        (policy) =>
          policy.expiryDate !== null && policy.expiryDate >= from && policy.expiryDate <= to,
      )
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
      return step(id, 'dispatched', command)
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
  }

  return { policies, schedules, collections, tasks, renewals, claims }
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
