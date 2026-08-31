/**
 * The client portfolio register — FR-19.2.
 *
 * Not a table. `<WorkQueue>` was built once, so this file says what a portfolio
 * row IS and nothing about how a list behaves: filter, sort, page and search
 * come off the URL exactly as they do on every other queue in the product.
 *
 * ---------------------------------------------------------------------------
 * The register an agent opens before a call
 * ---------------------------------------------------------------------------
 *
 * The columns are chosen for that one moment. A person about to ring a customer
 * needs, in order: who they are, how much they hold and with whom, when the next
 * thing expires, and whether anything is still open against them. Everything
 * else belongs on the customer file, one click in — the row is the surface, the
 * reasons are inside.
 *
 * Three rules the columns keep:
 *
 *   **Aadhaar is last four digits, and only where it identifies.** The full
 *   number is never read into this row and there is no column that could show
 *   one. `<MaskedValue>` renders what is there as `XXXX XXXX 4417`.
 *
 *   **The premium column says what it covers.** A customer holding nine policies
 *   with premiums typed on four gets the sum of those four and the words "on 4
 *   of 9". An unrecorded premium is absent, not zero, and a total that quietly
 *   covers less than the row does is worse than no total.
 *
 *   **There is no renewal premium, no lifetime value and no propensity.** The
 *   money on this register is money somebody typed off an insurer's document.
 */

import { Link } from 'react-router'
import type { QueueConfig } from '../../components/WorkQueue'
import type { Company, ListQuery, Page } from '../../data/repo'
import { CONSENT_STATES, KYC_CONSENT_STATES } from '../../domain/workflows'
import { dataTableColumns } from '../../ui/data'
import { Badge } from '../../ui/signal'
import { StatusPill } from '../../ui/signal'
import type { Severity } from '../../ui/signal'
import { DateTime, MaskedValue, Money, RecordId } from '../../ui/type'
import { KYC_LABEL, KYC_TONE } from '../customers/customer-view'
import type { PortfolioRow } from './data/registers-desk'
import styles from './Reports.module.css'

const CONSENT_LABEL: Readonly<Record<string, string>> = {
  [CONSENT_STATES.notSent]: 'No link sent',
  [CONSENT_STATES.linkIssued]: 'Link out, unanswered',
  [CONSENT_STATES.submitted]: 'Consent given',
  [CONSENT_STATES.expired]: 'Link expired',
}

export type PortfolioRegisterDeps = {
  readonly load: (query: ListQuery) => Promise<Page<PortfolioRow>>
  readonly companies: readonly Company[]
}

/**
 * How much trouble a row is in.
 *
 * Lime — attention, a person is needed — for a renewal falling inside ninety
 * days, because that is the row somebody has to ring. Amber for something open
 * against the file with no renewal pressing. Never green: holding a policy is
 * not a positive STATUS, and §2 keeps green for status.
 */
function portfolioSeverity(row: PortfolioRow): Severity | undefined {
  if (row.expiringIn90 > 0) return 'attn'
  if (row.openClaims + row.openEndorsements + row.unsettledPayments > 0) return 'warm'
  return undefined
}

const column = dataTableColumns<PortfolioRow>()

export function portfolioRegisterConfig(deps: PortfolioRegisterDeps): QueueConfig<PortfolioRow> {
  const columns = column.columns([
    column.accessor('name', {
      header: 'Customer',
      cell: ({ row }) => (
        <span className={styles.registerName}>
          <Link className={styles.rowLink} to={`/customers/${row.original.customerId}`}>
            {row.original.name}
          </Link>
          <RecordId systemNo={row.original.systemNo} showInsurer={false} />
        </span>
      ),
    }),
    column.accessor('mobile', {
      header: 'Mobile',
      enableSorting: false,
      cell: ({ row }) => <span className={styles.mono}>{row.original.mobile}</span>,
    }),
    // Last four at most. There is no path in this file to a full Aadhaar number,
    // and the row it is built from never reads one.
    column.accessor((row) => row.aadhaarLast4 ?? '', {
      id: 'aadhaar',
      header: 'Aadhaar',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.aadhaarLast4 === null ? (
          <span className={styles.absent}>not on file</span>
        ) : (
          <MaskedValue value={row.original.aadhaarLast4} kind="aadhaar" />
        ),
    }),
    column.accessor('policyCount', {
      header: 'Policies',
      cell: ({ row }) =>
        row.original.policyCount === 0 ? (
          <span className={styles.absent}>none held</span>
        ) : (
          <span className={styles.numericCell}>{row.original.policyCount}</span>
        ),
    }),
    column.accessor((row) => row.companies.join(', '), {
      id: 'companies',
      header: 'With',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.companies.length === 0 ? (
          <span className={styles.absent}>—</span>
        ) : (
          <span className={styles.companyCell}>{row.original.companies.join(', ')}</span>
        ),
    }),
    column.accessor((row) => row.recordedPremium.paise, {
      id: 'recordedPremium',
      header: 'Premium recorded',
      cell: ({ row }) => (
        <span className={styles.moneyCell}>
          <Money
            paise={row.original.premiumRecordedOn === 0 ? null : row.original.recordedPremium.paise}
            absentText="none typed in"
          />
          {row.original.premiumMissingOn > 0 ? (
            <span className={styles.moneyCover}>
              on {row.original.premiumRecordedOn} of {row.original.policyCount}
            </span>
          ) : null}
        </span>
      ),
    }),
    column.accessor((row) => row.nextExpiry ?? '', {
      id: 'nextExpiry',
      header: 'Next renewal',
      cell: ({ row }) =>
        row.original.nextExpiry === null ? (
          <span className={styles.absent}>nothing in force</span>
        ) : (
          <span className={styles.registerName}>
            <DateTime value={row.original.nextExpiry} mode="date" />
            {row.original.expiringIn90 > 0 ? (
              <Badge tone="attn">{row.original.expiringIn90} inside 90 days</Badge>
            ) : null}
          </span>
        ),
    }),
    column.accessor(
      (row) => row.openClaims + row.openEndorsements + row.unsettledPayments,
      {
        id: 'outstanding',
        header: 'Outstanding',
        enableSorting: false,
        cell: ({ row }) => {
          const parts: string[] = []
          if (row.original.openClaims > 0) {
            parts.push(`${row.original.openClaims} claim${row.original.openClaims === 1 ? '' : 's'}`)
          }
          if (row.original.openEndorsements > 0) {
            parts.push(
              `${row.original.openEndorsements} endorsement${row.original.openEndorsements === 1 ? '' : 's'}`,
            )
          }
          if (row.original.unsettledPayments > 0) {
            parts.push(`${row.original.unsettledPayments} unsettled`)
          }
          return parts.length === 0 ? (
            <span className={styles.absent}>nothing open</span>
          ) : (
            <span className={styles.companyCell}>{parts.join(', ')}</span>
          )
        },
      },
    ),
    column.accessor('kycState', {
      header: 'KYC',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={KYC_TONE[row.original.kycState as keyof typeof KYC_TONE] ?? 'idle'}>
          {KYC_LABEL[row.original.kycState as keyof typeof KYC_LABEL] ?? row.original.kycState}
        </StatusPill>
      ),
    }),
  ])

  return {
    key: 'portfolio',
    title: 'Client portfolio',
    noun: 'customer',
    nounPlural: 'customers',
    getRowId: (row) => row.customerId,
    columns,

    filters: [
      {
        key: 'companyId',
        label: 'Company',
        anyLabel: 'Any company',
        options: deps.companies.map((company) => ({ value: company.id, label: company.name })),
      },
      {
        key: 'holding',
        label: 'Holding',
        anyLabel: 'Any holding',
        options: [
          { value: 'expiring', label: 'Renewing inside 90 days' },
          { value: 'held', label: 'Holding, nothing due' },
          { value: 'none', label: 'Holding nothing' },
        ],
      },
      {
        key: 'outstanding',
        label: 'Outstanding',
        anyLabel: 'Open or clear',
        options: [
          { value: 'open', label: 'Something open' },
          { value: 'clear', label: 'Nothing open' },
        ],
      },
      {
        key: 'kycState',
        label: 'KYC',
        options: Object.values(KYC_CONSENT_STATES).map((state) => ({
          value: state,
          label: KYC_LABEL[state],
        })),
      },
      {
        key: 'consentState',
        label: 'Consent',
        options: Object.values(CONSENT_STATES).map((state) => ({
          value: state,
          label: CONSENT_LABEL[state] ?? state,
        })),
      },
    ],

    sortable: ['name', 'policyCount', 'nextExpiry', 'recordedPremium'],
    defaultSort: { field: 'nextExpiry', direction: 'asc' },
    searchPlaceholder: 'Name, mobile, customer number or city',
    stripeMapping: portfolioSeverity,

    rowTarget: 'route',
    rowHref: (row) => `/customers/${row.customerId}`,

    load: deps.load,

    empty: {
      title: 'No customer is on the book yet',
      explanation:
        'A row appears here as soon as a customer file exists, whether or not they hold a policy — the register is the whole client list, and "holding nothing" is one of the things it is read for.',
    },
  }
}
