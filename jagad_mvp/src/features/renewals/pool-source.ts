/**
 * Where the renewals desk gets its rows.
 *
 * Two clocks, two entities, one queue (§9, D-A). A renewal task is raised
 * against a policy's expiry; an instalment falls due inside a term that has not
 * ended. No single repository read returns both, and merging them behind one
 * nullable row type would be how "a policy with a due instalment is in force and
 * not expiring" quietly stops being visible — so the merge happens here, into a
 * row that carries `kind` and keeps the two apart everywhere downstream.
 *
 * Nothing in this file computes money or grace. An instalment's amount is the
 * figure the insurer's schedule was typed with, and its grace window is the
 * schedule's `graceDays`, which is set per mode. Both are read, not worked out.
 */

import { DEFAULT_PAGE_SIZE } from '../../data/repo'
import type {
  Customer,
  InstalmentDue,
  ListQuery,
  Page,
  Policy,
  PremiumSchedule,
  Repositories,
} from '../../data/repo'
import { OPEN_INSTALMENT_STATES, instalmentRow, renewalRow } from './renewal-view'
import type { PoolKind, PoolRow } from './renewal-view'
import type { RenewalDeskRepository } from './data/renewal-desk'

/** Wide enough that no fixture or captured row falls outside it. */
const ALL_TIME = { from: '1900-01-01', to: '2999-12-31' } as const

export type PoolSource = {
  readonly rows: readonly PoolRow[]
  readonly policies: readonly Policy[]
  readonly customers: readonly Customer[]
  readonly schedules: readonly PremiumSchedule[]
  readonly instalments: readonly InstalmentDue[]
}

function nameOf(customers: readonly Customer[], id: string): string {
  return customers.find((customer) => customer.id === id)?.fullName ?? id
}

function policyOf(policies: readonly Policy[], id: string): Policy | undefined {
  return policies.find((policy) => policy.id === id)
}

/**
 * Every open item on the renewals desk, both kinds.
 *
 * Instalments that are paid, paid in grace or not yet due are not work, so they
 * are not rows — the queue is what somebody has to act on, and a total that
 * counts settled instalments is a number nobody can reconcile.
 */
export async function loadPoolSource(
  repositories: Repositories,
  desk: RenewalDeskRepository,
): Promise<PoolSource> {
  const tasks = await desk.all()
  const dueInstalments = (
    await repositories.schedules.dueBetween(ALL_TIME.from, ALL_TIME.to)
  ).filter((instalment) => OPEN_INSTALMENT_STATES.includes(instalment.state))

  const policyIds = [
    ...new Set([...tasks.map((task) => task.policyId), ...dueInstalments.map((row) => row.policyId)]),
  ]
  const policies = await repositories.policies.getMany(policyIds)

  const schedules = (
    await Promise.all(policyIds.map((policyId) => repositories.schedules.forPolicy(policyId)))
  ).filter((schedule): schedule is PremiumSchedule => schedule !== null)

  const customerIds = [
    ...new Set([
      ...tasks.map((task) => task.customerId),
      ...policies.map((policy) => policy.customerId),
    ]),
  ]
  const customers = await repositories.customers.getMany(customerIds)

  const renewalRows = tasks.map((task) => {
    const policy = policyOf(policies, task.policyId)
    return renewalRow({
      task,
      policyNo: policy?.systemNo ?? task.policyId,
      customerName: nameOf(customers, task.customerId),
      policyEndsOn: policy?.expiryDate ?? task.expiryDate,
    })
  })

  const instalmentRows = dueInstalments.flatMap((instalment) => {
    const schedule = schedules.find((row) => row.id === instalment.scheduleId)
    // A schedule that has gone is a data fault, not a row to invent one for.
    if (!schedule) return []
    const policy = policyOf(policies, instalment.policyId)
    return [
      instalmentRow({
        instalment,
        schedule,
        policyNo: policy?.systemNo ?? instalment.policyId,
        customerId: policy?.customerId ?? instalment.policyId,
        customerName: policy ? nameOf(customers, policy.customerId) : instalment.policyId,
        policyEndsOn: policy?.expiryDate ?? null,
      }),
    ]
  })

  return {
    rows: [...renewalRows, ...instalmentRows],
    policies,
    customers,
    schedules,
    instalments: dueInstalments,
  }
}

/* ------------------------------------------------------------- the local query */

const FILTERS: Readonly<Record<string, (row: PoolRow) => string>> = {
  kind: (row) => row.kind,
  state: (row) => row.state,
  assigneeId: (row) => row.assigneeId ?? '',
}

const SORTS: Readonly<Record<string, (row: PoolRow) => string>> = {
  dueOn: (row) => row.dueOn,
  kind: (row) => row.kind,
  customerName: (row) => row.customerName,
  policyNo: (row) => row.policyNo,
}

/** The URL's own query, run over the merged rows. */
export function queryPool(rows: readonly PoolRow[], query: ListQuery = {}): Page<PoolRow> {
  const needle = (query.search ?? '').trim().toLowerCase()
  const filters = query.filters ?? {}

  let matched = rows.filter((row) => {
    if (
      needle !== '' &&
      !`${row.policyNo} ${row.customerName}`.toLowerCase().includes(needle)
    ) {
      return false
    }
    for (const [key, selected] of Object.entries(filters)) {
      if (selected.length === 0) continue
      const read = FILTERS[key]
      if (!read) {
        throw new Error(
          `Unknown renewals filter "${key}". A filter that quietly does nothing is a count nobody can reconcile.`,
        )
      }
      if (!selected.includes(read(row))) return false
    }
    return true
  })

  const sort = query.sort ?? { field: 'dueOn', direction: 'asc' as const }
  const read = SORTS[sort.field]
  if (!read) throw new Error(`Unknown renewals sort field "${sort.field}".`)
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

export function onlyKind(rows: readonly PoolRow[], kind: PoolKind): readonly PoolRow[] {
  return rows.filter((row) => row.kind === kind)
}
