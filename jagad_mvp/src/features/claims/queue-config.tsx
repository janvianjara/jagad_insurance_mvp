/**
 * The claim queue, as configuration (plan §5, "Claim queue + detail"; §6).
 *
 * Not a table. `<WorkQueue>` was built once and every list screen after it is an
 * object of this shape, so the filter bar, the stripe, the selection bar and the
 * keyboard model are the same here as in the inquiry queue.
 *
 * Two decisions worth reading:
 *
 *   The pin is a rank, not a second query. Canvas flow 4 opens on work nobody
 *   owns — a blocked claim and an insurer query are the two things that go stale
 *   fastest — so the queue's default order ranks the rows the URL already asked
 *   for. Sorting by anything else replaces it, visibly and reversibly.
 *
 *   Push-to-team is a bulk action, and it is routing rather than a field write.
 *   §9 is explicit that the claims team owns a picked-up claim while the sales
 *   agent is informed and is not the owner, so the preview inside `<ConfirmGate>`
 *   names both parties before anything is written.
 */

import { DEFAULT_PAGE_SIZE } from '../../data/repo'
import type { Claim, Customer, ListQuery, StaffUser } from '../../data/repo'
import type { QueueBulkAction, QueueConfig } from '../../components/WorkQueue'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { RecordId, RelativeTime } from '../../ui/type'
import { CLAIM_LABEL, CLAIM_TONE, CLAIM_TYPE_LABEL, claimPinRank, claimSeverity } from './claim-view'
import type { ClaimDeskRepository } from './data/claim-desk'
import styles from './ClaimQueue.module.css'

/** The queue's own ordering. It is not a field the repository can sort by. */
const PINNED_SORT_FIELD = 'pinned'
/** The pin pass needs every matching row, not one page of them. */
const SCAN_SIZE = 10_000

export type ClaimQueueDeps = {
  readonly desk: ClaimDeskRepository
  readonly customers: readonly Customer[]
  readonly users: readonly StaffUser[]
  readonly now: Date
  readonly actorId: string
  /** False hides pickup entirely rather than offering a control that refuses. */
  readonly canPickUp: boolean
}

export function nameOfUser(users: readonly StaffUser[], id: string | null): string {
  if (id === null) return 'Unassigned'
  return users.find((user) => user.id === id)?.name ?? id
}

export function nameOfCustomer(customers: readonly Customer[], id: string): string {
  return customers.find((customer) => customer.id === id)?.fullName ?? id
}

const column = dataTableColumns<Claim>()

export function claimQueueConfig(deps: ClaimQueueDeps): QueueConfig<Claim> {
  const { desk, customers, users, now, actorId, canPickUp } = deps

  const columns = column.columns([
    column.accessor((row) => claimPinRank(row), {
      id: PINNED_SORT_FIELD,
      header: 'Pin',
      cell: ({ row }) =>
        claimPinRank(row.original) < 4 ? (
          <Badge tone="attn" caps>
            Pinned
          </Badge>
        ) : (
          <span className={styles.quiet}>—</span>
        ),
    }),
    column.accessor('systemNo', {
      header: 'Claim no.',
      cell: ({ row }) => (
        <RecordId systemNo={row.original.systemNo} insurerNo={row.original.insurerNo} />
      ),
    }),
    column.accessor('customerId', {
      header: 'Customer',
      enableSorting: false,
      cell: ({ row }) => nameOfCustomer(customers, row.original.customerId),
    }),
    column.accessor('claimType', {
      header: 'Type',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge tone="neutral" caps>
          {CLAIM_TYPE_LABEL[row.original.claimType]}
        </Badge>
      ),
    }),
    column.accessor('state', {
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill tone={CLAIM_TONE[row.original.state]}>
          {CLAIM_LABEL[row.original.state]}
        </StatusPill>
      ),
    }),
    column.accessor('ownerId', {
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={row.original.ownerId === null ? styles.quiet : undefined}>
          {nameOfUser(users, row.original.ownerId)}
        </span>
      ),
    }),
    column.accessor('raisedAt', {
      header: 'Raised',
      cell: ({ row }) => <RelativeTime value={row.original.raisedAt} now={now} />,
    }),
  ])

  /**
   * Canvas 4.3 — "Claims member picks up. Ownership transfers; sales agent
   * informed, not owner." One machine move per row, and a row the machine
   * refuses comes back with its own sentence rather than as a silent skip.
   */
  const pickUp: QueueBulkAction<Claim> = {
    key: 'pickup',
    label: 'Pick up',
    icon: 'users',
    variant: 'primary',
    confirmLabel: 'Pick up and notify',
    confirmTitle: (selection) =>
      `Pick up ${selection.ids.length} ${selection.ids.length === 1 ? 'claim' : 'claims'}`,
    preview: (selection) =>
      selection.rows.map((row) => ({
        key: row.id,
        label: row.systemNo,
        from: nameOfUser(users, row.ownerId),
        to: `${nameOfUser(users, actorId)} · claims team`,
      })),
    note: () =>
      'The claims team owns the file from here. The sourcing agent is informed of the handover and is not made the owner — ownership and interest are different things, and conflating them is how a claim ends up with nobody working it.',
    run: async (selection) => {
      const refusals: string[] = []
      let moved = 0

      for (const row of selection.rows) {
        const outcome = await desk.advance(row.id, 'picked_up', { actorId, now })
        if (!outcome.ok) refusals.push(`${row.systemNo}: ${outcome.reason}`)
        else moved += 1
      }

      // The machine's own sentence, unedited.
      if (refusals.length > 0) return { ok: false, message: refusals[0] }
      return {
        ok: true,
        message: `${moved} ${moved === 1 ? 'claim' : 'claims'} picked up. The sourcing agent has been informed.`,
      }
    },
  }

  return {
    key: 'claims',
    title: 'Claims',
    noun: 'claim',
    nounPlural: 'claims',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'state',
        label: 'Status',
        options: Object.entries(CLAIM_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'claimType',
        label: 'Type',
        options: Object.entries(CLAIM_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'ownerId',
        label: 'Owner',
        options: users
          .filter((user) => user.active)
          .map((user) => ({ value: user.id, label: user.name })),
      },
    ],
    sortable: [PINNED_SORT_FIELD, 'raisedAt', 'systemNo', 'state'],
    defaultSort: { field: PINNED_SORT_FIELD, direction: 'asc' },
    searchPlaceholder: 'Claim or insurer number',
    stripeMapping: (row) => claimSeverity(row),
    ...(canPickUp ? { bulkActions: [pickUp] } : {}),
    load: (query: ListQuery) => loadClaims(desk, query),
    empty: {
      title: 'No claims are open',
      explanation:
        'A claim arrives from the customer panel, from a call or from the agent, and lands here the moment it is raised. Intimate one with New claim; the platform checks the policy is in force before it goes to the insurer.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/claims/${row.id}`,
  }
}

/**
 * Reads the page the URL asked for.
 *
 * The repository has no "pinned" sort to ask for, so in the queue's default
 * order this asks for the whole matched set, ranks it, and cuts the page itself.
 * Any other sort is the repository's own and passes straight through.
 * `Array.prototype.sort` is stable, which keeps newest-first inside each rank.
 */
export async function loadClaims(desk: ClaimDeskRepository, query: ListQuery) {
  if (query.sort && query.sort.field !== PINNED_SORT_FIELD) return desk.queue(query)

  const wide = await desk.queue({
    ...query,
    sort: { field: 'raisedAt', direction: 'desc' },
    page: 1,
    pageSize: SCAN_SIZE,
  })
  const ordered = [...wide.rows].sort((a, b) => claimPinRank(a) - claimPinRank(b))

  const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
  const pageCount = Math.ceil(ordered.length / pageSize)
  const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
  const start = (page - 1) * pageSize

  return {
    rows: ordered.slice(start, start + pageSize),
    total: ordered.length,
    page,
    pageSize,
    pageCount,
  }
}
