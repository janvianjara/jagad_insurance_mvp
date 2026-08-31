/**
 * `/config/integrations` as a configured queue — plan §5's configuration block
 * (§8's `IntegrationConfig`), canvas flow 6.
 *
 * Four kinds, and the MVP invents no fifth: the WhatsApp Business Solution
 * Provider, transactional SMS, outbound email and the OCR service. What the list
 * shows is which exist, whether they are switched on, and what happened the last
 * time each was exercised — never a key, a token or a sender secret, because the
 * record has nowhere to hold one.
 */

import type { ReactNode } from 'react'
import type { QueueConfig } from '../../../components/WorkQueue'
import { INTEGRATION_KINDS } from '../../../data/repo'
import type { IntegrationConfig, IntegrationKind, ListQuery, Page } from '../../../data/repo'
import { dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import { DateTime } from '../../../ui/type'
import styles from './integrations.module.css'

export const KIND_LABEL: Readonly<Record<IntegrationKind, string>> = {
  bsp: 'WhatsApp (BSP)',
  sms: 'SMS',
  smtp: 'Email (SMTP)',
  ocr: 'OCR',
}

export type IntegrationsQueueDeps = {
  readonly load: (query: ListQuery) => Promise<Page<IntegrationConfig>>
  readonly renderDrawer: (row: IntegrationConfig) => ReactNode
}

export function integrationsQueue(deps: IntegrationsQueueDeps): QueueConfig<IntegrationConfig> {
  const column = dataTableColumns<IntegrationConfig>()

  return {
    key: 'config-integrations',
    title: 'Integrations',
    noun: 'integration',
    nounPlural: 'integrations',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('label', {
        header: 'Integration',
        cell: ({ row }) => (
          <span>
            {row.original.label}
            <br />
            <span className={styles.key}>{row.original.key}</span>
          </span>
        ),
      }),
      column.accessor('kind', {
        header: 'Kind',
        enableSorting: false,
        cell: ({ row }) => <Badge caps>{KIND_LABEL[row.original.kind]}</Badge>,
      }),
      column.accessor('providerName', { header: 'Provider', enableSorting: false }),
      column.accessor((row) => (row.enabled ? 'On' : 'Off'), {
        id: 'enabled',
        header: 'Switched on',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={row.original.enabled ? 'ok' : 'idle'}>
            {row.original.enabled ? 'On' : 'Off'}
          </StatusPill>
        ),
      }),
      column.accessor((row) => row.lastCheckOutcome ?? '', {
        id: 'check',
        header: 'Last check',
        enableSorting: false,
        cell: ({ row }) => {
          const outcome = row.original.lastCheckOutcome
          if (outcome === null) return <span className={styles.absent}>never exercised</span>
          return (
            <StatusPill tone={outcome === 'ok' ? 'ok' : 'bad'}>
              {outcome === 'ok' ? 'Answered' : 'Failed'}
            </StatusPill>
          )
        },
      }),
      column.accessor('lastCheckedAt', {
        header: 'Checked',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.lastCheckedAt ? (
            <DateTime value={row.original.lastCheckedAt} mode="date" />
          ) : (
            <span className={styles.absent}>never</span>
          ),
      }),
      column.accessor('updatedAt', {
        header: 'Last saved',
        cell: ({ row }) => <DateTime value={row.original.updatedAt} mode="date" />,
      }),
    ]),

    filters: [
      {
        key: 'kind',
        label: 'Kind',
        options: Object.values(INTEGRATION_KINDS).map((kind) => ({
          value: kind,
          label: KIND_LABEL[kind],
        })),
      },
      {
        key: 'enabled',
        label: 'Switched on',
        options: [
          { value: 'true', label: 'On' },
          { value: 'false', label: 'Off' },
        ],
      },
      {
        key: 'lastCheckOutcome',
        label: 'Last check',
        options: [
          { value: 'ok', label: 'Answered' },
          { value: 'failed', label: 'Failed' },
        ],
      },
    ],

    sortable: ['label', 'updatedAt'],
    defaultSort: { field: 'label', direction: 'asc' },
    searchPlaceholder: 'Integration or provider',

    // Amber, not lime: a channel that failed its last check is at risk of
    // dropping messages, which is a person's problem to chase rather than a form
    // to fill in.
    stripeMapping: (row) => {
      if (row.lastCheckOutcome === 'failed') return 'warm'
      if (row.enabled && row.lastCheckOutcome === null) return 'attn'
      return undefined
    },

    load: deps.load,

    empty: {
      title: 'No integrations configured',
      explanation:
        'An integration records that an outward channel exists — which provider, whether it is switched on, and the settings an admin needs to see. The credentials stay in the provider’s own console; this platform never holds one.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.label,
    drawerSubtitle: (row) => `${KIND_LABEL[row.kind]} · ${row.providerName}`,
    renderDrawer: deps.renderDrawer,
  }
}
