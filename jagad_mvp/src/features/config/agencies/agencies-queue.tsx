import { dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import type { QueueConfig } from '../../../components/WorkQueue'
import { AGENCY_TYPES } from '../../../data/repo'
import { AGENCY_TYPE_LABELS, localPage } from '../shared'
import type {
  ConfigAgency,
  ConfigAgencyScope,
  ConfigCompany,
  ConfigProduct,
  LocalListSpec,
} from '../shared'
import { AgencyDrawer } from './AgencyDrawer'

export type AgenciesQueueInput = {
  readonly agencies: readonly ConfigAgency[]
  readonly companies: readonly ConfigCompany[]
  readonly products: readonly ConfigProduct[]
  readonly scopes: readonly ConfigAgencyScope[]
}

function scopeCounts(input: AgenciesQueueInput, agency: ConfigAgency) {
  const rows = input.scopes.filter((scope) => scope.agencyId === agency.id && scope.active)
  return {
    policies: rows.length,
    rated: rows.filter((scope) => scope.commissionPercentBp !== null).length,
  }
}

function companyNames(input: AgenciesQueueInput, agency: ConfigAgency): string {
  return agency.companyIds
    .map(
      (companyId) =>
        input.companies.find((company) => company.id === companyId)?.shortName ?? 'Unknown',
    )
    .join(', ')
}

const listSpec = (input: AgenciesQueueInput): LocalListSpec<ConfigAgency> => ({
  search: [(row) => row.name, (row) => row.code, (row) => row.city],
  filters: {
    type: (row) => row.type,
    // A Broker holds several companies at once, so this facet is multi-valued.
    companyId: (row) => row.companyIds,
    status: (row) => (row.active ? 'active' : 'inactive'),
  },
  sorts: {
    name: (row) => row.name,
    code: (row) => row.code,
    companies: (row) => row.companyIds.length,
    policies: (row) => scopeCounts(input, row).policies,
  },
})

/**
 * The Agency Master — FR-07, canvas 6.3.
 *
 * The type filter is the one this queue exists for: an Individual agency is one
 * appointment with one insurer, a Broker is the vendor channel several arrive
 * through, and the two are read differently. The company filter is multi-valued
 * for the same reason — "which agencies can place with Bajaj Allianz" has to
 * find the broker that holds it alongside three others.
 */
export function agenciesQueue(input: AgenciesQueueInput): QueueConfig<ConfigAgency> {
  const column = dataTableColumns<ConfigAgency>()
  const spec = listSpec(input)

  return {
    key: 'config-agencies',
    title: 'Agencies',
    noun: 'agency',
    nounPlural: 'agencies',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('name', { header: 'Agency' }),
      column.accessor('code', { header: 'Code' }),
      column.accessor((row) => AGENCY_TYPE_LABELS[row.type], {
        id: 'type',
        header: 'Type',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return <Badge tone={label === 'Broker' ? 'info' : 'neutral'}>{label}</Badge>
        },
      }),
      column.accessor((row) => companyNames(input, row), {
        id: 'companies',
        header: 'Companies',
      }),
      column.accessor((row) => scopeCounts(input, row).policies, {
        id: 'policies',
        header: 'Policies in scope',
      }),
      column.accessor(
        (row) => {
          const { policies, rated } = scopeCounts(input, row)
          return `${rated} of ${policies}`
        },
        { id: 'rates', header: 'Rates agreed', enableSorting: false },
      ),
      column.accessor('city', { header: 'City', enableSorting: false }),
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
        key: 'type',
        label: 'Type',
        options: Object.values(AGENCY_TYPES).map((type) => ({
          value: type,
          label: AGENCY_TYPE_LABELS[type],
        })),
      },
      {
        key: 'companyId',
        label: 'Company',
        options: input.companies.map((company) => ({
          value: company.id,
          label: company.shortName,
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

    sortable: ['name', 'code', 'companies', 'policies'],
    defaultSort: { field: 'name', direction: 'asc' },
    searchPlaceholder: 'Search agencies',

    // Lime is "needs a person": a policy in scope with no rate agreed is an
    // appointment nobody has finished, and the commission chain will stall on it.
    stripeMapping: (row) => {
      const { policies, rated } = scopeCounts(input, row)
      return policies === 0 || rated < policies ? 'attn' : undefined
    },

    load: async (query) => localPage(input.agencies, spec, query),

    empty: {
      title: 'No agencies yet',
      explanation:
        'An agency is one appointment: the code an insurer issued, the companies it covers, the policies it may place and the rate that came with each. Placement offers nothing until one exists.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.name,
    drawerSubtitle: (row) => `${AGENCY_TYPE_LABELS[row.type]} · ${row.code}`,
    renderDrawer: (row) => <AgencyDrawer key={row.id} agency={row} />,
  }
}
