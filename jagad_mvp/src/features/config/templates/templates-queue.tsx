/**
 * `/config/templates` as a configured queue — plan §5 ("Config × 10"), canvas
 * flow 6.
 *
 * The version column is the point of the screen. Flow 6's promise is that the
 * words a customer receives are configuration rather than code, and the way that
 * stays safe is that an edit publishes the next version instead of rewriting
 * what already went out. So the list shows which version is live, and the drawer
 * says what saving will do before it does it.
 */

import type { ReactNode } from 'react'
import type { QueueConfig } from '../../../components/WorkQueue'
import { MESSAGE_CHANNELS } from '../../../data/repo'
import type { ListQuery, MessageChannel, MessageTemplate, Page, Recipe } from '../../../data/repo'
import { dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import { DateTime } from '../../../ui/type'
import styles from './templates.module.css'

export const CHANNEL_LABEL: Readonly<Record<MessageChannel, string>> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
}

export type TemplatesQueueDeps = {
  readonly load: (query: ListQuery) => Promise<Page<MessageTemplate>>
  readonly recipes: readonly Recipe[]
  readonly renderDrawer: (row: MessageTemplate) => ReactNode
}

export function templatesQueue(deps: TemplatesQueueDeps): QueueConfig<MessageTemplate> {
  const column = dataTableColumns<MessageTemplate>()
  const recipeLabel = (key: string | null) =>
    key === null ? null : (deps.recipes.find((recipe) => recipe.key === key)?.label ?? key)

  return {
    key: 'config-templates',
    title: 'Message templates',
    noun: 'template',
    nounPlural: 'templates',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('label', {
        header: 'Template',
        cell: ({ row }) => (
          <span>
            {row.original.label}
            <br />
            <span className={styles.key}>{row.original.key}</span>
          </span>
        ),
      }),
      column.accessor('channel', {
        header: 'Channel',
        enableSorting: false,
        cell: ({ row }) => <Badge caps>{CHANNEL_LABEL[row.original.channel]}</Badge>,
      }),
      column.accessor((row) => recipeLabel(row.recipeKey) ?? '', {
        id: 'recipe',
        header: 'Fired by',
        enableSorting: false,
        cell: ({ row }) => {
          const label = recipeLabel(row.original.recipeKey)
          return label === null ? (
            <span className={styles.absent}>sent by hand</span>
          ) : (
            <span>{label}</span>
          )
        },
      }),
      column.accessor('version', {
        header: 'Version',
        enableSorting: false,
        cell: ({ row }) => (
          <span className={styles.key}>{`v${row.original.version}`}</span>
        ),
      }),
      column.accessor((row) => (row.active ? 'Active' : 'Inactive'), {
        id: 'active',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={row.original.active ? 'ok' : 'idle'}>
            {row.original.active ? 'Active' : 'Inactive'}
          </StatusPill>
        ),
      }),
      column.accessor('updatedAt', {
        header: 'Last saved',
        cell: ({ row }) => <DateTime value={row.original.updatedAt} mode="date" />,
      }),
    ]),

    filters: [
      {
        key: 'channel',
        label: 'Channel',
        options: Object.values(MESSAGE_CHANNELS).map((channel) => ({
          value: channel,
          label: CHANNEL_LABEL[channel],
        })),
      },
      {
        key: 'active',
        label: 'Status',
        options: [
          { value: 'true', label: 'Active' },
          { value: 'false', label: 'Inactive' },
        ],
      },
      {
        key: 'recipeKey',
        label: 'Fired by',
        options: deps.recipes.map((recipe) => ({ value: recipe.key, label: recipe.label })),
      },
    ],

    sortable: ['label', 'updatedAt'],
    defaultSort: { field: 'label', direction: 'asc' },
    searchPlaceholder: 'Template name or key',

    // Lime is "needs a person": a template nothing fires is one somebody has to
    // remember to send, which is the thing flow 6 exists to remove.
    stripeMapping: (row) => (row.recipeKey === null ? 'attn' : undefined),

    load: deps.load,

    empty: {
      title: 'No message templates yet',
      explanation:
        'A template is the wording a customer actually receives, and the recipe that fires it says when. Adding one here changes what goes out without anybody touching code.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.label,
    drawerSubtitle: (row) => `${CHANNEL_LABEL[row.channel]} · v${row.version}`,
    renderDrawer: deps.renderDrawer,
  }
}
