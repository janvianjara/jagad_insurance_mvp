import { dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import type { QueueConfig } from '../../../components/WorkQueue'
import { INSURANCE_LINES } from '../../../data/repo'
import { LINE_LABELS, localPage } from '../shared'
import type {
  ConfigCompany,
  ConfigCompanyContact,
  ConfigProduct,
  LocalListSpec,
} from '../shared'
import { CompanyDrawer } from './CompanyDrawer'

export type CompaniesQueueInput = {
  readonly companies: readonly ConfigCompany[]
  readonly contacts: readonly ConfigCompanyContact[]
  readonly products: readonly ConfigProduct[]
}

function countsFor(input: CompaniesQueueInput, company: ConfigCompany) {
  return {
    contacts: input.contacts.filter((contact) => contact.companyId === company.id).length,
    products: input.products.filter((product) => product.companyId === company.id).length,
  }
}

const listSpec = (input: CompaniesQueueInput): LocalListSpec<ConfigCompany> => ({
  search: [(row) => row.name, (row) => row.shortName, (row) => row.claimsEmail],
  filters: {
    // A company is appointed per line, so the line filter is how an admin finds
    // the general arm of a group without meeting the life arm on the way. The
    // row holds several lines at once, which is what a multi-valued facet is for.
    line: (row) => row.lines,
    status: (row) => (row.active ? 'active' : 'inactive'),
  },
  sorts: {
    name: (row) => row.name,
    shortName: (row) => row.shortName,
    products: (row) => countsFor(input, row).products,
    contacts: (row) => countsFor(input, row).contacts,
  },
})

/**
 * The company list — plan §5, "/config/companies: per line; contacts per
 * category".
 *
 * The `line` filter matches on a joined string rather than one value because a
 * general insurer writes several lines off one licence; `localPage` compares the
 * selected value against the cell, so the cell carries every line the company
 * holds and a selection matches when it appears in it.
 */
export function companiesQueue(input: CompaniesQueueInput): QueueConfig<ConfigCompany> {
  const column = dataTableColumns<ConfigCompany>()
  const spec = listSpec(input)

  return {
    key: 'config-companies',
    title: 'Companies',
    noun: 'company',
    nounPlural: 'companies',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('name', { header: 'Company' }),
      column.accessor('shortName', { header: 'Short name' }),
      column.accessor((row) => row.lines.map((line) => LINE_LABELS[line]).join(', '), {
        id: 'lines',
        header: 'Lines',
        enableSorting: false,
        cell: (info) => (
          <span>
            {String(info.getValue())
              .split(', ')
              .filter((label) => label !== '')
              .map((label) => (
                <Badge key={label} tone="neutral">
                  {label}
                </Badge>
              ))}
          </span>
        ),
      }),
      column.accessor((row) => countsFor(input, row).products, {
        id: 'products',
        header: 'Products',
      }),
      column.accessor((row) => countsFor(input, row).contacts, {
        id: 'contacts',
        header: 'Contacts',
      }),
      column.accessor('claimsEmail', { header: 'Claims desk', enableSorting: false }),
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
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
      },
    ],

    sortable: ['name', 'shortName', 'products', 'contacts'],
    defaultSort: { field: 'name', direction: 'asc' },
    searchPlaceholder: 'Search companies',

    // Lime is "needs a person": a company with no contact leaves the claims desk
    // with an email address and nobody to phone.
    stripeMapping: (row) => (countsFor(input, row).contacts === 0 ? 'attn' : undefined),

    load: async (query) => localPage(input.companies, spec, query),

    empty: {
      title: 'No companies yet',
      explanation:
        'A company is one insurer, appointed for the lines it writes. Adding one makes it available across quotation, placement and claims, with the contacts recorded against it.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.name,
    drawerSubtitle: (row) => row.lines.map((line) => LINE_LABELS[line]).join(', '),
    renderDrawer: (row) => <CompanyDrawer key={row.id} company={row} />,
  }
}
