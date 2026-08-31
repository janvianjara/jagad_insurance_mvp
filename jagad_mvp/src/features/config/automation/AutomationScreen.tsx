import { useSearchParams } from 'react-router'
import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { EmptyState, Skeleton } from '../../../ui/data'
import { SCHEDULES } from '../../../data/automation'
import { useSessionStore } from '../../../app/store'
import { SectionNav, useEnsureConfig } from '../shared'
import type { Section } from '../shared'
import { useAutomationStore } from './automation-store'
import { useEnsureAutomation } from './use-automation'
import { useAutomationEngine, useRecipeRuns } from './use-runs'
import { activityByRecipe } from './run-stats'
import { automationQueue } from './automation-queue'
import { DemoClock } from './DemoClock'
import { ReadyToSend } from './ReadyToSend'
import { RunLog } from './RunLog'
import { Schedules } from './Schedules'
import layout from '../shared/config-layout.module.css'

/**
 * `/config/automation` — the recipe library, and the engine running it.
 *
 * The screen used to answer one question: what is each rule configured to do?
 * That was the whole of it, because nothing subscribed to a trigger and nothing
 * evaluated a date, so "active" was a claim no surface could check. Three
 * sections now, in the order somebody reads them:
 *
 *   Recipes       what the rules are, and — new — when each last fired, how many
 *                 times, and how many times it declined.
 *   Run log       every evaluation, with the reason it decided what it did. This
 *                 is FR-21.5, and it is the most persuasive thing here: an
 *                 automated action that traces to a recipe and a trigger.
 *   Ready to send what the engine has prepared and a person has not released.
 *
 * Recipes is the default section and the only one hosting a `<WorkQueue>`, for
 * the reason `SectionNav` gives: the queue writes the whole search string from
 * its own state, so a section parameter it does not know about would be dropped
 * the moment somebody filtered. The other two own their own URL parameters and
 * keep `tab` alongside them.
 */

const RECIPES = 'recipes'

const SECTIONS: readonly Section[] = [
  { id: RECIPES, label: 'Recipes' },
  { id: 'runs', label: 'Run log' },
  { id: 'outbox', label: 'Ready to send' },
]

export default function AutomationScreen() {
  const automation = useEnsureAutomation()
  const config = useEnsureConfig()
  const [params] = useSearchParams()
  const section = params.get('tab') ?? RECIPES

  const revision = useAutomationStore((state) => state.revision)
  const recipes = useAutomationStore((state) => state.recipes)
  const runtime = useAutomationEngine()
  const runs = useRecipeRuns(revision)
  const actorId = useSessionStore((state) => state.user?.id ?? 'unknown')

  const nav = <SectionNav sections={SECTIONS} defaultId={RECIPES} label="Automation sections" />

  if (automation.status === 'error') {
    return (
      <>
        <PageHeader title="Automation" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The recipes could not be read"
            explanation={automation.error?.message ?? 'The configuration repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!automation.ready || !config.ready) {
    return (
      <>
        <PageHeader title="Automation" actions={nav} />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  const rows = runs.data?.rows ?? []
  const activity = activityByRecipe(rows)

  /*
   * The three sweeps the clock owns are offered in the log's filter beside the
   * configured recipes. They have no recipe row — they carry no parameters, so
   * there would be nothing on it — but they write runs like everything else, and
   * a filter that could not name them would leave those runs unreachable.
   */
  const scheduleLabels = Object.fromEntries(
    SCHEDULES.map((schedule) => [schedule.key, schedule.label]),
  )
  const recipeLabels = Object.fromEntries(recipes.map((recipe) => [recipe.key, recipe.label]))
  const labelFor = (key: string) => recipeLabels[key] ?? scheduleLabels[key] ?? key
  const filterKeys = [
    ...recipes.map((recipe) => recipe.key),
    ...SCHEDULES.map((schedule) => schedule.key),
  ]

  if (section === 'runs') {
    return (
      <>
        <PageHeader title="Run log" actions={nav} />
        <DemoClock runtime={runtime} onTicked={() => runs.reload()} />
        <RunLog
          runs={rows}
          loading={runs.isLoading}
          error={runs.error}
          onRetry={() => runs.reload()}
          recipeKeys={filterKeys}
          labelFor={labelFor}
        />
      </>
    )
  }

  if (section === 'outbox') {
    return (
      <>
        <PageHeader title="Ready to send" actions={nav} />
        <ReadyToSend runtime={runtime} actorId={actorId} onChanged={() => runs.reload()} />
      </>
    )
  }

  return (
    <WorkQueue
      key={`automation-${revision}`}
      config={automationQueue({ recipes, activity })}
      actions={nav}
    >
      <Schedules schedules={SCHEDULES} activity={activity} />
    </WorkQueue>
  )
}
