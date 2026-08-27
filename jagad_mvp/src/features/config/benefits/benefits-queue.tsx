import { dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import type { QueueConfig } from '../../../components/WorkQueue'
import { INSURANCE_LINES } from '../../../data/repo'
import { BENEFIT_KIND_LABELS, LINE_LABELS, localPage } from '../shared'
import type { ConfigBenefitItem, ConfigBenefitMap, LocalListSpec } from '../shared'
import { BenefitDrawer } from './BenefitDrawer'

export type BenefitsQueueInput = {
  readonly benefitItems: readonly ConfigBenefitItem[]
  readonly benefitMaps: readonly ConfigBenefitMap[]
}

function mappedCount(input: BenefitsQueueInput, item: ConfigBenefitItem): number {
  return new Set(
    input.benefitMaps.filter((row) => row.benefitItemId === item.id).map((row) => row.productId),
  ).size
}

const listSpec = (input: BenefitsQueueInput): LocalListSpec<ConfigBenefitItem> => ({
  search: [(row) => row.label, (row) => row.key, (row) => row.section],
  filters: {
    line: (row) => row.line,
    kind: (row) => row.valueKind,
    section: (row) => row.section,
    status: (row) => (row.active ? 'active' : 'inactive'),
  },
  sorts: {
    label: (row) => row.label,
    section: (row) => row.section,
    order: (row) => row.sortOrder,
    products: (row) => mappedCount(input, row),
  },
})

/**
 * The benefit catalogue — FR-06.4: label, field type, options, default, section
 * and display order, one row each.
 *
 * Canvas 2.2 is the reason this is a catalogue rather than a list of columns: an
 * ad-hoc row typed on a single quotation stays on that quotation. Only what is
 * here is offered on every product's sheet, and the display order here is the
 * order the comparison prints in.
 */
export function benefitsQueue(input: BenefitsQueueInput): QueueConfig<ConfigBenefitItem> {
  const column = dataTableColumns<ConfigBenefitItem>()
  const spec = listSpec(input)
  const sections = [...new Set(input.benefitItems.map((item) => item.section))].toSorted()

  return {
    key: 'config-benefits',
    title: 'Benefits',
    noun: 'benefit',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('label', { header: 'Benefit' }),
      column.accessor((row) => LINE_LABELS[row.line], {
        id: 'line',
        header: 'Line',
        enableSorting: false,
        cell: (info) => <Badge tone="neutral">{String(info.getValue())}</Badge>,
      }),
      column.accessor((row) => BENEFIT_KIND_LABELS[row.valueKind], {
        id: 'kind',
        header: 'Field type',
        enableSorting: false,
      }),
      column.accessor('section', { header: 'Section' }),
      column.accessor((row) => row.options.length, { id: 'options', header: 'Options', enableSorting: false }),
      column.accessor((row) => (row.defaultValue === '' ? 'Nothing pre-filled' : row.defaultValue), {
        id: 'default',
        header: 'Default',
        enableSorting: false,
      }),
      column.accessor((row) => mappedCount(input, row), { id: 'products', header: 'On products' }),
      column.accessor('sortOrder', { header: 'Order' }),
      column.accessor((row) => (row.active ? 'Active' : 'Inactive'), {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return (
            <StatusPill tone={label === 'Active' ? 'ok' : 'idle'} size="sm">
              {label}
            </StatusPill>
          )
        },
      }),
    ]),

    filters: [
      {
        key: 'line',
        label: 'Line',
        options: Object.values(INSURANCE_LINES).map((line) => ({
          value: line,
          label: LINE_LABELS[line],
        })),
      },
      {
        key: 'kind',
        label: 'Field type',
        options: Object.entries(BENEFIT_KIND_LABELS).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'section',
        label: 'Section',
        options: sections.map((section) => ({ value: section, label: section })),
      },
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
      },
    ],

    sortable: ['label', 'section', 'order', 'products'],
    defaultSort: { field: 'order', direction: 'asc' },
    searchPlaceholder: 'Search benefits',

    // A benefit no product carries is a column the sheet will never print.
    stripeMapping: (row) => (mappedCount(input, row) === 0 ? 'attn' : undefined),

    load: async (query) => localPage(input.benefitItems, spec, query),

    empty: {
      title: 'No benefits in the catalogue',
      explanation:
        'A benefit is one row of a comparison sheet — sum insured, room rent, waiting period. Adding one here lets any product of that line carry it, with the reading taken off the brochure.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.label,
    drawerSubtitle: (row) => `${LINE_LABELS[row.line]} · ${row.section}`,
    renderDrawer: (row) => <BenefitDrawer key={row.id} item={row} />,
  }
}
