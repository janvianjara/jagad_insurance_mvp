/**
 * The renewals desk, as configuration (plan §5 "Renewal pool", §4
 * `/renewals` and `/renewals/instalments`; §6).
 *
 * Two configured queues over one row type, because §9 asks for exactly that:
 *
 *   `renewalPoolConfig` is the pull pool, and it carries BOTH kinds of due item.
 *   The first column is the kind, spelled out — "Renewal, the policy term ends"
 *   against "Instalment due, the policy is in force" — and the "Ends" column
 *   says so again on the row itself. An instalment due date is not a renewal
 *   date, and this queue is where somebody would otherwise confuse them.
 *
 *   `instalmentQueueConfig` is the same rows narrowed to instalments, for the
 *   D-A screen: what is due, what is inside grace, and how long grace runs for
 *   THIS schedule's mode.
 *
 *   Self-assign is a bulk action and it is a pull, never a push. §9's guard
 *   refuses an assignment that was not taken by the person who will work it, so
 *   the action assigns to the signed-in user and to nobody else.
 */

import type { ListQuery, StaffUser } from '../../data/repo'
import type { QueueBulkAction, QueueConfig } from '../../components/WorkQueue'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { DateTime, Money } from '../../ui/type'
import {
  INSTALMENT_LABEL,
  MODE_LABEL,
  POOL_KINDS,
  POOL_KIND_LABEL,
  POOL_KIND_MEANING,
  POOL_KIND_TONE,
  RENEWAL_LABEL,
  poolSeverity,
} from './renewal-view'
import type { PoolRow } from './renewal-view'
import { onlyKind, queryPool } from './pool-source'
import type { RenewalDeskRepository } from './data/renewal-desk'
import styles from './RenewalPool.module.css'

export type RenewalQueueDeps = {
  readonly desk: RenewalDeskRepository
  /** Every open item on the desk, both kinds. Loaded once by the screen. */
  readonly rows: readonly PoolRow[]
  readonly users: readonly StaffUser[]
  readonly now: Date
  readonly actorId: string
  /** §9: the lead is a configuration parameter and this module holds no default. */
  readonly leadDays: number
  readonly canWork: boolean
}

const column = dataTableColumns<PoolRow>()

/** The column that keeps the two clocks apart. It is first, and it is never dropped. */
function kindColumn() {
  return column.accessor('kind', {
    header: 'Kind',
    cell: ({ row }) => (
      <span className={styles.kind} data-kind={row.original.kind}>
        <Badge tone={POOL_KIND_TONE[row.original.kind]} caps>
          {POOL_KIND_LABEL[row.original.kind]}
        </Badge>
        <span className={styles.kindMeaning}>{POOL_KIND_MEANING[row.original.kind]}</span>
      </span>
    ),
  })
}

function customerColumn() {
  return column.accessor('customerName', {
    header: 'Customer',
    cell: ({ row }) => row.original.customerName,
  })
}

function policyColumn() {
  return column.accessor('policyNo', {
    header: 'Policy',
    cell: ({ row }) => <span className={styles.mono}>{row.original.policyNo}</span>,
  })
}

function stateColumn() {
  return column.accessor('state', {
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => (
      <StatusPill tone={row.original.stateTone}>{row.original.stateLabel}</StatusPill>
    ),
  })
}

function dueColumn(header: string) {
  return column.accessor('dueOn', {
    header,
    cell: ({ row }) => <DateTime value={row.original.dueOn} mode="date" />,
  })
}

export function renewalPoolConfig(deps: RenewalQueueDeps): QueueConfig<PoolRow> {
  const { desk, rows, users, now, actorId, leadDays, canWork } = deps

  const columns = column.columns([
    kindColumn(),
    customerColumn(),
    policyColumn(),
    dueColumn('Due'),
    /**
     * The line that answers "is this policy expiring?" on the row itself. A
     * renewal row names the end of the term; an instalment row says the term is
     * still running and names its end date so the difference is legible rather
     * than inferred.
     */
    column.accessor('policyEndsOn', {
      header: 'Term',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.kind === POOL_KINDS.renewal ? (
          <span className={styles.expiring}>
            Expires <DateTime value={row.original.policyEndsOn ?? row.original.dueOn} mode="date" />
          </span>
        ) : (
          <span className={styles.inForce}>
            In force
            {row.original.policyEndsOn === null ? null : (
              <>
                {' to '}
                <DateTime value={row.original.policyEndsOn} mode="date" />
              </>
            )}
            {' — not expiring'}
          </span>
        ),
    }),
    column.accessor('amount', {
      header: 'Instalment',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.amount === null ? (
          <span className={styles.quiet}>—</span>
        ) : (
          <Money paise={row.original.amount.paise} />
        ),
    }),
    stateColumn(),
    column.accessor('assigneeId', {
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.assigneeId === null ? (
          <span className={styles.quiet}>
            {row.original.kind === POOL_KINDS.renewal ? 'In the pool' : 'No owner — a payment'}
          </span>
        ) : (
          (users.find((user) => user.id === row.original.assigneeId)?.name ??
          row.original.assigneeId)
        ),
    }),
  ])

  /**
   * Canvas 5.2 — "Member self-assigns. Ownership recorded." §9's guard refuses an
   * assignment that was pushed, so this action can only ever assign to the person
   * pressing it, and an instalment row is refused with a sentence rather than
   * silently skipped: an instalment has no owner because it is not a task.
   */
  const takeFromPool: QueueBulkAction<PoolRow> = {
    key: 'self-assign',
    label: 'Take from the pool',
    icon: 'users',
    variant: 'primary',
    confirmLabel: 'Take and own',
    confirmTitle: (selection) =>
      `Take ${selection.ids.length} ${selection.ids.length === 1 ? 'renewal' : 'renewals'} from the pool`,
    preview: (selection) =>
      selection.rows.map((row) => ({
        key: row.id,
        label: `${row.policyNo} · ${row.customerName}`,
        from: POOL_KIND_LABEL[row.kind],
        to:
          row.kind === POOL_KINDS.renewal
            ? `Owned by ${users.find((user) => user.id === actorId)?.name ?? actorId}`
            : 'Not a renewal task — nothing to take',
      })),
    note: () =>
      'Renewals are taken from the pool by the person who will work them; whoever completes it, owns it. An instalment due is not a task and cannot be taken — the policy it belongs to is in force.',
    run: async (selection) => {
      const refusals: string[] = []
      let taken = 0

      for (const row of selection.rows) {
        if (row.kind !== POOL_KINDS.renewal) {
          refusals.push(
            `${row.policyNo}: that is an instalment falling due inside a running term, not a renewal task. There is nothing to take from the pool.`,
          )
          continue
        }
        const outcome = await desk.assign(row.id, {
          actorId,
          assigneeId: actorId,
          selfAssigned: true,
          leadDays,
          now,
        })
        if (!outcome.ok) refusals.push(`${row.policyNo}: ${outcome.reason}`)
        else taken += 1
      }

      // The machine's own sentence, unedited.
      if (refusals.length > 0) return { ok: false, message: refusals[0] }
      return {
        ok: true,
        message: `${taken} ${taken === 1 ? 'renewal' : 'renewals'} taken. Ownership is recorded.`,
      }
    },
  }

  return {
    key: 'renewals',
    title: 'Renewals',
    noun: 'due item',
    nounPlural: 'due items',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'kind',
        label: 'Kind',
        anyLabel: 'Renewals and instalments',
        options: [
          { value: POOL_KINDS.renewal, label: 'Renewal — the term ends' },
          { value: POOL_KINDS.instalment, label: 'Instalment due — in force' },
        ],
      },
      {
        key: 'state',
        label: 'Status',
        options: [
          ...Object.entries(RENEWAL_LABEL).map(([value, label]) => ({ value, label })),
          ...Object.entries(INSTALMENT_LABEL).map(([value, label]) => ({
            value,
            label: `${label} (instalment)`,
          })),
        ],
      },
      {
        key: 'assigneeId',
        label: 'Owner',
        options: users
          .filter((user) => user.active)
          .map((user) => ({ value: user.id, label: user.name })),
      },
    ],
    sortable: ['dueOn', 'kind', 'customerName', 'policyNo'],
    defaultSort: { field: 'dueOn', direction: 'asc' },
    searchPlaceholder: 'Policy number or customer',
    stripeMapping: (row) => poolSeverity(row, now),
    ...(canWork ? { bulkActions: [takeFromPool] } : {}),
    load: (query: ListQuery) => Promise.resolve(queryPool(rows, query)),
    empty: {
      title: 'Nothing is due on the renewals desk',
      explanation:
        'Renewal tasks appear here a set number of days before a policy expires, and instalments appear here on the day they fall due. The two are different kinds of item and the queue keeps them apart: an instalment means a policy is in force, never that it is expiring.',
    },
    rowTarget: 'route',
    rowHref: (row) => row.href,
  }
}

/**
 * The instalments view — plan §4 `/renewals/instalments`, D-A. Dues, failed
 * mandates and anything inside grace, with the grace window stated per row
 * because it comes from the schedule's mode rather than from a constant.
 */
export function instalmentQueueConfig(deps: RenewalQueueDeps): QueueConfig<PoolRow> {
  const { rows, now } = deps
  const instalments = onlyKind(rows, POOL_KINDS.instalment)

  const columns = column.columns([
    customerColumn(),
    policyColumn(),
    dueColumn('Falls due'),
    column.accessor('mode', {
      header: 'Mode',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge tone="neutral" caps>
          {row.original.mode === null ? 'unknown' : MODE_LABEL[row.original.mode]}
        </Badge>
      ),
    }),
    column.accessor('amount', {
      header: 'Amount',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.amount === null ? (
          <span className={styles.quiet}>not recorded</span>
        ) : (
          <Money paise={row.original.amount.paise} />
        ),
    }),
    column.accessor('graceDays', {
      header: 'Grace',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.graceDays === null ? (
          <span className={styles.quiet}>—</span>
        ) : (
          <span className={styles.grace}>
            {row.original.graceDays} days, from the{' '}
            {row.original.mode === null ? 'schedule' : MODE_LABEL[row.original.mode].toLowerCase()}{' '}
            schedule
          </span>
        ),
    }),
    column.accessor('graceEndsOn', {
      header: 'Grace closes',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.graceEndsOn === null ? (
          <span className={styles.quiet}>—</span>
        ) : (
          <DateTime value={row.original.graceEndsOn} mode="date" />
        ),
    }),
    stateColumn(),
  ])

  return {
    key: 'instalments',
    title: 'Instalments due',
    noun: 'instalment',
    nounPlural: 'instalments',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'state',
        label: 'Status',
        options: Object.entries(INSTALMENT_LABEL).map(([value, label]) => ({ value, label })),
      },
    ],
    sortable: ['dueOn', 'customerName', 'policyNo'],
    defaultSort: { field: 'dueOn', direction: 'asc' },
    searchPlaceholder: 'Policy number or customer',
    stripeMapping: (row) => poolSeverity(row, now),
    load: (query: ListQuery) => Promise.resolve(queryPool(instalments, query)),
    empty: {
      title: 'No instalment is due or inside grace',
      explanation:
        'A policy paid in instalments shows here on the day each one falls due, and stays until it is paid or its grace window closes. Nothing here is a renewal: every policy on this list is in force.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/policies/${row.policyId}`,
  }
}
