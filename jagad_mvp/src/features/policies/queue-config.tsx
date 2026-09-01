/**
 * The two policy queues, as configuration (plan §5, §6, canvas 3.7).
 *
 * Neither is a table. `<WorkQueue>` was built once in P-08 and owns the filter
 * bar, the URL, the stripe, the pagination and the keyboard model; these two
 * objects say only what a policy row is and what a half-finished entry row is.
 *
 * Three decisions are worth reading before the code.
 *
 *   **Every filter and every sort here is one the repository declares.** The
 *   mock adapter's `POLICY_LIST_SPEC` throws on an undeclared filter rather than
 *   quietly returning every row, and that is a feature: a queue whose header
 *   says 812 while four rows show is exactly the bug that throw prevents. So the
 *   filter keys below are `status`, `companyId`, `premiumMode` and
 *   `paymentState`, and the sort fields are `systemNo`, `startDate` and
 *   `expiryDate` — no more, and nothing renamed on the way.
 *
 *   **The completion queue's row is an entry, not a policy.** `PolicyEntryDraft`
 *   is what §8 gives the act of entering a policy, and it carries a `policyId`
 *   and no words at all. So the config takes the policies and customers beside
 *   it and reads the reference and the name off them. A row that has lost its
 *   policy still renders — it says so — because a queue that silently drops rows
 *   is a queue nobody can reconcile.
 *
 *   **What is missing is shown, not counted.** Canvas 3.7 asks for the entry to
 *   appear "with what is still missing", and a bare count is not that: somebody
 *   picking up a colleague's entry needs to know whether it is the nominee or
 *   the premium, because one takes a phone call and the other takes a document.
 *   The count leads, in the attention colour, and the field names follow it in
 *   the words the person saw on the form.
 */

import type { Customer, ListQuery, Page, Policy, PolicyEntryDraft, StaffUser } from '../../data/repo'
import type { Company, Product } from '../../data/repo'
import type { QueueConfig } from '../../components/WorkQueue'
import { dataTableColumns } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { DateTime, RecordId, RelativeTime } from '../../ui/type'
import {
  ENTRY_PATH_LABEL,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  POLICY_LABEL,
  PREMIUM_MODE_LABEL,
  draftSeverity,
  nameOf,
  policyLabelFor,
  policySeverity,
  policyToneFor,
} from './policy-view'
import type { PolicyDesk } from './data/policy-desk'
import styles from './PolicyQueueScreen.module.css'

/* ------------------------------------------------------------ the policies */

export type PolicyQueueDeps = {
  readonly desk: PolicyDesk
  readonly customers: readonly Customer[]
  readonly companies: readonly Company[]
  readonly products: readonly Product[]
  /** Injected, so the pill and the stripe cannot disagree about what day it is. */
  readonly now: Date
}

const policyColumn = dataTableColumns<Policy>()

export function policyQueueConfig(deps: PolicyQueueDeps): QueueConfig<Policy> {
  const { desk, customers, companies, products, now } = deps

  const customerName = (id: string) =>
    customers.find((customer) => customer.id === id)?.fullName ?? id

  const placement = (policy: Policy) => {
    const company = companies.find((row) => row.id === policy.companyId)
    const product = products.find((row) => row.id === policy.productId)
    return {
      company: company?.shortName ?? company?.name ?? policy.companyId,
      product: product?.name ?? policy.productId,
    }
  }

  const columns = policyColumn.columns([
    policyColumn.accessor('systemNo', {
      header: 'Reference',
      // Both numbers, always. §8's dual numbering is only kept if the insurer's
      // absence is drawn rather than left as a gap.
      cell: ({ row }) => (
        <RecordId systemNo={row.original.systemNo} insurerNo={row.original.insurerNo} />
      ),
    }),
    policyColumn.accessor('customerId', {
      header: 'Customer',
      enableSorting: false,
      cell: ({ row }) => customerName(row.original.customerId),
    }),
    policyColumn.accessor('productId', {
      header: 'Company and product',
      enableSorting: false,
      cell: ({ row }) => {
        const { company, product } = placement(row.original)
        return (
          <span className={styles.placement}>
            <span className={styles.company}>{company}</span>
            <span className={styles.product}>{product}</span>
          </span>
        )
      },
    }),
    policyColumn.accessor('status', {
      header: 'State',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={policyToneFor(row.original, now)}>
          {policyLabelFor(row.original, now)}
        </StatusPill>
      ),
    }),
    policyColumn.accessor('premiumMode', {
      header: 'Premium mode',
      enableSorting: false,
      cell: ({ row }) => PREMIUM_MODE_LABEL[row.original.premiumMode],
    }),
    policyColumn.accessor('paymentState', {
      header: 'Payment',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={PAYMENT_TONE[row.original.paymentState]}>
          {PAYMENT_LABEL[row.original.paymentState]}
        </StatusPill>
      ),
    }),
    policyColumn.accessor('expiryDate', {
      header: 'Expires',
      cell: ({ row }) => (
        <DateTime value={row.original.expiryDate} absentText="no expiry recorded" />
      ),
    }),
  ])

  return {
    key: 'policies',
    title: 'Policies',
    noun: 'policy',
    nounPlural: 'policies',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'status',
        label: 'State',
        options: Object.entries(POLICY_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'companyId',
        advanced: true,
        label: 'Company',
        options: companies.map((company) => ({ value: company.id, label: company.name })),
      },
      {
        key: 'premiumMode',
        advanced: true,
        label: 'Premium mode',
        options: Object.entries(PREMIUM_MODE_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'paymentState',
        advanced: true,
        label: 'Payment',
        options: Object.entries(PAYMENT_LABEL).map(([value, label]) => ({ value, label })),
      },
    ],
    sortable: ['systemNo', 'startDate', 'expiryDate'],
    /*
     * The book, most recently written first.
     *
     * This used to be `expiryDate asc`, which sounds like "renewals soonest" and
     * is not what it does: a draft has no expiry, `compare` sorts null ahead of
     * every date, and the register therefore opened on twenty-five unissued
     * drafts — every one of them reading `insurer no. awaited`, `Unpaid` and
     * `no expiry recorded`, so four of the eight columns carried no information
     * at all. The one screen called "Policies" showed no policy.
     *
     * `startDate desc` reverses the null rule with it, so entries that are not
     * yet policies fall to the back where they belong. Renewal urgency is the
     * renewals queue's job, and it has one.
     */
    defaultSort: { field: 'startDate', direction: 'desc' },
    searchPlaceholder: "Our number or the insurer's",
    stripeMapping: (row) => policySeverity(row, now),
    load: (query: ListQuery) => desk.list(query),
    empty: {
      title: 'No policies are on file yet',
      explanation:
        'A policy lands here the moment somebody enters one — from a won deal, or directly against a policy the insurer has already issued.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/policies/${row.id}`,
  }
}

/* -------------------------------------------------------------- the drafts */

export type DraftQueueDeps = {
  readonly desk: PolicyDesk
  readonly policies: readonly Policy[]
  readonly customers: readonly Customer[]
  readonly users: readonly StaffUser[]
  /** Field key to the label a person saw on the form. See `fieldLabelsFrom`. */
  readonly labels: Readonly<Record<string, string>>
  readonly now: Date
}

const draftColumn = dataTableColumns<PolicyEntryDraft>()

/** The most field names a row prints before it stops and says how many are left. */
export const MISSING_NAMES_SHOWN = 3

export function draftQueueConfig(deps: DraftQueueDeps): QueueConfig<PolicyEntryDraft> {
  const { desk, policies, customers, users, labels, now } = deps

  const policyOf = (draft: PolicyEntryDraft) =>
    policies.find((policy) => policy.id === draft.policyId) ?? null

  const columns = draftColumn.columns([
    draftColumn.accessor('policyId', {
      header: 'Reference',
      enableSorting: false,
      cell: ({ row }) => {
        const policy = policyOf(row.original)
        // An entry whose policy has gone is still an entry somebody has to deal
        // with. It says so rather than vanishing from the count.
        if (!policy) return <span className={styles.orphan}>{row.original.policyId}</span>
        return <RecordId systemNo={policy.systemNo} insurerNo={policy.insurerNo} />
      },
    }),
    draftColumn.accessor('entryPath', {
      header: 'Customer',
      id: 'customer',
      enableSorting: false,
      cell: ({ row }) => {
        const policy = policyOf(row.original)
        if (!policy) return 'Unknown'
        return (
          customers.find((customer) => customer.id === policy.customerId)?.fullName ??
          policy.customerId
        )
      },
    }),
    draftColumn.accessor('missingFields', {
      header: 'Still to record',
      id: 'missing',
      cell: ({ row }) => {
        const missing = row.original.missingFields
        const named = missing.slice(0, MISSING_NAMES_SHOWN).map((key) => labels[key] ?? key)
        const rest = missing.length - named.length

        return (
          <span className={styles.missing} data-missing={missing.length}>
            <StatusPill tone="attn">
              {missing.length === 1 ? '1 field' : `${missing.length} fields`}
            </StatusPill>
            <span className={styles.missingNames}>
              {named.join(', ')}
              {rest > 0 ? ` and ${rest} more` : ''}
            </span>
          </span>
        )
      },
    }),
    draftColumn.accessor('entryPath', {
      header: 'Path',
      enableSorting: false,
      cell: ({ row }) => ENTRY_PATH_LABEL[row.original.entryPath],
    }),
    draftColumn.accessor('savedBy', {
      header: 'Saved by',
      enableSorting: false,
      cell: ({ row }) => nameOf(users, row.original.savedBy),
    }),
    draftColumn.accessor('savedAt', {
      header: 'Saved',
      cell: ({ row }) => <RelativeTime value={row.original.savedAt} now={now} />,
    }),
  ])

  return {
    key: 'policy-drafts',
    title: 'Entries still to finish',
    noun: 'entry',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'entryPath',
        label: 'Entry path',
        options: Object.entries(ENTRY_PATH_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'savedBy',
        label: 'Saved by',
        options: users.map((user) => ({ value: user.id, label: user.name })),
      },
    ],
    // The repository declares both, and both are what this queue is read by:
    // how much is left, and how long it has been left.
    sortable: ['missing', 'savedAt'],
    defaultSort: { field: 'missing', direction: 'desc' },
    searchPlaceholder: 'Policy reference',
    stripeMapping: draftSeverity,
    load: (query: ListQuery): Promise<Page<PolicyEntryDraft>> => desk.completionQueue(query),
    empty: {
      title: 'Nothing is waiting to be finished',
      explanation:
        'An entry lands here when somebody saves a policy form with required fields still empty. Finishing one takes it off this queue on its own.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/policies/${row.policyId}`,
  }
}
