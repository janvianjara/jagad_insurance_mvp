/**
 * The claims desk — the one seam `/claims/new` writes through.
 *
 * `ClaimRepository` (plan §7) is read-plus-`advance`: the P2 screens were always
 * going to add intimation, and §8 says so ("the repository is therefore read plus
 * one machine-routed move"). So this module supplies exactly the two things the
 * repository does not, and nothing else:
 *
 *   `intimate`  — canvas 4.1 and 4.2. A claim is born in `raised` and is moved
 *                 in the same act to `intimated` or, on an inactive policy, to
 *                 `blocked` with the sourcing agent notified. Both moves are the
 *                 §9 machine's, not this module's: a refusal writes nothing,
 *                 stores nothing and comes back as the machine's own sentence.
 *
 *   `routing`   — FR-11's status-message log. `routeStatusMessage` decides where
 *                 a status message goes; this keeps the record of where each one
 *                 went, which is the half of "the reroute is logged" that a
 *                 decision function cannot hold.
 *
 * Rows created here live beside the seeded ones rather than inside them, because
 * the mock store is not reachable from a feature. Every read below merges the two
 * and re-runs the URL's own query over the union, so a claim intimated in this
 * session is an ordinary row of the queue it appears in.
 */

import { eventBus } from '../../../domain/events'
import type { DomainEvent } from '../../../domain/events'
import { createIdCounter, nextSystemNo, parseSystemNo } from '../../../domain/ids'
import type { IdCounter } from '../../../domain/ids'
import { CLAIM_STATES, claimMachine } from '../../../domain/workflows'
import type { ClaimContext, ClaimState, ClaimType } from '../../../domain/workflows'
import { DEFAULT_PAGE_SIZE, committed, rejected } from '../../../data/repo'
import type {
  Claim,
  ClaimRepository,
  ClaimTransitionCommand,
  ListQuery,
  MutationResult,
  Page,
  Repositories,
} from '../../../data/repo'

/** Enough to hold every claim on the books; the union is re-queried in memory. */
const SCAN_SIZE = 10_000

export type IntimateClaimCommand = {
  readonly actorId: string
  readonly policyId: string
  readonly customerId: string
  readonly memberId?: string | null
  readonly agentId?: string | null
  readonly claimType: ClaimType
  /** Read off the policy by the screen. The machine, not this module, judges it. */
  readonly policyActive: boolean
  readonly policyStatus: string
  /** §9: blocking a claim notifies the sourcing agent in the same move. */
  readonly agentNotified?: boolean
  readonly now?: Date
}

/** Where one status message went, and whether it went there by reroute. */
export type StatusMessageLogEntry = {
  readonly id: string
  readonly claimId: string
  readonly state: ClaimState
  readonly to: 'customer' | 'agent'
  readonly rerouteLogged: boolean
  readonly at: string
  readonly note: string
}

export type LogStatusMessageCommand = {
  readonly claimId: string
  readonly state: ClaimState
  readonly to: 'customer' | 'agent'
  readonly rerouteLogged: boolean
  readonly note: string
  readonly now?: Date
}

export type ClaimDeskRepository = ClaimRepository & {
  /** Canvas 4.1/4.2 — raise, then intimate or block, in one machine-routed act. */
  intimate(command: IntimateClaimCommand): Promise<MutationResult<Claim>>
  /** FR-11 — records where a status message went. Rendered on the claim. */
  logStatusMessage(command: LogStatusMessageCommand): Promise<StatusMessageLogEntry>
  statusMessages(claimId: string): Promise<readonly StatusMessageLogEntry[]>
}

type Desk = {
  readonly created: Map<string, Claim>
  readonly messages: StatusMessageLogEntry[]
  counter: IdCounter | null
}

const CACHE = new WeakMap<ClaimRepository, ClaimDeskRepository>()

function emptyClaim(id: string, systemNo: string, command: IntimateClaimCommand, at: string): Claim {
  return {
    id,
    systemNo,
    insurerNo: null,
    policyId: command.policyId,
    customerId: command.customerId,
    memberId: command.memberId ?? null,
    claimType: command.claimType,
    // The machine's initial state and nothing else. No caller picks a status.
    state: claimMachine.initial,
    ownerId: null,
    agentId: command.agentId ?? null,
    raisedAt: at,
    intimatedAt: null,
    settlement: { amount: null, deduction: null, source: null, insurerAdviceRef: null },
    companyRemark: null,
    documentIds: [],
    checklistItems: [],
    documentsCollected: [],
  }
}

function contextOf(claim: Claim, command: Partial<ClaimTransitionCommand>): ClaimContext {
  const settlement = command.settlement ?? claim.settlement
  const remark = command.companyRemark ?? claim.companyRemark
  return {
    claimType: claim.claimType,
    ...(command.policyActive === undefined ? {} : { policyActive: command.policyActive }),
    ...(command.policyStatus === undefined ? {} : { policyStatus: command.policyStatus }),
    ...(command.agentNotified === undefined ? {} : { agentNotified: command.agentNotified }),
    settlement: {
      ...(settlement.amount === null ? {} : { amount: settlement.amount }),
      ...(settlement.deduction === null ? {} : { deduction: settlement.deduction }),
      ...(settlement.source === null ? {} : { source: settlement.source }),
      ...(settlement.insurerAdviceRef === null
        ? {}
        : { insurerAdviceRef: settlement.insurerAdviceRef }),
    },
    ...(remark === null || remark === undefined ? {} : { companyRemark: remark }),
    documentsCollected: command.documentsCollected ?? claim.documentsCollected,
    checklistItems: claim.checklistItems,
    ...(command.presentDocTypes === undefined
      ? {}
      : { presentDocTypes: command.presentDocTypes }),
  }
}

/* ----------------------------------------------------------- the local query */

const SEARCHABLE = (row: Claim): string => `${row.systemNo} ${row.insurerNo ?? ''}`

const FILTERS: Readonly<Record<string, (row: Claim) => string>> = {
  state: (row) => row.state,
  claimType: (row) => row.claimType,
  ownerId: (row) => row.ownerId ?? '',
  policyId: (row) => row.policyId,
}

const SORTS: Readonly<Record<string, (row: Claim) => string | number>> = {
  raisedAt: (row) => row.raisedAt,
  systemNo: (row) => row.systemNo,
  state: (row) => row.state,
}

/**
 * The URL's query, run over the union of seeded and session rows.
 *
 * It exists because the union is assembled here rather than in the store, so the
 * repository cannot page it. The shape is the repository's own: named filters,
 * one sort, one page, nothing a URL could not carry.
 */
export function queryClaims(rows: readonly Claim[], query: ListQuery = {}): Page<Claim> {
  const needle = (query.search ?? '').trim().toLowerCase()
  const filters = query.filters ?? {}

  let matched = rows.filter((row) => {
    if (needle !== '' && !SEARCHABLE(row).toLowerCase().includes(needle)) return false
    for (const [key, selected] of Object.entries(filters)) {
      if (selected.length === 0) continue
      const read = FILTERS[key]
      if (!read) {
        throw new Error(
          `Unknown claim filter "${key}". A filter that quietly does nothing is a count nobody can reconcile.`,
        )
      }
      if (!selected.includes(read(row))) return false
    }
    return true
  })

  const sort = query.sort ?? { field: 'raisedAt', direction: 'desc' as const }
  const read = SORTS[sort.field]
  if (!read) {
    throw new Error(`Unknown claim sort field "${sort.field}".`)
  }
  const direction = sort.direction === 'desc' ? -1 : 1
  matched = [...matched].sort((a, b) => {
    const left = read(a)
    const right = read(b)
    if (left === right) return 0
    return (typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right))) * direction
  })

  const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
  const pageCount = Math.ceil(matched.length / pageSize)
  const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
  const start = (page - 1) * pageSize

  return {
    rows: matched.slice(start, start + pageSize),
    total: matched.length,
    page,
    pageSize,
    pageCount,
  }
}

/* ------------------------------------------------------------------- the desk */

export function claimDesk(repositories: Repositories): ClaimDeskRepository {
  const base = repositories.claims
  const existing = CACHE.get(base)
  if (existing) return existing

  const desk: Desk = { created: new Map(), messages: [], counter: null }

  async function allRows(): Promise<readonly Claim[]> {
    const seeded = await base.list({ page: 1, pageSize: SCAN_SIZE })
    return [...desk.created.values(), ...seeded.rows]
  }

  /**
   * The claim sequence, seeded from what is already on the books — the same
   * posture `createMockStore` takes. A claim intimated in this session continues
   * the platform's series rather than starting a second one.
   */
  async function counter(): Promise<IdCounter> {
    if (desk.counter) return desk.counter
    const seeded = await base.list({ page: 1, pageSize: SCAN_SIZE })
    let high = 0
    for (const row of seeded.rows) {
      const parsed = parseSystemNo(row.systemNo)
      if (parsed?.prefix === 'CLM') high = Math.max(high, parsed.sequence)
    }
    desk.counter = createIdCounter({ CLM: high })
    return desk.counter
  }

  const built: ClaimDeskRepository = {
    // Spread rather than nine hand-written forwards, so a method added to
    // `ClaimRepository` reaches the screens without being copied out here.
    ...base,

    async get(id) {
      return desk.created.get(id) ?? (await base.get(id))
    },

    async getMany(ids) {
      const rows = await Promise.all(ids.map((id) => built.get(id)))
      return rows.filter((row): row is Claim => row !== null)
    },

    async bySystemNo(systemNo) {
      const rows = await allRows()
      return rows.find((row) => row.systemNo === systemNo) ?? null
    },

    async forPolicy(policyId) {
      const rows = await allRows()
      return rows.filter((row) => row.policyId === policyId)
    },

    async forCustomer(customerId) {
      const rows = await allRows()
      return rows.filter((row) => row.customerId === customerId)
    },

    async list(query) {
      return queryClaims(await allRows(), query)
    },

    async queue(query) {
      return queryClaims(await allRows(), query)
    },

    async intimate(command) {
      const at = (command.now ?? new Date()).toISOString()
      const target: ClaimState = command.policyActive
        ? CLAIM_STATES.intimated
        : CLAIM_STATES.blocked

      const ctx: ClaimContext = {
        claimType: command.claimType,
        policyActive: command.policyActive,
        policyStatus: command.policyStatus,
        ...(command.agentNotified === undefined ? {} : { agentNotified: command.agentNotified }),
      }

      // Asked before a number is drawn: a refused intimation consumes nothing.
      const verdict = claimMachine.canTransition(claimMachine.initial, target, ctx)
      if (!verdict.ok) return rejected(verdict.reason, verdict.code, verdict.guard)

      const systemNo = nextSystemNo('claim', await counter())
      const id = systemNo.toLowerCase()

      const raised = eventBus.emit('claim.raised', {
        actorId: command.actorId,
        subject: { entity: 'Claim', id },
        detail: { policyId: command.policyId, claimType: command.claimType },
      })

      const outcome = claimMachine.transition(claimMachine.initial, target, ctx, {
        bus: eventBus,
        actorId: command.actorId,
        subject: { entity: 'Claim', id },
        detail: { policyStatus: command.policyStatus },
      })
      if (!outcome.ok) return rejected(outcome.reason, outcome.code, outcome.guard)

      const born = emptyClaim(id, systemNo, command, at)
      const row: Claim = {
        ...born,
        state: outcome.state,
        intimatedAt: outcome.state === CLAIM_STATES.intimated ? at : null,
      }
      desk.created.set(id, row)

      const events: readonly DomainEvent[] = [raised, ...outcome.events]
      return committed(row, events)
    },

    async advance(id, to, command) {
      const own = desk.created.get(id)
      if (!own) return base.advance(id, to, command)

      const outcome = claimMachine.transition(own.state, to, contextOf(own, command), {
        bus: eventBus,
        actorId: command.actorId,
        subject: { entity: 'Claim', id },
      })
      if (!outcome.ok) return rejected(outcome.reason, outcome.code, outcome.guard)

      const updated: Claim = {
        ...own,
        state: outcome.state,
        settlement: command.settlement ?? own.settlement,
        companyRemark: command.companyRemark ?? own.companyRemark,
        documentsCollected: command.documentsCollected ?? own.documentsCollected,
      }
      desk.created.set(id, updated)
      return committed(updated, outcome.events)
    },

    async logStatusMessage(command) {
      const entry: StatusMessageLogEntry = {
        id: `msg-${command.claimId}-${desk.messages.length + 1}`,
        claimId: command.claimId,
        state: command.state,
        to: command.to,
        rerouteLogged: command.rerouteLogged,
        at: (command.now ?? new Date()).toISOString(),
        note: command.note,
      }
      desk.messages.push(entry)
      return entry
    },

    async statusMessages(claimId) {
      return desk.messages.filter((entry) => entry.claimId === claimId)
    },
  }

  CACHE.set(base, built)
  return built
}
