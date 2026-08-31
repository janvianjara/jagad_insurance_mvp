/**
 * The renewals desk — the moves `RenewalRepository` does not carry.
 *
 * Plan §7 gives the repository the pull queue and `assign`, which is the one
 * move the pool screen needed before P2. §9's machine has five more, and the
 * renewal detail screen needs every one of them: pooling on the lead date,
 * reminding (repeatedly), renewing, lapsing, and moving a lapse onto the
 * win-back list.
 *
 * All six go through `renewalTaskMachine`. This module supplies no rule of its
 * own — it hands the machine the record's state and the facts the guards ask
 * for, and a refusal comes back as the machine's own sentence with nothing
 * written. `assign` is not reimplemented: it already exists on the repository
 * and is delegated, so a renewal taken from the pool is written once, in one
 * place.
 *
 * The lead time is never defaulted here. §9: "the lead is a configuration
 * parameter and this module holds no default" — the caller reads it off the
 * `renewal.schedule` recipe and passes it in.
 */

import { eventBus } from '../../../domain/events'
import { RENEWAL_STATES, renewalTaskMachine } from '../../../domain/workflows'
import type {
  BackdatingRecord,
  RenewalContext,
  RenewalReminder,
  RenewalState,
  RenewedTerm,
} from '../../../domain/workflows'
import { DEFAULT_PAGE_SIZE, committed, notFound, rejected } from '../../../data/repo'
import type {
  ListQuery,
  MutationResult,
  Page,
  RenewalRepository,
  RenewalTask,
  Repositories,
} from '../../../data/repo'

const SCAN_SIZE = 10_000

type BaseCommand = {
  readonly actorId: string
  readonly now?: Date
}

/** §9: the lead is configuration. It is required here and defaulted nowhere. */
export type PoolRenewalCommand = BaseCommand & { readonly leadDays: number }

export type RemindRenewalCommand = BaseCommand & {
  /** Year-wise amounts and offers. The machine refuses a bare "you expire soon". */
  readonly reminder: RenewalReminder
}

export type RenewCommand = BaseCommand & {
  readonly renewedTerm: RenewedTerm
  /** Permitted, and logged in full or refused. §9 asks for all four fields. */
  readonly backdating?: BackdatingRecord
}

export type LapseCommand = BaseCommand & { readonly lapseReason: string }

export type RenewalDeskRepository = RenewalRepository & {
  /** Every renewal task, seeded rows with this session's moves applied. */
  all(): Promise<readonly RenewalTask[]>
  toPool(id: string, command: PoolRenewalCommand): Promise<MutationResult<RenewalTask>>
  remind(id: string, command: RemindRenewalCommand): Promise<MutationResult<RenewalTask>>
  renew(id: string, command: RenewCommand): Promise<MutationResult<RenewalTask>>
  lapse(id: string, command: LapseCommand): Promise<MutationResult<RenewalTask>>
  winBack(id: string, command: BaseCommand): Promise<MutationResult<RenewalTask>>
}

const CACHE = new WeakMap<RenewalRepository, RenewalDeskRepository>()

/* ----------------------------------------------------------- the local query */

const FILTERS: Readonly<Record<string, (row: RenewalTask) => string>> = {
  state: (row) => row.state,
  assigneeId: (row) => row.assigneeId ?? '',
}

const SORTS: Readonly<Record<string, (row: RenewalTask) => string>> = {
  dueOn: (row) => row.dueOn,
  expiryDate: (row) => row.expiryDate,
}

/**
 * The URL's query, run over the merged rows.
 *
 * It exists because a row this session moved is held here rather than in the
 * store, so the repository can no longer page the set correctly. The shape is
 * the repository's own — named filters, one sort, one page — and an undeclared
 * filter throws rather than quietly matching everything.
 */
export function queryRenewals(
  rows: readonly RenewalTask[],
  query: ListQuery = {},
): Page<RenewalTask> {
  const needle = (query.search ?? '').trim().toLowerCase()
  const filters = query.filters ?? {}

  let matched = rows.filter((row) => {
    if (needle !== '' && !row.policyId.toLowerCase().includes(needle)) return false
    for (const [key, selected] of Object.entries(filters)) {
      if (selected.length === 0) continue
      const read = FILTERS[key]
      if (!read) {
        throw new Error(
          `Unknown renewal filter "${key}". A filter that quietly does nothing is a count nobody can reconcile.`,
        )
      }
      if (!selected.includes(read(row))) return false
    }
    return true
  })

  const sort = query.sort ?? { field: 'dueOn', direction: 'asc' as const }
  const read = SORTS[sort.field]
  if (!read) throw new Error(`Unknown renewal sort field "${sort.field}".`)
  const direction = sort.direction === 'desc' ? -1 : 1
  matched = [...matched].sort((a, b) => read(a).localeCompare(read(b)) * direction)

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

/* -------------------------------------------------------------------- the desk */

export function renewalDesk(repositories: Repositories): RenewalDeskRepository {
  const base = repositories.renewals
  const existing = CACHE.get(base)
  if (existing) return existing

  /** Rows this session has moved. Merged over the seeded ones on every read. */
  const moved = new Map<string, RenewalTask>()

  async function allRows(): Promise<readonly RenewalTask[]> {
    const seeded = await base.list({ page: 1, pageSize: SCAN_SIZE })
    return seeded.rows.map((row) => moved.get(row.id) ?? row)
  }

  async function read(id: string): Promise<RenewalTask | null> {
    return moved.get(id) ?? (await base.get(id))
  }

  /**
   * One machine-routed move. The state comes off the record, the target is named
   * by the caller, and the guards decide. A refusal writes nothing and emits
   * nothing — the same posture `<ConfirmGate>` takes in the UI.
   */
  async function move(
    id: string,
    to: RenewalState,
    ctx: RenewalContext,
    actorId: string,
    apply: (row: RenewalTask) => RenewalTask,
    detail?: Readonly<Record<string, string | number | boolean | null>>,
  ): Promise<MutationResult<RenewalTask>> {
    const row = await read(id)
    if (!row) return notFound('RenewalTask', id)

    const outcome = renewalTaskMachine.transition(row.state, to, ctx, {
      bus: eventBus,
      actorId,
      subject: { entity: 'RenewalTask', id },
      ...(detail === undefined ? {} : { detail }),
    })
    if (!outcome.ok) return rejected(outcome.reason, outcome.code, outcome.guard)

    const updated = apply(row)
    moved.set(id, updated)
    return committed(updated, outcome.events)
  }

  function contextOf(row: RenewalTask, now: Date, extra: Partial<RenewalContext>): RenewalContext {
    return {
      now,
      expiryDate: row.expiryDate,
      ...(row.assigneeId === null ? {} : { assigneeId: row.assigneeId }),
      remindersSent: row.remindersSent,
      ...extra,
    }
  }

  const built: RenewalDeskRepository = {
    // Spread rather than six hand-written forwards, so a method added to
    // `RenewalRepository` reaches the screens without being copied out here.
    ...base,

    async get(id) {
      return read(id)
    },

    async getMany(ids) {
      const rows = await Promise.all(ids.map((id) => read(id)))
      return rows.filter((row): row is RenewalTask => row !== null)
    },

    async forPolicy(policyId) {
      const rows = await allRows()
      return rows.find((row) => row.policyId === policyId) ?? null
    },

    async list(query) {
      return queryRenewals(await allRows(), query)
    },

    async pool(query) {
      const rows = await allRows()
      return queryRenewals(
        rows.filter((row) => row.state === RENEWAL_STATES.inPool),
        query,
      )
    },

    async all() {
      return allRows()
    },

    async assign(id, command) {
      const own = moved.get(id)
      if (!own) return base.assign(id, command)

      const now = command.now ?? new Date()
      return move(
        id,
        RENEWAL_STATES.assigned,
        contextOf(own, now, {
          leadDays: command.leadDays,
          assigneeId: command.assigneeId,
          selfAssigned: command.selfAssigned,
        }),
        command.actorId,
        (row) => ({ ...row, state: RENEWAL_STATES.assigned, assigneeId: command.assigneeId }),
        { assigneeId: command.assigneeId, selfAssigned: command.selfAssigned },
      )
    },

    async toPool(id, command) {
      const row = await read(id)
      if (!row) return notFound('RenewalTask', id)
      const now = command.now ?? new Date()
      return move(
        id,
        RENEWAL_STATES.inPool,
        contextOf(row, now, { leadDays: command.leadDays }),
        command.actorId,
        (current) => ({ ...current, state: RENEWAL_STATES.inPool }),
        { leadDays: command.leadDays },
      )
    },

    async remind(id, command) {
      const row = await read(id)
      if (!row) return notFound('RenewalTask', id)
      const now = command.now ?? new Date()
      return move(
        id,
        RENEWAL_STATES.reminded,
        contextOf(row, now, { reminder: command.reminder }),
        command.actorId,
        (current) => ({
          ...current,
          state: RENEWAL_STATES.reminded,
          remindersSent: current.remindersSent + 1,
          lastReminderAt: now.toISOString(),
        }),
        { years: command.reminder.yearWiseAmounts.length, offers: command.reminder.offers.length },
      )
    },

    async renew(id, command) {
      const row = await read(id)
      if (!row) return notFound('RenewalTask', id)
      const now = command.now ?? new Date()
      return move(
        id,
        RENEWAL_STATES.renewed,
        contextOf(row, now, {
          renewedTerm: command.renewedTerm,
          ...(command.backdating === undefined ? {} : { backdating: command.backdating }),
        }),
        command.actorId,
        (current) => ({ ...current, state: RENEWAL_STATES.renewed }),
        {
          startDate: command.renewedTerm.startDate,
          endDate: command.renewedTerm.endDate,
          documentVersion: command.renewedTerm.documentVersion,
          backdated: command.backdating !== undefined,
        },
      )
    },

    async lapse(id, command) {
      const row = await read(id)
      if (!row) return notFound('RenewalTask', id)
      const now = command.now ?? new Date()
      return move(
        id,
        RENEWAL_STATES.lapsed,
        contextOf(row, now, { lapseReason: command.lapseReason }),
        command.actorId,
        (current) => ({
          ...current,
          state: RENEWAL_STATES.lapsed,
          lapseReason: command.lapseReason,
        }),
        { lapseReason: command.lapseReason },
      )
    },

    async winBack(id, command) {
      const row = await read(id)
      if (!row) return notFound('RenewalTask', id)
      const now = command.now ?? new Date()
      return move(
        id,
        RENEWAL_STATES.winBackList,
        contextOf(row, now, {}),
        command.actorId,
        (current) => ({ ...current, state: RENEWAL_STATES.winBackList }),
      )
    },
  }

  CACHE.set(base, built)
  return built
}
