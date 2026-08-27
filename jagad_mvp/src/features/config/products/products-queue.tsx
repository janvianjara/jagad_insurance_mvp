import { dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import type { QueueConfig } from '../../../components/WorkQueue'
import { INSURANCE_LINES } from '../../../data/repo'
import { LINE_LABELS, localPage } from '../shared'
import type {
  ConfigBenefitMap,
  ConfigChecklist,
  ConfigCompany,
  ConfigProduct,
  LocalListSpec,
} from '../shared'
import { ProductDrawer } from './ProductDrawer'

export type ProductsQueueInput = {
  readonly products: readonly ConfigProduct[]
  readonly companies: readonly ConfigCompany[]
  readonly benefitMaps: readonly ConfigBenefitMap[]
  readonly checklists: readonly ConfigChecklist[]
}

function companyName(input: ProductsQueueInput, product: ConfigProduct): string {
  return (
    input.companies.find((company) => company.id === product.companyId)?.shortName ??
    'A company no longer on file'
  )
}

function mappedBenefits(input: ProductsQueueInput, product: ConfigProduct): number {
  return input.benefitMaps.filter((row) => row.productId === product.id).length
}

/** The product's own checklists, not the company-wide ones it otherwise inherits. */
function ownChecklists(input: ProductsQueueInput, product: ConfigProduct): number {
  return input.checklists.filter((entry) => entry.productId === product.id).length
}

const listSpec = (input: ProductsQueueInput): LocalListSpec<ConfigProduct> => ({
  search: [(row) => row.name, (row) => row.code, (row) => companyName(input, row)],
  filters: {
    companyId: (row) => row.companyId,
    line: (row) => row.line,
    status: (row) => (row.active ? 'active' : 'inactive'),
  },
  sorts: {
    name: (row) => row.name,
    code: (row) => row.code,
    company: (row) => companyName(input, row),
    benefits: (row) => mappedBenefits(input, row),
  },
})

/**
 * The product list — plan §5, "/config/products: + policy→benefit map (FR-05.7)".
 *
 * A product is a company's named policy, so the company filter is the one an
 * admin reaches for first: it is how the sheet for "everything we sell of Niva
 * Bupa" is assembled. The benefit map and the document checklist are the
 * product's detail, and both live in the drawer.
 */
export function productsQueue(input: ProductsQueueInput): QueueConfig<ConfigProduct> {
  const column = dataTableColumns<ConfigProduct>()
  const spec = listSpec(input)

  return {
    key: 'config-products',
    title: 'Products',
    description:
      'Each company’s named policies, with the benefits their comparison sheet carries and the documents they ask for.',
    noun: 'product',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('name', { header: 'Product' }),
      column.accessor('code', { header: 'Code' }),
      column.accessor((row) => companyName(input, row), { id: 'company', header: 'Company' }),
      column.accessor((row) => LINE_LABELS[row.line], {
        id: 'line',
        header: 'Line',
        enableSorting: false,
        cell: (info) => <Badge tone="neutral">{String(info.getValue())}</Badge>,
      }),
      column.accessor((row) => mappedBenefits(input, row), {
        id: 'benefits',
        header: 'Benefits mapped',
      }),
      column.accessor(
        (row) => (ownChecklists(input, row) > 0 ? 'Own checklist' : 'Company checklist'),
        { id: 'checklist', header: 'Documents', enableSorting: false },
      ),
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
        key: 'companyId',
        label: 'Company',
        options: input.companies.map((company) => ({
          value: company.id,
          label: company.shortName,
        })),
      },
      {
        key: 'line',
        label: 'Line',
        options: Object.values(INSURANCE_LINES).map((line) => ({
          value: line,
          label: LINE_LABELS[line],
        })),
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

    sortable: ['name', 'code', 'company', 'benefits'],
    defaultSort: { field: 'name', direction: 'asc' },
    searchPlaceholder: 'Search products',

    // A product with no benefit mapped cannot be compared against anything.
    stripeMapping: (row) => (mappedBenefits(input, row) === 0 ? 'attn' : undefined),

    load: async (query) => localPage(input.products, spec, query),

    empty: {
      title: 'No products yet',
      explanation:
        'A product is one company’s named policy — Optima Secure, Jeevan Anand. Adding one makes it quotable, and its benefit map is what the comparison sheet prints.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.name,
    drawerSubtitle: (row) => `${companyName(input, row)} · ${LINE_LABELS[row.line]}`,
    renderDrawer: (row) => <ProductDrawer key={row.id} product={row} />,
  }
}
