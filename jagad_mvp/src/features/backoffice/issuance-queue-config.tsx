/**
 * The issuance queue, as configuration — FR-08.1's fifth ops queue, plan §9,
 * canvas 3.6.
 *
 * Not a table. `<WorkQueue>` was built once, so this file says what an issuance
 * row is and nothing about how a list behaves.
 *
 * Four decisions worth reading:
 *
 *   **Dual numbering is the first column and the second filter.** §8 gives every
 *   policy a `systemNo` at entry and an `insurerNo` when the company answers, and
 *   this is the one queue where the second half is routinely missing. So both
 *   render through `<RecordId>`, which draws the absent half as "awaited" rather
 *   than as a blank, and "insurer number awaited" is a state a person can filter
 *   the queue down to. That is the queue's whole reason to exist.
 *
 *   **The money is rendered and never entered.** The premium column is a read of
 *   `policy.finalPremium` and there is no control on this queue that accepts a
 *   figure. The one place an amount enters this feature is `<OcrField>` inside
 *   `<IssuancePanel>`, where it is text a person confirmed off the insurer's own
 *   paper (D3).
 *
 *   **One bulk action, and it is the one that carries no judgement.** Sending a
 *   raised proposal to the insurer is the same act for forty rows as for one:
 *   nothing is decided, nothing is valued, and the machine refuses any row that
 *   is not sitting in `proposal`. Issuing is deliberately absent from the bulk
 *   bar — it needs a document, a reading and a person's confirmation per policy,
 *   and a ticked-forty-and-confirm affordance over it would be exactly the silent
 *   commit FR-16 exists to stop.
 *
 *   **The stripe is severity, not status.** The pill already says which stage a
 *   policy is at. The stripe says how much trouble the row is in, and lime means
 *   the next move is ours (U7).
 */

import type { ListQuery, Company, Customer, DocumentRecord, Page, Product } from '../../data/repo'
import type { QueueBulkAction, QueueConfig } from '../../components/WorkQueue'
import type { ConfirmChange } from '../../components/guardrails'
import type { User } from '../../domain/permissions'
import { POLICY_STATES } from '../../domain/workflows'
import type { KycState } from '../../domain/workflows'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { Money, RecordId, RelativeTime } from '../../ui/type'
import { PAYMENT_LABEL, PAYMENT_TONE, POLICY_LABEL, POLICY_TONE } from '../policies/policy-view'
import { IssuanceDrawer } from './IssuanceDrawer'
import { INSURER_NUMBER_FILTER, STAGE_FILTER } from './data/issuance-desk'
import type { IssuanceDesk, IssuanceRow } from './data/issuance-desk'
import {
  INSURER_NUMBER_LABEL,
  INSURER_NUMBER_STATES,
  ISSUANCE_STATES,
  inDeskSince,
  insurerNumberStateOf,
  issuanceSeverity,
} from './issuance-view'
import styles from './Issuance.module.css'

export type IssuanceQueueDeps = {
  readonly desk: IssuanceDesk
  /** Read once for the whole queue; a row prints a name, not an id. */
  readonly customers: readonly Customer[]
  readonly products: readonly Product[]
  readonly companies: readonly Company[]
  /** Every document in reach, indexed by the policy it hangs off. Presence only. */
  readonly documents: readonly DocumentRecord[]
  /** Who is signed in. The bulk send records the act as theirs. */
  readonly actor: User
  /** Injected: a row and the drawer it opens must never disagree about now. */
  readonly now: Date
}

const column = dataTableColumns<IssuanceRow>()

export function issuanceQueueConfig(deps: IssuanceQueueDeps): QueueConfig<IssuanceRow> {
  const { desk, customers, products, companies, documents, actor, now } = deps

  const customerOf = (id: string) => customers.find((customer) => customer.id === id) ?? null
  const customerName = (id: string) => customerOf(id)?.fullName ?? id
  const productOf = (id: string) => products.find((product) => product.id === id) ?? null
  const companyName = (id: string) =>
    companies.find((company) => company.id === id)?.name ?? id

  /** Documents hanging off one policy. Presence and review state; never content. */
  const documentsFor = (policyId: string) =>
    documents.filter(
      (document) => document.subjectEntity === 'Policy' && document.subjectId === policyId,
    )

  const columns = column.columns([
    // §8, and the reason this queue exists. Both numbers, always, with the
    // absent half drawn as "awaited" rather than left blank.
    column.accessor('policy.systemNo', {
      id: 'systemNo',
      header: 'Policy',
      cell: ({ row }) => (
        <RecordId
          systemNo={row.original.policy.systemNo}
          insurerNo={row.original.policy.insurerNo}
          layout="stacked"
        />
      ),
    }),
    column.accessor('policy.customerId', {
      id: 'customer',
      header: 'Customer',
      enableSorting: false,
      cell: ({ row }) => customerName(row.original.policy.customerId),
    }),
    column.accessor('policy.productId', {
      id: 'cover',
      header: 'Cover',
      enableSorting: false,
      cell: ({ row }) => {
        const product = productOf(row.original.policy.productId)
        return (
          <span className={styles.coverCell}>
            <span>{product?.name ?? 'Not resolved'}</span>
            <span className={styles.coverCompany}>
              {companyName(row.original.policy.companyId)}
            </span>
          </span>
        )
      },
    }),
    column.accessor('policy.status', {
      id: 'stage',
      header: 'Stage',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={POLICY_TONE[row.original.policy.status]}>
          {POLICY_LABEL[row.original.policy.status]}
        </StatusPill>
      ),
    }),
    // The queue's own question, as a cell rather than as an absence somebody has
    // to notice.
    column.accessor('policy.insurerNo', {
      id: 'insurer',
      header: 'Insurer number',
      enableSorting: false,
      cell: ({ row }) =>
        insurerNumberStateOf(row.original.policy) === INSURER_NUMBER_STATES.received ? (
          <Badge tone="ok" icon="check">
            Received
          </Badge>
        ) : (
          <Badge tone="attn">Awaited</Badge>
        ),
    }),
    column.accessor('policy.finalPremium', {
      id: 'premium',
      header: 'Final premium',
      enableSorting: false,
      // Read-only. The absent text says "not recorded" rather than showing a
      // zero: a premium nobody typed is not a premium of nothing.
      cell: ({ row }) => <Money paise={row.original.policy.finalPremium?.paise ?? null} />,
    }),
    column.accessor('policy.paymentState', {
      id: 'payment',
      header: 'Money',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={PAYMENT_TONE[row.original.policy.paymentState]} size="sm">
          {PAYMENT_LABEL[row.original.policy.paymentState]}
        </StatusPill>
      ),
    }),
    column.accessor('draft', {
      id: 'waiting',
      header: 'In the desk since',
      enableSorting: false,
      cell: ({ row }) => (
        <RelativeTime
          value={inDeskSince(row.original.draft)}
          now={now}
          addSuffix
          absentText="not recorded"
        />
      ),
    }),
  ])

  /**
   * The one bulk move on this desk.
   *
   * `run` calls the machine once per row through the desk, so a row that is not
   * in `proposal` comes back with the machine's own refusal and the others still
   * go. The outcome message says how many moved and quotes the first refusal
   * rather than reporting a bare failure.
   */
  const sendToInsurer: QueueBulkAction<IssuanceRow> = {
    key: 'send-to-insurer',
    label: 'Send to the insurer',
    icon: 'msg',
    variant: 'primary',
    confirmTitle: (selection) =>
      selection.ids.length === 1
        ? 'Send this proposal to the insurer?'
        : `Send ${selection.ids.length} proposals to the insurer?`,
    preview: (selection): readonly ConfirmChange[] => {
      const sendable = selection.rows.filter(
        (row) => row.policy.status === POLICY_STATES.proposal,
      )
      if (sendable.length === 0) return []
      return sendable.map((row) => ({
        key: row.policy.id,
        label: row.policy.systemNo,
        from: POLICY_LABEL[row.policy.status],
        to: POLICY_LABEL.sent,
      }))
    },
    note: (selection) => {
      const blocked = selection.rows.filter(
        (row) => row.policy.status !== POLICY_STATES.proposal,
      ).length
      return blocked === 0
        ? 'The proposal leaves the agency and the insurer is notified as part of the same move.'
        : `The proposal leaves the agency and the insurer is notified as part of the same move. ${blocked} of the selected ${blocked === 1 ? 'row is' : 'rows are'} not a raised proposal and will be refused by the policy machine, in its own words.`
    },
    confirmLabel: 'Send them',
    run: async (selection) => {
      let sent = 0
      let firstRefusal: string | null = null

      for (const row of selection.rows) {
        const result = await desk.sendProposal(row.policy.id, actor.id, now)
        if (result.ok) {
          sent += 1
          continue
        }
        firstRefusal ??= `${row.policy.systemNo}: ${result.reason}`
      }

      const moved = sent === 1 ? '1 proposal was sent' : `${sent} proposals were sent`
      return {
        ok: firstRefusal === null,
        message: firstRefusal === null ? `${moved}.` : `${moved}. ${firstRefusal}`,
      }
    },
  }

  return {
    key: 'issuance',
    title: 'Issuance',
    noun: 'policy',
    nounPlural: 'policies',
    getRowId: (row) => row.policy.id,
    columns,

    filters: [
      {
        key: STAGE_FILTER,
        label: 'Stage',
        anyLabel: 'Every stage on this desk',
        // Only the span. A URL naming a state outside it is narrowed back by the
        // desk rather than widening this queue past its own address.
        options: ISSUANCE_STATES.map((state) => ({ value: state, label: POLICY_LABEL[state] })),
      },
      {
        key: INSURER_NUMBER_FILTER,
        label: 'Insurer number',
        anyLabel: 'Received or awaited',
        options: Object.values(INSURER_NUMBER_STATES).map((value) => ({
          value,
          label: INSURER_NUMBER_LABEL[value],
        })),
      },
    ],

    // The repository declares these; there is deliberately no "oldest first",
    // because `Policy` carries no timestamp for when it reached this desk and a
    // sort on a date the record does not hold would be a sort on nothing.
    sortable: ['systemNo', 'startDate', 'expiryDate'],
    defaultSort: { field: 'systemNo', direction: 'asc' },
    searchPlaceholder: 'Our number or the insurer’s',
    stripeMapping: (row) =>
      issuanceSeverity({
        policy: row.policy,
        draft: row.draft,
        documents: documentsFor(row.policy.id),
        now,
      }),

    bulkActions: [sendToInsurer],

    load: (query: ListQuery): Promise<Page<IssuanceRow>> => desk.awaitingIssuance(query),

    // §4 reserves no `/back-office/issuance/:id`, and it should not: recording
    // the insurer's answer happens beside the row, and the policy's own file is
    // one link away for everything else.
    rowTarget: 'drawer',
    drawerTitle: (row) => row.policy.systemNo,
    drawerSubtitle: (row) => customerName(row.policy.customerId),
    renderDrawer: (row, queue) => (
      <IssuanceDrawer
        row={row}
        desk={desk}
        now={now}
        customerName={customerName(row.policy.customerId)}
        kycState={(customerOf(row.policy.customerId)?.kycState ?? 'pending') as KycState}
        product={productOf(row.policy.productId)}
        companyName={companyName(row.policy.companyId)}
        documents={documentsFor(row.policy.id)}
        queue={queue}
      />
    ),

    empty: {
      title: 'Nothing is with the insurer',
      explanation:
        'A policy lands here the moment a proposal is raised against it, and leaves when the customer has their document. Raising a proposal on a finished entry is what puts the first row on this queue.',
    },
  }
}
