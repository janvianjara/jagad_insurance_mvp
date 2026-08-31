import { dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import { DateTime } from '../../../ui/type'
import type { QueueConfig } from '../../../components/WorkQueue'
import type { Recipe } from '../../../data/repo'
import { localPage } from '../shared'
import type { LocalListSpec } from '../shared'
import { RECIPE_NOTES, parameterLabel } from './recipe-readers'
import { RecipeDrawer } from './RecipeDrawer'
import { activityOf } from './run-stats'
import type { RecipeActivity } from './run-stats'
import styles from './automation.module.css'

export type AutomationQueueInput = {
  readonly recipes: readonly Recipe[]
  /** What each recipe has actually done, folded from the run ledger. */
  readonly activity: Readonly<Record<string, RecipeActivity>>
}

/** A recipe with a name or a key left blank cannot do what it says it does. */
function unsetParameters(recipe: Recipe): readonly string[] {
  return Object.entries(recipe.parameters)
    .filter(([, value]) => typeof value === 'string' && value.trim() === '')
    .map(([key]) => key)
}

function parameterSummary(recipe: Recipe): string {
  const keys = Object.keys(recipe.parameters)
  if (keys.length === 0) return 'None'
  return keys.map(parameterLabel).join(' · ')
}

function listSpecFor(input: AutomationQueueInput): LocalListSpec<Recipe> {
  return {
    search: [(row) => row.label, (row) => row.key, (row) => row.trigger],
    filters: {
      trigger: (row) => row.trigger,
      status: (row) => (row.active ? 'running' : 'stopped'),
      traced: (row) => (RECIPE_NOTES[row.key] ? 'traced' : 'untraced'),
      // The filter a client reaches for after the first demo: which of these has
      // ever actually done anything?
      activity: (row) => (activityOf(input.activity, row.key).total > 0 ? 'run' : 'never'),
    },
    sorts: {
      label: (row) => row.label,
      trigger: (row) => row.trigger,
      version: (row) => row.version,
      updated: (row) => row.updatedAt,
      lastFired: (row) => activityOf(input.activity, row.key).lastFiredAt ?? '',
      runs: (row) => activityOf(input.activity, row.key).total,
    },
  }
}

/**
 * The recipe list, as a configured `<WorkQueue>`.
 *
 * The row says what the rule is and which event it hangs off; the parameters an
 * admin came here to change are the drawer, because that is where a record's
 * detail belongs and because two queues on one screen would fight over the same
 * six reserved URL parameters.
 */
export function automationQueue(input: AutomationQueueInput): QueueConfig<Recipe> {
  const column = dataTableColumns<Recipe>()
  const triggers = [...new Set(input.recipes.map((recipe) => recipe.trigger))].toSorted()

  return {
    key: 'config-automation',
    title: 'Automation',
    noun: 'recipe',
    nounPlural: 'recipes',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('label', { header: 'Rule' }),
      column.accessor('trigger', {
        header: 'Fires on',
        cell: (info) => (
          <Badge tone="neutral" caps>
            {String(info.getValue())}
          </Badge>
        ),
      }),
      column.accessor((row) => parameterSummary(row), {
        id: 'parameters',
        header: 'Parameters',
        enableSorting: false,
      }),
      column.accessor('version', { header: 'Version' }),
      column.accessor((row) => activityOf(input.activity, row.key).lastFiredAt ?? '', {
        id: 'lastFired',
        header: 'Last fired',
        cell: (info) => {
          const value = String(info.getValue())
          if (value === '') {
            const seen = activityOf(input.activity, info.row.original.key)
            return (
              <span className={styles.never}>
                {seen.total === 0 ? 'Never' : 'Reached, never fired'}
              </span>
            )
          }
          return <DateTime value={value} mode="datetime" />
        },
      }),
      column.accessor((row) => activityOf(input.activity, row.key).total, {
        id: 'runs',
        header: 'Runs',
        cell: (info) => {
          const seen = activityOf(input.activity, info.row.original.key)
          if (seen.total === 0) return <span className={styles.never}>0</span>
          return (
            <span className={styles.tally}>
              <Badge tone="ok">{`${seen.fired} fired`}</Badge>
              {seen.skipped === 0 ? null : <Badge tone="attn">{`${seen.skipped} declined`}</Badge>}
              {seen.refused === 0 ? null : <Badge tone="bad">{`${seen.refused} refused`}</Badge>}
            </span>
          )
        },
      }),
      column.accessor((row) => row.updatedAt, {
        id: 'updated',
        header: 'Last changed',
        cell: (info) => <DateTime value={String(info.getValue())} />,
      }),
      column.accessor((row) => (RECIPE_NOTES[row.key] ? 'Traced' : 'Not read yet'), {
        id: 'traced',
        header: 'Read by',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return <Badge tone={label === 'Traced' ? 'ok' : 'idle'}>{label}</Badge>
        },
      }),
      column.accessor((row) => (row.active ? 'Running' : 'Stopped'), {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return (
            <StatusPill tone={label === 'Running' ? 'ok' : 'idle'} size="sm">
              {label}
            </StatusPill>
          )
        },
      }),
    ]),

    filters: [
      {
        key: 'trigger',
        label: 'Fires on',
        options: triggers.map((trigger) => ({ value: trigger, label: trigger })),
      },
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'running', label: 'Running' },
          { value: 'stopped', label: 'Stopped' },
        ],
      },
      {
        key: 'traced',
        label: 'Read by',
        options: [
          { value: 'traced', label: 'A screen reads it' },
          { value: 'untraced', label: 'Not read yet' },
        ],
      },
      {
        key: 'activity',
        label: 'Activity',
        options: [
          { value: 'run', label: 'Has run' },
          { value: 'never', label: 'Never run' },
        ],
      },
    ],

    sortable: ['label', 'trigger', 'version', 'updated', 'lastFired', 'runs'],
    defaultSort: { field: 'trigger', direction: 'asc' },
    searchPlaceholder: 'Search recipes',

    // Lime is "needs a person": a running rule with a blank name or key will
    // refuse when it fires, and nobody finds out until it does. A rule the engine
    // has reached and that refused every time is the same kind of trouble.
    stripeMapping: (row) => {
      if (row.active && unsetParameters(row).length > 0) return 'attn'
      const seen = activityOf(input.activity, row.key)
      return seen.refused > 0 && seen.fired === 0 ? 'attn' : undefined
    },

    load: async (query) => localPage(input.recipes, listSpecFor(input), query),

    empty: {
      title: 'No recipes configured',
      explanation:
        'A recipe is a rule the platform runs when something happens — route this inquiry, open that renewal, tell the customer their claim moved. The rules are configuration rather than code, which is what lets the agency change a turnaround or an escalation recipient without a release.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.label,
    drawerSubtitle: (row) => `Fires on ${row.trigger}`,
    renderDrawer: (row) => (
      <RecipeDrawer key={row.id} recipe={row} activity={activityOf(input.activity, row.key)} />
    ),
  }
}
