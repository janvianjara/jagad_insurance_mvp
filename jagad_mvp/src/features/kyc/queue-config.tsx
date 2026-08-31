/**
 * The KYC queue, as configuration (plan §5 "KYC queue + detail", §6).
 *
 * Not a table. `<WorkQueue>` was built once in P-08, so this file says what a
 * KYC row is and nothing about how a list behaves.
 *
 * Two decisions worth reading:
 *
 *   The queue is the outstanding set, always. `kycState` is a filter the
 *   repository already declares, so the queue narrows to `pending` and `partial`
 *   through the same mechanism a person uses — and a URL that asks for
 *   `complete` gets nothing rather than a second, quieter query. The queue is
 *   what its address says it is.
 *
 *   A row leads to the customer, not to a KYC-only screen. There is one file per
 *   person and §4's route map has no `/back-office/kyc/:id`; opening the row on
 *   `/customers/:id?tab=kyc` puts the work next to the household, the policies
 *   and the timeline it is about.
 */

import { emptyPage } from '../../data/repo'
import type { Customer, ListQuery, Page, StaffUser } from '../../data/repo'
import type { QueueBulkAction, QueueConfig } from '../../components/WorkQueue'
import { ConsentBadge } from '../../components/ConsentBadge'
import { dataTableColumns } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import type { Severity } from '../../ui/tone'
import { RecordId, RelativeTime } from '../../ui/type'
import { KYC_LABEL, KYC_TONE } from '../customers/customer-view'
import { CONSENT_LINK_VALID_DAYS } from '../customers/data/consent-token'
import type { CustomerDesk } from '../customers/data/customer-desk'
import { excludedSummary, splitForChase } from './chase-rules'
import styles from './KycQueue.module.css'

/** The two states that still owe work. `complete` is not a KYC queue row. */
export const OUTSTANDING_KYC: readonly string[] = ['pending', 'partial']

export type KycQueueDeps = {
  readonly desk: CustomerDesk
  readonly users: readonly StaffUser[]
  /** Injected: a row and the file it opens must never disagree about now. */
  readonly now: Date
  /** Who is signed in. Every consent link sent from here is sent by somebody. */
  readonly actorId: string
}

const column = dataTableColumns<Customer>()

/** A part-filled file with an expired link is the hottest row in the queue. */
export function kycSeverity(customer: Customer): Severity {
  if (customer.consentState === 'expired') return 'hot'
  if (customer.kycState === 'pending') return 'attn'
  if (customer.consentState === 'link_issued') return 'warm'
  return 'cool'
}

export function kycQueueConfig(deps: KycQueueDeps): QueueConfig<Customer> {
  const { desk, users, now, actorId } = deps
  const nameOf = (id: string | null) =>
    id === null ? 'Unassigned' : (users.find((user) => user.id === id)?.name ?? id)

  const columns = column.columns([
    column.accessor('systemNo', {
      header: 'Reference',
      cell: ({ row }) => <RecordId systemNo={row.original.systemNo} showInsurer={false} />,
    }),
    column.accessor('fullName', {
      header: 'Customer',
      enableSorting: false,
    }),
    column.accessor('kycState', {
      header: 'KYC',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={KYC_TONE[row.original.kycState]}>
          {KYC_LABEL[row.original.kycState]}
        </StatusPill>
      ),
    }),
    column.accessor('consentState', {
      header: 'Consent link',
      enableSorting: false,
      cell: ({ row }) => <ConsentBadge state={row.original.consentState} now={now} />,
    }),
    column.accessor('ownerId', {
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) => nameOf(row.original.ownerId),
    }),
    column.accessor('lastConsentChaseAt', {
      header: 'Last chased',
      // "Never" is the answer that matters most on this queue, so it is a word
      // rather than an empty cell — a blank reads as missing data, and this is
      // not missing, it is the finding.
      cell: ({ row }) =>
        row.original.lastConsentChaseAt === null ? (
          <span className={styles.never}>never</span>
        ) : (
          <span className={styles.chased}>
            <RelativeTime value={row.original.lastConsentChaseAt} now={now} />
            {row.original.consentChaseCount > 1 ? (
              <span className={styles.chaseCount}>
                {row.original.consentChaseCount} sent
              </span>
            ) : null}
          </span>
        ),
    }),
    column.accessor('createdAt', {
      header: 'On the books',
      cell: ({ row }) => <RelativeTime value={row.original.createdAt} now={now} />,
    }),
  ])

  return {
    key: 'kyc',
    title: 'KYC completion',
    noun: 'file',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'kycState',
        label: 'KYC state',
        options: [
          { value: 'pending', label: KYC_LABEL.pending },
          { value: 'partial', label: KYC_LABEL.partial },
        ],
      },
      {
        key: 'consentState',
        label: 'Consent',
        options: [
          { value: 'not_sent', label: 'No link sent' },
          { value: 'link_issued', label: 'Link out, unanswered' },
          { value: 'submitted', label: 'Consent recorded' },
          { value: 'expired', label: 'Link expired' },
        ],
      },
    ],
    sortable: ['createdAt', 'fullName', 'systemNo', 'lastConsentChaseAt'],
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchPlaceholder: 'Name, mobile or reference',
    stripeMapping: kycSeverity,
    bulkActions: [sendConsentLinks({ desk, actorId, now })],
    load: (query: ListQuery) => loadOutstanding(desk, query),
    empty: {
      title: 'No KYC files are waiting',
      explanation:
        'A file lands here when a deal is won and the customer still owes documents or consent. Completing one issues their portal credentials automatically.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/customers/${row.id}?tab=kyc`,
  }
}

type ChaseDeps = {
  readonly desk: CustomerDesk
  readonly actorId: string
  readonly now: Date
}

/**
 * FR-08.4 — sending consent links to a page of files at once.
 *
 * Four decisions in this action are worth reading, because each is a way a bulk
 * send of messages to real people goes wrong:
 *
 *   Selection is whatever the person ticked, and `<WorkQueue>` only ever ticks
 *   rows that are on screen. There is deliberately no "select all 119": one
 *   click that messages a hundred people whose rows nobody read is not a feature,
 *   and the cap is structural rather than a warning.
 *
 *   Rows that must not be written to are shown, not filtered away. A live link, a
 *   consent already given, a file chased to the cadence cap — each is named with
 *   its count in the preview, so the person can see that ticking forty will send
 *   thirty-one. Silently dropping nine would look exactly like sending forty.
 *
 *   The sends are sequential, not `Promise.all`. Each one draws its own token
 *   from the platform CSPRNG and walks its own machine, and a partial failure has
 *   to be reportable per customer rather than collapsing into one rejected
 *   promise. What succeeded stays sent; there is no rollback, because a message
 *   that has gone out cannot be recalled by failing the ones after it.
 *
 *   Nothing here writes the chase down. `advanceConsent` records
 *   `lastConsentChaseAt` on the move into `link_issued`, so this action and a
 *   person opening one file leave identical traces.
 */
function sendConsentLinks(deps: ChaseDeps): QueueBulkAction<Customer> {
  const { desk, actorId, now } = deps

  return {
    key: 'send-consent-link',
    label: 'Send consent link',
    icon: 'msg',
    variant: 'primary',

    confirmTitle: (selection) => {
      const { sending } = splitForChase(selection.rows)
      return sending.length === 1
        ? 'Send a consent link to 1 customer?'
        : `Send a consent link to ${sending.length} customers?`
    },

    preview: (selection) => {
      const { sending, excluded } = splitForChase(selection.rows)
      // An empty list disables Confirm, which is the right answer when every
      // ticked row is one we must not write to.
      if (sending.length === 0) return []

      const changes = [
        {
          key: 'recipients',
          label: 'Recipients',
          to: sending.length === 1 ? '1 customer' : `${sending.length} customers`,
        },
        {
          key: 'expiry',
          label: 'Each link expires',
          to: `${CONSENT_LINK_VALID_DAYS} days from now`,
        },
        { key: 'state', label: 'Consent', from: 'No link out', to: 'Link out, unanswered' },
      ]

      return excluded.length === 0
        ? changes
        : [
            ...changes,
            {
              key: 'excluded',
              label: 'Left out',
              to: `${excluded.length} of ${selection.rows.length} — ${excludedSummary(excluded)}`,
            },
          ]
    },

    note: () =>
      'Each person gets their own one-time link. It opens one form, grants no account, and expires on its own. Cancel sends nothing.',

    confirmLabel: 'Send links',

    run: async (selection) => {
      const { sending, excluded } = splitForChase(selection.rows)

      const refusals: string[] = []
      let sent = 0

      for (const customer of sending) {
        const outcome = await desk.issueConsentLink(customer.id, { actorId, now })
        if (outcome.ok) sent += 1
        else refusals.push(`${customer.fullName}: ${outcome.reason}`)
      }

      const skipped = excluded.length === 0 ? '' : ` ${excluded.length} were left out.`

      if (refusals.length === 0) {
        return {
          ok: true,
          message:
            sent === 1
              ? `1 consent link sent.${skipped}`
              : `${sent} consent links sent.${skipped}`,
        }
      }

      // What went out stays out. The refusals are named one by one, because
      // "3 of 8 failed" gives nobody anything to do next.
      return {
        ok: false,
        message: `${sent} of ${sending.length} sent.${skipped} ${refusals.join(' ')}`,
      }
    },
  }
}

/**
 * The outstanding set, narrowed by whatever else the URL asked for.
 *
 * The intersection is done on the filter values rather than on the rows, so the
 * repository still does the paging and `total` still counts the filtered set
 * (§7: a header that says "812" when four are showing is the bug `Page.total`
 * exists to prevent).
 */
export async function loadOutstanding(desk: CustomerDesk, query: ListQuery): Promise<Page<Customer>> {
  const asked = query.filters?.kycState ?? []
  const kycState =
    asked.length === 0 ? OUTSTANDING_KYC : asked.filter((state) => OUTSTANDING_KYC.includes(state))

  // An empty selection means "filter nothing" to the repository, so a URL asking
  // only for `complete` would widen the queue instead of emptying it. It empties.
  if (kycState.length === 0) return emptyPage<Customer>(query.pageSize)

  return desk.list({ ...query, filters: { ...query.filters, kycState } })
}
