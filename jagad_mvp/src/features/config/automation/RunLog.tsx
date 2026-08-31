import { useSearchParams } from 'react-router'
import { DataTable, EmptyState, Skeleton, dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import { Button } from '../../../ui/Button'
import { DateTime } from '../../../ui/type'
import { Field, Select } from '../../../ui/form'
import type { RecipeRun } from '../../../data/repo'
import { DECISION_LABELS, DECISION_TONES } from './run-stats'
import layout from '../shared/config-layout.module.css'
import styles from './automation.module.css'

/**
 * The run log — FR-21.5, "every automated action traces to recipe + trigger".
 *
 * This is the proof, and it is the only surface in the product that can give it.
 * The audit trail shows events; it cannot show that a recipe was the reason for
 * one, and it has nothing at all to say about the runs that decided NOT to act —
 * which are the interesting half, because "why was nobody told?" is the question
 * somebody opens this screen to ask.
 *
 * Every row therefore reads as a sentence: this recipe, at this version, on this
 * trigger, about this record, decided this, because of this. The reason is the
 * engine's own words, rendered unedited. Nothing here summarises a machine's
 * refusal into a status word.
 *
 * ## Why the filters are in the URL and the table is not a `<WorkQueue>`
 *
 * The section itself is a URL parameter, and `<WorkQueue>` writes the whole
 * search string from its own state — it would drop `tab=runs` the moment
 * somebody filtered, and bounce them back to the recipe list. So the two
 * filters this log needs are read and written here, `tab` and all, which keeps
 * the constitution's promise that the view is reconstructible from its URL
 * without the queue component fighting the section nav for the same six names.
 */

const ANY = ''

const OUTCOMES = [
  { value: 'fired', label: 'Fired' },
  { value: 'skipped', label: 'Declined' },
  { value: 'refused', label: 'Refused' },
]

export type RunLogProps = {
  readonly runs: readonly RecipeRun[]
  readonly loading: boolean
  readonly error: Error | null
  readonly onRetry: () => void
  /** Recipe keys offered in the filter, whether or not they have runs. */
  readonly recipeKeys: readonly string[]
  readonly labelFor: (recipeKey: string) => string
}

export function RunLog({
  runs,
  loading,
  error,
  onRetry,
  recipeKeys,
  labelFor,
}: RunLogProps) {
  const [params, setParams] = useSearchParams()
  const recipe = params.get('recipe') ?? ANY
  const outcome = params.get('outcome') ?? ANY

  function narrow(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value === ANY) next.delete(key)
    else next.set(key, value)
    setParams(next)
  }

  const shown = runs.filter(
    (run) =>
      (recipe === ANY || run.recipeKey === recipe) &&
      (outcome === ANY || run.decision === outcome),
  )

  const column = dataTableColumns<RecipeRun>()
  const columns = column.columns([
    column.accessor((row) => row.clockAt, {
      id: 'when',
      header: 'When',
      cell: (info) => <DateTime value={String(info.getValue())} mode="datetime" />,
    }),
    column.accessor((row) => labelFor(row.recipeKey), {
      id: 'recipe',
      header: 'Recipe',
      cell: (info) => (
        <span className={styles.runRecipe}>
          <span>{String(info.getValue())}</span>
          <span className={layout.mono}>{`${info.row.original.recipeKey} · v${info.row.original.recipeVersion}`}</span>
        </span>
      ),
    }),
    column.accessor('trigger', {
      header: 'Trigger',
      cell: (info) => (
        <Badge tone="neutral" caps>
          {String(info.getValue())}
        </Badge>
      ),
    }),
    column.accessor(
      (row) => (row.subjectId === null ? '' : `${row.subjectEntity} ${row.subjectId}`),
      {
        id: 'subject',
        header: 'About',
        cell: (info) => {
          const row = info.row.original
          if (row.subjectId === null) return <span className={layout.muted}>No record</span>
          return (
            <span className={styles.runSubject}>
              <span className={layout.muted}>{row.subjectEntity}</span>
              {/* The store's own id rather than a systemNo: a run is keyed on
                  the record the event carried, and dressing an internal id as a
                  document number would be a number nobody can look up. */}
              <span className={layout.mono}>{row.subjectId}</span>
            </span>
          )
        },
      },
    ),
    column.accessor('decision', {
      header: 'Outcome',
      cell: (info) => {
        const decision = info.row.original.decision
        return (
          <StatusPill tone={DECISION_TONES[decision]} size="sm">
            {DECISION_LABELS[decision]}
          </StatusPill>
        )
      },
    }),
    column.accessor('reason', {
      header: 'Because',
      enableSorting: false,
      cell: (info) => <p className={styles.runReason}>{String(info.getValue())}</p>,
    }),
  ])

  return (
    <div className={layout.body}>
      <p className={styles.hint}>
        {
          'Every evaluation the engine has made, including the ones that decided not to act. A run names the recipe that ran, the version it ran under, the event that triggered it and the record it was about — which is what makes an automated action traceable rather than merely visible.'
        }
      </p>

      <div className={styles.filters}>
        <Field label="Recipe">
          <Select
            value={recipe}
            options={[
              { value: ANY, label: 'Every recipe' },
              ...recipeKeys.map((key) => ({ value: key, label: labelFor(key) })),
            ]}
            onChange={(event) => narrow('recipe', event.target.value)}
          />
        </Field>
        <Field label="Outcome">
          <Select
            value={outcome}
            options={[{ value: ANY, label: 'Every outcome' }, ...OUTCOMES]}
            onChange={(event) => narrow('outcome', event.target.value)}
          />
        </Field>
        <p className={styles.count}>
          {shown.length === runs.length
            ? `${runs.length} run${runs.length === 1 ? '' : 's'}`
            : `${shown.length} of ${runs.length} runs`}
        </p>
      </div>

      {error ? (
        <EmptyState
          variant="error"
          title="The run log could not be read"
          explanation={error.message}
          action={
            <Button variant="primary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      ) : loading ? (
        <div aria-busy="true" className={layout.stack}>
          <Skeleton width="40ch" />
          <Skeleton width="52ch" />
          <Skeleton width="46ch" />
        </div>
      ) : (
        <DataTable
          data={[...shown]}
          columns={columns}
          getRowId={(row) => row.id}
          label="Automation run log"
          empty={
            runs.length === 0 ? (
              <EmptyState
                title="Nothing has run yet"
                explanation="A run appears here the moment a recipe's trigger fires or the clock finds something due. Nothing is written by hand: every row is the engine recording what it did and why."
              />
            ) : (
              <EmptyState
                title="No runs match this filter"
                explanation="Widen the recipe or the outcome. Declined and refused runs are recorded as carefully as the ones that fired, so an empty view here usually means the filter rather than the engine."
              />
            )
          }
        />
      )}
    </div>
  )
}
