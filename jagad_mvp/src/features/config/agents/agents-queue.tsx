import { dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import type { QueueConfig } from '../../../components/WorkQueue'
import { localPage, readPercent } from '../shared'
import type { ConfigAgency, ConfigAgent, LocalListSpec } from '../shared'
import { AgentDrawer } from './AgentDrawer'

export type AgentsQueueInput = {
  readonly agents: readonly ConfigAgent[]
  readonly agencies: readonly ConfigAgency[]
}

function agencyName(input: AgentsQueueInput, agent: ConfigAgent): string {
  return (
    input.agencies.find((agency) => agency.id === agent.agencyId)?.name ??
    'An agency no longer on file'
  )
}

function parentName(input: AgentsQueueInput, agent: ConfigAgent): string {
  if (!agent.parentAgentId) return 'Reports to nobody'
  return (
    input.agents.find((candidate) => candidate.id === agent.parentAgentId)?.name ??
    'An agent no longer on file'
  )
}

const listSpec = (input: AgentsQueueInput): LocalListSpec<ConfigAgent> => ({
  search: [(row) => row.name, (row) => row.code, (row) => row.mobile, (row) => row.email],
  filters: {
    agencyId: (row) => row.agencyId,
    role: (row) => (row.parentAgentId ? 'sub_agent' : 'agent'),
    grant: (row) => (row.canGrantSubAgents ? 'granted' : 'not_granted'),
    directUpdates: (row) => (row.directUpdatesEnabled ? 'on' : 'off'),
    status: (row) => (row.active ? 'active' : 'inactive'),
  },
  sorts: {
    name: (row) => row.name,
    code: (row) => row.code,
    agency: (row) => agencyName(input, row),
    share: (row) => row.sharePercentBp,
  },
})

/**
 * The agent list — FR-07.3a, canvas 6.4: "% set, sub-agent grant, cap,
 * direct-updates toggle".
 *
 * A sub-agent is the same record with a parent filled in, so the reporting line
 * is a column here rather than a second queue. Every percentage on this screen is
 * a percentage: nothing multiplies one, and no amount appears anywhere.
 */
export function agentsQueue(input: AgentsQueueInput): QueueConfig<ConfigAgent> {
  const column = dataTableColumns<ConfigAgent>()
  const spec = listSpec(input)

  return {
    key: 'config-agents',
    title: 'Agents',
    noun: 'agent',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('name', { header: 'Agent' }),
      column.accessor('code', { header: 'Code' }),
      column.accessor((row) => agencyName(input, row), { id: 'agency', header: 'Agency' }),
      column.accessor((row) => parentName(input, row), {
        id: 'reportsTo',
        header: 'Reports to',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return label === 'Reports to nobody' ? (
            <Badge tone="neutral">Agent</Badge>
          ) : (
            <Badge tone="info">Sub-agent of {label}</Badge>
          )
        },
      }),
      column.accessor((row) => readPercent(row.sharePercentBp), {
        id: 'share',
        header: 'Own share',
      }),
      column.accessor((row) => (row.canGrantSubAgents ? 'Granted' : 'Not granted'), {
        id: 'grant',
        header: 'Sub-agents',
        enableSorting: false,
      }),
      column.accessor((row) => readPercent(row.subAgentCapPercentBp), {
        id: 'cap',
        header: 'Sub-agent cap',
        enableSorting: false,
      }),
      column.accessor((row) => (row.directUpdatesEnabled ? 'On' : 'Off'), {
        id: 'directUpdates',
        header: 'Direct updates',
        enableSorting: false,
      }),
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
        key: 'agencyId',
        label: 'Agency',
        options: input.agencies.map((agency) => ({ value: agency.id, label: agency.name })),
      },
      {
        key: 'role',
        label: 'Reporting',
        options: [
          { value: 'agent', label: 'Agent' },
          { value: 'sub_agent', label: 'Sub-agent' },
        ],
      },
      {
        key: 'grant',
        label: 'Sub-agent grant',
        options: [
          { value: 'granted', label: 'Granted' },
          { value: 'not_granted', label: 'Not granted' },
        ],
      },
      {
        key: 'directUpdates',
        label: 'Direct updates',
        options: [
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ],
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

    sortable: ['name', 'code', 'agency', 'share'],
    defaultSort: { field: 'name', direction: 'asc' },
    searchPlaceholder: 'Search agents',

    // An agent on nothing has no arrangement recorded; the chain has nowhere to
    // start when their business is booked.
    stripeMapping: (row) => (row.sharePercentBp === 0 ? 'attn' : undefined),

    load: async (query) => localPage(input.agents, spec, query),

    empty: {
      title: 'No agents yet',
      explanation:
        'An agent sources business under one agency and takes an agreed share of the commission on it. A sub-agent is the same record reporting to an agent, with a share carved out of theirs.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.name,
    drawerSubtitle: (row) => `${row.code} · ${agencyName(input, row)}`,
    renderDrawer: (row) => <AgentDrawer key={row.id} agent={row} />,
  }
}
