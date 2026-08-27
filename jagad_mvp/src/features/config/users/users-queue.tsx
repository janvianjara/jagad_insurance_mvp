import { Badge, StatusPill } from '../../../ui/signal'
import { dataTableColumns } from '../../../ui/data'
import type { QueueConfig } from '../../../components/WorkQueue'
import type { Team } from '../../../data/repo'
import { TWO_FACTOR_UNSET, localPage } from '../shared'
import type { ConfigTemplate, ConfigUser, TwoFactorPolicy } from '../shared'
import type { LocalListSpec } from '../shared'
import { UserEditor } from './UserEditor'

export type UsersQueueInput = {
  readonly users: readonly ConfigUser[]
  readonly templates: readonly ConfigTemplate[]
  readonly teams: readonly Team[]
  readonly twoFactor: Readonly<Record<string, TwoFactorPolicy>>
}

const NO_TEAM = 'none'

function templateLabel(input: UsersQueueInput, user: ConfigUser): string {
  return (
    input.templates.find((template) => template.key === user.templateKey)?.label ??
    `${user.templateKey} — no such template`
  )
}

function teamLabel(input: UsersQueueInput, user: ConfigUser): string {
  if (!user.teamId) return 'No team'
  return input.teams.find((team) => team.id === user.teamId)?.name ?? user.teamId
}

function twoFactorLabel(input: UsersQueueInput, user: ConfigUser): string {
  const policy = input.twoFactor[user.templateKey] ?? TWO_FACTOR_UNSET
  if (user.twoFactorEnrolled) return 'Enrolled'
  return policy.signIn === 'required' ? 'Required, not enrolled' : 'Not enrolled'
}

const listSpec = (input: UsersQueueInput): LocalListSpec<ConfigUser> => ({
  search: [(row) => row.name, (row) => row.email, (row) => row.mobile, (row) => row.roleLabel],
  filters: {
    template: (row) => row.templateKey,
    team: (row) => row.teamId ?? NO_TEAM,
    status: (row) => (row.active ? 'active' : 'inactive'),
  },
  sorts: {
    name: (row) => row.name,
    email: (row) => row.email,
    template: (row) => templateLabel(input, row),
    team: (row) => teamLabel(input, row),
    status: (row) => row.active,
  },
})

/**
 * The staff list as a configured `<WorkQueue>` — never a table of its own.
 *
 * The rule earns its keep here even though eight rows fit on a screen: the
 * filter names in this object are the ones the URL carries, so "everyone on the
 * back-office template whose account is deactivated" is a link, and the row that
 * opens the editor is the same interaction a person already learned in the
 * inquiry queue.
 */
export function usersQueue(input: UsersQueueInput): QueueConfig<ConfigUser> {
  const column = dataTableColumns<ConfigUser>()
  const spec = listSpec(input)

  return {
    key: 'config-users',
    title: 'Users',
    noun: 'account',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('name', { header: 'Name' }),
      column.accessor('email', { header: 'Email' }),
      column.accessor((row) => templateLabel(input, row), {
        id: 'template',
        header: 'Permission template',
      }),
      column.accessor((row) => teamLabel(input, row), { id: 'team', header: 'Team' }),
      column.accessor((row) => twoFactorLabel(input, row), {
        id: 'twoFactor',
        header: 'Two-factor',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return (
            <Badge
              tone={
                label === 'Enrolled' ? 'ok' : label === 'Required, not enrolled' ? 'attn' : 'neutral'
              }
            >
              {label}
            </Badge>
          )
        },
      }),
      column.accessor((row) => (row.active ? 'Active' : 'Deactivated'), {
        id: 'status',
        header: 'Account',
        cell: (info) => {
          const label = String(info.getValue())
          return <StatusPill tone={label === 'Active' ? 'ok' : 'idle'}>{label}</StatusPill>
        },
      }),
    ]),

    filters: [
      {
        key: 'template',
        label: 'Permission template',
        options: input.templates.map((template) => ({
          value: template.key,
          label: template.label,
        })),
      },
      {
        key: 'team',
        label: 'Team',
        options: [
          ...input.teams.map((team) => ({ value: team.id, label: team.name })),
          { value: NO_TEAM, label: 'No team' },
        ],
      },
      {
        key: 'status',
        label: 'Account',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Deactivated' },
        ],
      },
    ],

    sortable: ['name', 'email', 'template', 'team', 'status'],
    defaultSort: { field: 'name', direction: 'asc' },
    searchPlaceholder: 'Search accounts',

    // Lime is "needs a person": a template key that resolves to nothing grants
    // nothing, so that account is locked out until an admin fixes it.
    stripeMapping: (row) =>
      input.templates.some((template) => template.key === row.templateKey)
        ? row.active
          ? undefined
          : 'cool'
        : 'attn',

    load: async (query) => localPage(input.users, spec, query),

    empty: {
      title: 'No staff accounts yet',
      explanation:
        'Accounts are created here. Each one holds a permission template, which is what decides the screens and records it can reach.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.name,
    drawerSubtitle: (row) => row.roleLabel,
    renderDrawer: (row) => <UserEditor key={row.id} user={row} />,
  }
}
