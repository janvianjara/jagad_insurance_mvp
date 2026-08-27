import { dataTableColumns } from '../../../ui/data'
import { Badge } from '../../../ui/signal'
import type { QueueConfig } from '../../../components/WorkQueue'
import { isProbed, localPage } from '../shared'
import type { ConfigMasterType, ConfigMasterValue, LocalListSpec } from '../shared'
import { MasterTypeDrawer } from './MasterTypeDrawer'

export type MastersQueueInput = {
  readonly masterTypes: readonly ConfigMasterType[]
  readonly masterValues: readonly ConfigMasterValue[]
}

function counts(input: MastersQueueInput, type: ConfigMasterType) {
  const values = input.masterValues.filter((value) => value.masterTypeId === type.id)
  return { active: values.filter((value) => value.active).length, total: values.length }
}

function parentLabel(input: MastersQueueInput, type: ConfigMasterType): string {
  if (!type.parentTypeId) return 'Flat list'
  return (
    input.masterTypes.find((candidate) => candidate.id === type.parentTypeId)?.label ??
    'A master that no longer exists'
  )
}

const listSpec = (input: MastersQueueInput): LocalListSpec<ConfigMasterType> => ({
  search: [(row) => row.label, (row) => row.key],
  filters: {
    kind: (row) => (row.editable ? 'agency' : 'platform'),
    shape: (row) => (row.parentTypeId ? 'cascading' : 'flat'),
  },
  sorts: {
    label: (row) => row.label,
    key: (row) => row.key,
    values: (row) => counts(input, row).total,
    parent: (row) => parentLabel(input, row),
  },
})

/**
 * The master list, as a configured `<WorkQueue>`.
 *
 * The row is the master *type*; its values live in the drawer the row opens,
 * which is where the plan puts a record's detail. Two queues on one screen would
 * fight over the same six reserved URL parameters, and the one that lost would
 * quietly stop being linkable — so there is one queue here, and the values are
 * detail rather than a second list.
 */
export function mastersQueue(input: MastersQueueInput): QueueConfig<ConfigMasterType> {
  const column = dataTableColumns<ConfigMasterType>()
  const spec = listSpec(input)

  return {
    key: 'config-masters',
    title: 'Masters',
    noun: 'master',
    nounPlural: 'master types',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('label', { header: 'Master' }),
      column.accessor('key', { header: 'Key' }),
      column.accessor(
        (row) => {
          const { active, total } = counts(input, row)
          return `${active} of ${total}`
        },
        { id: 'values', header: 'Active values' },
      ),
      column.accessor((row) => parentLabel(input, row), { id: 'parent', header: 'Cascades from' }),
      column.accessor((row) => (row.editable ? 'Agency' : 'Platform'), {
        id: 'kind',
        header: 'Kind',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return <Badge tone={label === 'Agency' ? 'neutral' : 'idle'}>{label}</Badge>
        },
      }),
      column.accessor((row) => (isProbed(row.key) ? 'Counted' : 'Not counted'), {
        id: 'probe',
        header: 'Use',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return (
            <Badge tone={label === 'Counted' ? 'ok' : 'warn'}>
              {label === 'Counted' ? 'Use is counted' : 'Use is not counted'}
            </Badge>
          )
        },
      }),
    ]),

    filters: [
      {
        key: 'kind',
        label: 'Kind',
        options: [
          { value: 'agency', label: 'Agency master' },
          { value: 'platform', label: 'Platform master' },
        ],
      },
      {
        key: 'shape',
        label: 'Shape',
        options: [
          { value: 'flat', label: 'Flat list' },
          { value: 'cascading', label: 'Cascading' },
        ],
      },
    ],

    sortable: ['label', 'key', 'values', 'parent'],
    defaultSort: { field: 'label', direction: 'asc' },
    searchPlaceholder: 'Search masters',

    // Lime is "needs a person": a master with nothing active in it means a form
    // somewhere is offering an empty list.
    stripeMapping: (row) => (counts(input, row).active === 0 ? 'attn' : undefined),

    load: async (query) => localPage(input.masterTypes, spec, query),

    empty: {
      title: 'No masters yet',
      explanation:
        'A master is a list a form offers — sources, cities, occupations, vehicle makes. Every one of them is configuration rather than code, which is what lets an agency change it without a release.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.label,
    drawerSubtitle: (row) => (row.editable ? 'Agency master' : 'Platform master'),
    renderDrawer: (row) => <MasterTypeDrawer key={row.id} type={row} />,
  }
}
