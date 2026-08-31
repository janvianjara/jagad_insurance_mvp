/**
 * The erasure register, in the mock adapter — FR-20.2.
 *
 * The whole of this repository is one question asked properly: what does this
 * platform actually hold about this person, and does any of it have to be kept.
 * The answer is read off the tables rather than off anybody's judgement —
 * `assessErasure` in `src/domain/amend.ts` turns three counts into a verdict —
 * which is what makes the decision reproducible and what lets a screen show the
 * obligation by name instead of a shrug.
 *
 * Nothing here deletes anything, and there is no branch that could. A verdict of
 * `erased` on the MVP's data means the platform holds no live contract, no open
 * claim and nothing inside a retention window for the subject, and the honest
 * consequence of that is recorded rather than acted on: the suppression is the
 * change, and the removal is a back-office act somebody performs against a
 * decided request. A method here called `erase` would be a method somebody
 * eventually pointed at a policy.
 */

import { assessErasure } from '../../domain/amend'
import type { Suppression } from '../../domain/amend'
import { ERASE_SUBJECT_ENTITIES, isEraseRequester } from '../repo/erasure'
import type {
  EraseRequest,
  EraseRequestRepository,
  EraseSubjectEntity,
  SuppressionState,
} from '../repo/erasure'
import { committed, rejected } from '../repo/result'
import { runQuery } from './list'
import type { ListSpec } from './list'
import type { Latency } from './latency'
import { append } from './move'
import { rowsOf } from './store'
import type { MockStore } from './store'

export type ErasureDeps = {
  readonly store: MockStore
  readonly latency: Latency
}

const ERASE_REQUEST_LIST_SPEC: ListSpec<EraseRequest> = {
  search: [(row) => row.systemNo, (row) => row.subjectId, (row) => row.note],
  filters: {
    verdict: (row) => row.verdict,
    subjectEntity: (row) => row.subjectEntity,
    requestedBy: (row) => row.requestedBy,
  },
  sorts: {
    requestedAt: (row) => row.requestedAt,
    systemNo: (row) => row.systemNo,
  },
  defaultSort: { field: 'requestedAt', direction: 'desc' },
}

/**
 * A policy the agency is still on the hook for.
 *
 * Deliberately generous about what counts. Anything from `issued` onwards is a
 * contract that existed; only a draft, a proposal, one that was sent and one
 * that was declined never became one. A closed or lapsed policy is not live but
 * is still inside its retention class's window, which is the `partial` branch
 * rather than this one.
 */
const LIVE_POLICY_STATES = ['issued', 'dispatched', 'documents_collected'] as const

/** A claim nobody has finished with. */
const CLOSED_CLAIM_STATES = ['closed', 'rejected'] as const

export function createErasureRepositories(deps: ErasureDeps): {
  eraseRequests: EraseRequestRepository
} {
  const { store, latency } = deps
  const t = store.tables
  const wait = () => latency.wait()
  const requests = store.eraseRequests

  /** Every customer id the subject resolves to. A policy or a claim names one. */
  function customerIdOf(entity: EraseSubjectEntity, id: string): string | null {
    if (entity === 'Customer') return t.customers.has(id) ? id : null
    if (entity === 'Policy') return t.policies.get(id)?.customerId ?? null
    return t.claims.get(id)?.customerId ?? null
  }

  function factsFor(entity: EraseSubjectEntity, id: string) {
    const customerId = customerIdOf(entity, id)
    if (customerId === null) return null

    const policies = rowsOf(t.policies).filter((policy) => policy.customerId === customerId)
    const claims = rowsOf(t.claims).filter((claim) => claim.customerId === customerId)

    const livePolicyCount = policies.filter((policy) =>
      (LIVE_POLICY_STATES as readonly string[]).includes(policy.status),
    ).length
    const openClaimCount = claims.filter(
      (claim) => !(CLOSED_CLAIM_STATES as readonly string[]).includes(claim.state),
    ).length

    return {
      livePolicyCount,
      openClaimCount,
      // Everything closed still sits inside its retention class's window: the
      // MVP holds no expiry date for one, and asserting a window had run when
      // nothing measures it would be the worse of the two errors.
      recordsInRetention: policies.length + claims.length - livePolicyCount - openClaimCount,
    }
  }

  const eraseRequests: EraseRequestRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(requests), ERASE_REQUEST_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return requests.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => requests.get(id)).filter((row) => row !== undefined)
    },
    async bySystemNo(no) {
      await wait()
      return rowsOf(requests).find((row) => row.systemNo === no) ?? null
    },
    async forSubject(entity, id) {
      await wait()
      return rowsOf(requests).filter(
        (row) => row.subjectEntity === entity && row.subjectId === id,
      )
    },
    async queue(query) {
      await wait()
      return runQuery(rowsOf(requests), ERASE_REQUEST_LIST_SPEC, query)
    },
    async suppression(entity, id) {
      await wait()
      const mine = rowsOf(requests).filter(
        (row) => row.subjectEntity === entity && row.subjectId === id,
      )
      const suppressed = [...new Set(mine.flatMap((row) => row.suppressed))] as Suppression[]
      const latest = mine.filter((row) => row.suppressed.length > 0).at(-1) ?? null

      const state: SuppressionState = {
        subjectEntity: entity,
        subjectId: id,
        suppressed,
        sinceRequestId: latest?.id ?? null,
      }
      return state
    },

    async request(command) {
      await wait()

      if (!(ERASE_SUBJECT_ENTITIES as readonly string[]).includes(command.subjectEntity)) {
        return rejected(
          `${command.subjectEntity} is not a record an erasure request is raised against. Requests cover ${ERASE_SUBJECT_ENTITIES.join(', ')}; a lead is discarded instead.`,
        )
      }
      if (!isEraseRequester(command.requestedBy)) {
        return rejected(
          `"${command.requestedBy}" is not a recognised requester. A request comes from the data principal, their guardian, or staff acting on their behalf.`,
        )
      }

      const facts = factsFor(command.subjectEntity, command.subjectId)
      if (facts === null) {
        return rejected(
          `No ${command.subjectEntity} exists with id ${command.subjectId}, so there is nothing to decide about.`,
        )
      }

      const assessment = assessErasure(facts)
      const note = command.note?.trim() ?? ''

      /*
       * `erasure.requested` is emitted first and separately, so the log can
       * answer "did anybody ever ask" without reading the decision. The append
       * below emits `erasure.decided`, and both carry the same subject.
       */
      const requested = store.bus.emit('erasure.requested', {
        actorId: command.actorId,
        subject: { entity: command.subjectEntity, id: command.subjectId },
        detail: { requestedBy: command.requestedBy, note: note === '' ? null : note },
      })

      const decided = append<EraseRequest>({
        store,
        table: requests,
        entity: 'EraseRequest',
        kind: 'eraseRequest',
        event: 'erasure.decided',
        actorId: command.actorId,
        detail: {
          verdict: assessment.verdict,
          // Names only. The obligation is a category, never the policy behind it.
          obligations: assessment.obligations.join(', '),
          suppressed: assessment.suppressed.join(', '),
          subjectEntity: command.subjectEntity,
          subjectId: command.subjectId,
          livePolicyCount: facts.livePolicyCount,
          openClaimCount: facts.openClaimCount,
        },
        build: (born, events) => ({
          id: born.id,
          systemNo: born.systemNo,
          subjectEntity: command.subjectEntity,
          subjectId: command.subjectId,
          requestedBy: command.requestedBy,
          recordedBy: command.actorId,
          requestedAt: events[0].at,
          decidedAt: events[0].at,
          decidedBy: command.actorId,
          verdict: assessment.verdict,
          obligations: assessment.obligations,
          obligationNote: assessment.obligationNote,
          suppressed: assessment.suppressed,
          note: note === '' ? null : note,
        }),
      })

      // The request and its decision are one act, so the caller gets both events
      // in the order they happened rather than only the second.
      return decided.ok ? committed(decided.record, [requested, ...decided.events]) : decided
    },
  }

  return { eraseRequests }
}
