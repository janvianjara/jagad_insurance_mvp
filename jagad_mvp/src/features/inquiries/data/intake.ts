/**
 * Capture — the seam `/inquiries/new` writes through.
 *
 * `InquiryRepository` (plan §7) is read-plus-transitions: it can assign, accept,
 * reassign, escalate and close an inquiry, and it has no `create`. Every fixture
 * inquiry was seeded rather than captured, so nothing in the data layer has
 * needed one until this screen. Rather than reach around the repository, this
 * module wraps it and adds the one method that is missing, keeping the
 * constitution's rule intact: a screen still talks to a repository interface, it
 * still never touches a fixture, and every state change still goes through
 * `inquiryMachine` and comes back as `Committed | Rejected`.
 *
 * Two properties are worth stating because they are what make this safe rather
 * than a second data layer:
 *
 *   - captured rows are the only ones this module owns. Every read merges them
 *     into the repository's answer and every mutation on a repository-owned row
 *     is delegated untouched;
 *   - a captured row's transitions call the same machine with the same context
 *     the adapter builds, so a move refused on a seeded inquiry is refused on a
 *     captured one, with the same sentence.
 *
 * When `create` lands on `InquiryRepository`, this file collapses into a
 * delegate and the screens do not change.
 */

import { eventBus } from '../../../domain/events'
import { RECORD_PREFIXES, formatSystemNo } from '../../../domain/ids'
import { inquiryMachine } from '../../../domain/workflows'
import type { InquiryContext, InquiryState } from '../../../domain/workflows'
import { committed, rejected } from '../../../data/repo'
import type {
  CustomerSource,
  Inquiry,
  InquiryRepository,
  ListQuery,
  MutationResult,
  Page,
  Repositories,
  SortSpec,
} from '../../../data/repo'

/** Big enough to hold the whole in-memory set; the merge needs every match, not a page. */
const SCAN_SIZE = 10_000

export type CaptureInquiryCommand = {
  readonly actorId: string
  /** Canvas 1.6: these two alone are enough. */
  readonly contactName: string
  readonly contactMobile: string
  readonly source: CustomerSource
  readonly categoryId?: string | null
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  readonly contactEmail?: string | null
  readonly notes?: string | null
  readonly productInterest?: readonly string[]
  readonly now?: Date
}

export type IntakeRepository = InquiryRepository & {
  /** Records a new inquiry in `new`, ready for routing. */
  capture(command: CaptureInquiryCommand): Promise<MutationResult<Inquiry>>
}

/* --------------------------------------------------------------- local query */

const SORTS: Readonly<Record<string, (row: Inquiry) => string>> = {
  createdAt: (row) => row.createdAt,
  systemNo: (row) => row.systemNo,
  tatDueAt: (row) => row.tatDueAt ?? '',
}

const FILTERS: Readonly<Record<string, (row: Inquiry) => string>> = {
  status: (row) => row.status,
  source: (row) => row.source,
  categoryId: (row) => row.categoryId ?? '',
  ownerId: (row) => row.ownerId ?? '',
  teamId: (row) => row.teamId ?? '',
  subAgentId: (row) => row.subAgentId ?? '',
}

function matches(row: Inquiry, query: ListQuery): boolean {
  const needle = (query.search ?? '').trim().toLowerCase()
  if (needle !== '') {
    const haystack = [row.contactName, row.contactMobile, row.systemNo].join(' ').toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  for (const [key, selected] of Object.entries(query.filters ?? {})) {
    if (selected.length === 0) continue
    const read = FILTERS[key]
    if (!read) return false
    if (!selected.includes(read(row))) return false
  }
  return true
}

function sortRows(rows: readonly Inquiry[], sort: SortSpec | undefined): readonly Inquiry[] {
  const read = SORTS[sort?.field ?? 'createdAt'] ?? SORTS.createdAt
  const direction = sort?.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => read(a).localeCompare(read(b)) * direction)
}

function paged(rows: readonly Inquiry[], query: ListQuery): Page<Inquiry> {
  const pageSize = Math.max(1, query.pageSize ?? 25)
  const pageCount = Math.ceil(rows.length / pageSize)
  const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
  const start = (page - 1) * pageSize
  return { rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize, pageCount }
}

/* ------------------------------------------------------------- the decorator */

const CACHE = new WeakMap<InquiryRepository, IntakeRepository>()

/**
 * One intake per underlying repository. A screen that re-renders, or a second
 * screen in the same app, must see the same captured rows — and a test that
 * builds its own repositories must not see another test's.
 */
export function inquiryIntake(repositories: Repositories): IntakeRepository {
  const base = repositories.inquiries
  const existing = CACHE.get(base)
  if (existing) return existing

  const created = new Map<string, Inquiry>()
  const built = buildIntake(base, created)
  CACHE.set(base, built)
  return built
}

function buildIntake(base: InquiryRepository, created: Map<string, Inquiry>): IntakeRepository {
  function local(id: string): Inquiry | undefined {
    return created.get(id)
  }

  async function merged(query: ListQuery, keep: (row: Inquiry) => boolean): Promise<Page<Inquiry>> {
    const wide = await base.list({ ...query, page: 1, pageSize: SCAN_SIZE })
    const mine = [...created.values()].filter((row) => keep(row) && matches(row, query))
    const all = sortRows([...wide.rows.filter(keep), ...mine], query.sort)
    return paged(all, query)
  }

  /**
   * A captured row's move, through the machine.
   *
   * Mirrors `src/data/mock/move.ts`: the machine is asked first, a refusal writes
   * nothing and carries its own sentence out, and the row is replaced only after
   * an allow — with the events the transition emitted, so the timeline has them.
   */
  function localMove(
    id: string,
    to: InquiryState,
    ctx: InquiryContext,
    actorId: string,
    detail: Readonly<Record<string, string | number | boolean | null>>,
    apply: (row: Inquiry) => Inquiry,
  ): MutationResult<Inquiry> {
    const row = created.get(id)
    if (!row) return rejected(`No Inquiry exists with id ${id}.`, 'not_found')

    const outcome = inquiryMachine.transition(row.status, to, ctx, {
      actorId,
      subject: { entity: 'Inquiry', id },
      detail,
    })
    if (!outcome.ok) return rejected(outcome.reason, outcome.code, outcome.guard)

    const updated = apply(row)
    created.set(id, updated)
    return committed(updated, outcome.events)
  }

  function contextFor(
    row: Inquiry,
    extra: Partial<Omit<InquiryContext, 'now'>> & { now: Date },
  ): InquiryContext {
    return {
      assignedAt: row.assignedAt ?? undefined,
      categoryGroupId: row.categoryId ?? undefined,
      assignmentHistory: row.assignmentHistory,
      ...extra,
    }
  }

  const intake: IntakeRepository = {
    async list(query = {}) {
      return merged(query, () => true)
    },

    async get(id) {
      return local(id) ?? (await base.get(id))
    },

    async getMany(ids) {
      const mine = ids.map((id) => local(id)).filter((row): row is Inquiry => row !== undefined)
      const rest = await base.getMany(ids.filter((id) => !created.has(id)))
      return [...rest, ...mine]
    },

    async bySystemNo(systemNo) {
      const mine = [...created.values()].find((row) => row.systemNo === systemNo)
      return mine ?? (await base.bySystemNo(systemNo))
    },

    async forOwner(ownerId, query = {}) {
      return merged(query, (row) => row.ownerId === ownerId)
    },

    async unrouted(query = {}) {
      return merged(query, (row) => row.status === 'unrouted')
    },

    async breachingTat(at, query = {}) {
      const cutoff = at.getTime()
      return merged(
        query,
        (row) =>
          row.tatDueAt !== null &&
          new Date(row.tatDueAt).getTime() < cutoff &&
          (row.status === 'assigned' || row.status === 'reassigned'),
      )
    },

    async capture(command) {
      const name = command.contactName.trim()
      const mobile = command.contactMobile.trim()
      if (name === '') {
        return rejected('An inquiry needs a name. It is the only thing the person on the phone always has.', 'invalid_command')
      }
      if (mobile === '') {
        return rejected('An inquiry needs a mobile number. Without one there is nobody to route the inquiry to.', 'invalid_command')
      }

      const now = command.now ?? new Date()
      const sequence = await nextSequence(base, created)
      const id = `inq-${sequence}`

      const row: Inquiry = {
        id,
        systemNo: formatSystemNo(RECORD_PREFIXES.inquiry, sequence),
        status: 'new',
        source: command.source,
        categoryId: command.categoryId ?? null,
        productInterest: command.productInterest ?? [],
        ownerId: null,
        teamId: null,
        agentId: command.agentId ?? null,
        subAgentId: command.subAgentId ?? null,
        assignedAt: null,
        tatDueAt: null,
        assignmentHistory: [],
        escalationLevel: 0,
        createdAt: now.toISOString(),
        customerId: null,
        contactName: name,
        contactMobile: mobile,
        contactEmail: command.contactEmail ?? null,
        notes: command.notes ?? null,
      }

      created.set(id, row)

      // `new` is the machine's initial state, so there is no transition to make.
      // The event still goes out: the routing recipe triggers on it, and a
      // creation nobody can observe is the silent drop §9 keeps warning about.
      const event = eventBus.emit('inquiry.created', {
        actorId: command.actorId,
        subject: { entity: 'Inquiry', id },
        detail: { source: row.source, subAgentId: row.subAgentId },
      })

      return committed(row, [event])
    },

    async assign(id, command) {
      if (!created.has(id)) return base.assign(id, command)
      const row = created.get(id) as Inquiry
      const now = command.now ?? new Date()
      return localMove(
        id,
        'assigned',
        contextFor(row, {
          now,
          tatMinutes: command.tatMinutes,
          nextOwnerId: command.nextOwnerId,
          nextOwnerCategoryGroupId: command.nextOwnerCategoryGroupId,
          routingMatchFound: command.routingMatchFound,
        }),
        command.actorId,
        { assignee: command.nextOwnerId, tatMinutes: command.tatMinutes },
        (current) => ({
          ...current,
          status: 'assigned',
          ownerId: command.nextOwnerId,
          teamId: command.teamId ?? current.teamId,
          assignedAt: now.toISOString(),
          tatDueAt: new Date(now.getTime() + command.tatMinutes * 60_000).toISOString(),
          assignmentHistory: [
            ...current.assignmentHistory,
            {
              assigneeId: command.nextOwnerId,
              assignedAt: now.toISOString(),
              ...(command.reason === undefined ? {} : { reason: command.reason }),
            },
          ],
        }),
      )
    },

    async accept(id, command) {
      if (!created.has(id)) return base.accept(id, command)
      const row = created.get(id) as Inquiry
      return localMove(
        id,
        'accepted',
        contextFor(row, {
          now: command.now ?? new Date(),
          tatMinutes: command.tatMinutes,
          confirmedAt: command.confirmedAt,
        }),
        command.actorId,
        {},
        (current) => ({ ...current, status: 'accepted', tatDueAt: null }),
      )
    },

    async reassign(id, command) {
      if (!created.has(id)) return base.reassign(id, command)
      const row = created.get(id) as Inquiry
      const now = command.now ?? new Date()
      const reason = command.reason ?? 'TAT elapsed without confirmation'
      return localMove(
        id,
        'reassigned',
        contextFor(row, {
          now,
          tatMinutes: command.tatMinutes,
          nextOwnerId: command.nextOwnerId,
          nextOwnerCategoryGroupId: command.nextOwnerCategoryGroupId,
        }),
        command.actorId,
        { assignee: command.nextOwnerId },
        (current) => ({
          ...current,
          status: 'reassigned',
          ownerId: command.nextOwnerId,
          assignedAt: now.toISOString(),
          tatDueAt: new Date(now.getTime() + command.tatMinutes * 60_000).toISOString(),
          assignmentHistory: [
            ...current.assignmentHistory.map((entry, index, all) =>
              index === all.length - 1 && entry.releasedAt === undefined
                ? { ...entry, releasedAt: now.toISOString(), reason }
                : entry,
            ),
            { assigneeId: command.nextOwnerId, assignedAt: now.toISOString() },
          ],
        }),
      )
    },

    async escalate(id, command) {
      if (!created.has(id)) return base.escalate(id, command)
      const row = created.get(id) as Inquiry
      return localMove(
        id,
        'escalated',
        contextFor(row, { now: command.now ?? new Date(), tatMinutes: command.tatMinutes }),
        command.actorId,
        { escalatedTo: command.toUserId, holders: row.assignmentHistory.length },
        (current) => ({
          ...current,
          status: 'escalated',
          ownerId: command.toUserId,
          escalationLevel: current.escalationLevel + 1,
        }),
      )
    },

    async markUnrouted(id, command) {
      if (!created.has(id)) return base.markUnrouted(id, command)
      const row = created.get(id) as Inquiry
      return localMove(
        id,
        'unrouted',
        contextFor(row, {
          now: command.now ?? new Date(),
          routingMatchFound: false,
          adminAlertRaised: command.adminAlertRaised,
        }),
        command.actorId,
        {},
        (current) => ({ ...current, status: 'unrouted', ownerId: null, tatDueAt: null }),
      )
    },

    async convert(id, command) {
      if (!created.has(id)) return base.convert(id, command)
      const row = created.get(id) as Inquiry
      return localMove(
        id,
        'converted',
        contextFor(row, { now: command.now ?? new Date() }),
        command.actorId,
        { quotationId: command.quotationId ?? null },
        (current) => ({ ...current, status: 'converted' }),
      )
    },

    async markLost(id, command) {
      if (!created.has(id)) return base.markLost(id, command)
      const row = created.get(id) as Inquiry
      return localMove(
        id,
        'lost',
        contextFor(row, { now: command.now ?? new Date(), lostReason: command.lostReason }),
        command.actorId,
        { lostReason: command.lostReason ?? null },
        (current) => ({ ...current, status: 'lost' }),
      )
    },
  }

  return intake
}

/** Continues the platform's own numbering rather than starting a second series. */
async function nextSequence(
  base: InquiryRepository,
  created: Map<string, Inquiry>,
): Promise<number> {
  const page = await base.list({ page: 1, pageSize: SCAN_SIZE })
  const numbers = [...page.rows, ...created.values()]
    .map((row) => Number(row.systemNo.split('-').pop()))
    .filter((value) => Number.isFinite(value))
  return Math.max(0, ...numbers) + 1
}
