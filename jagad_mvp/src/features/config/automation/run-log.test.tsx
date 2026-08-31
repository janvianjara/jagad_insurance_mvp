import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { MockRepositories } from '../../../data/mock'
import { startAutomation } from '../../../data/automation'
import type { AutomationRuntime } from '../../../data/automation'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import { useAutomationStore } from './automation-store'
import { activityByRecipe } from './run-stats'
import AutomationScreen from './AutomationScreen'

/**
 * The screen that has to prove the engine runs — FR-21.5.
 *
 * The parameter editor was always testable because it edits a record. This is
 * the harder half and the one the gap analysis was actually about: the screen
 * has to show that a recipe fired, when, and why it declined when it did. So
 * these tests start a real engine against the real fixtures, run one evaluation,
 * and then read the screen — no fabricated run rows anywhere, because a run log
 * fed by a fixture proves nothing about a dispatcher.
 */

let repositories: MockRepositories
let running: AutomationRuntime | null = null

function open(search: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/config/automation${search}`]}>
          <AutomationScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

/** One real evaluation, so the ledger has rows the engine actually wrote. */
async function evaluate() {
  running = startAutomation({
    repositories,
    store: repositories.store,
    nodeId: 'tab-screen-test',
    ignoreQuietHours: true,
  })
  await running.rebind()
  await running.clock.tick()
  await running.dispatcher.settled()
}

beforeEach(() => {
  running?.stop()
  running = null
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useAutomationStore.getState().reset()
  useConfigStore.getState().reset()
})

describe('the run log', () => {
  it('shows what the engine did, with the reason it did it', async () => {
    await evaluate()
    open('?tab=runs')

    const table = await screen.findByRole('grid', { name: 'Automation run log' })
    const rows = within(table).getAllByRole('row')
    // Header plus at least one run: the tick found the renewals and the
    // inquiries past their allowance, which is the whole point of the sweep.
    expect(rows.length).toBeGreaterThan(1)
    expect(table).toHaveTextContent(/turnaround allowance|expiry|consent link/)
  })

  it('filters by outcome, and keeps the section in the URL while it does', async () => {
    await evaluate()
    open('?tab=runs')

    await screen.findByRole('grid', { name: 'Automation run log' })
    const before = screen.getByText(/\d+ runs?$/).textContent

    await userEvent.selectOptions(screen.getByLabelText('Outcome'), 'skipped')

    // Still on the run log — the filter did not bounce the person back to the
    // recipe list, which is what a `<WorkQueue>` here would have done.
    expect(await screen.findByRole('grid', { name: 'Automation run log' })).toBeInTheDocument()
    expect(screen.getByText(/of \d+ runs$/).textContent).not.toBe(before)
  })

  it('says so honestly when nothing has run, rather than showing an empty table', async () => {
    open('?tab=runs')
    expect(await screen.findByText('Nothing has run yet')).toBeInTheDocument()
  })
})

describe('the recipe list, once the engine has run', () => {
  it('reports what each recipe has done instead of only what it is set to do', async () => {
    await evaluate()
    open('')

    const table = await screen.findByRole('grid')
    // The column that did not exist before: a recipe nothing has reached says
    // "Never" rather than looking identical to one that fires hourly.
    expect(within(table).getAllByText('Never').length).toBeGreaterThan(0)
  })

  it('lists the sweeps the clock owns, which have no recipe row at all', async () => {
    await evaluate()
    open('')

    const panel = await screen.findByRole('region', { name: 'Clock schedules' })
    expect(panel).toHaveTextContent('sla.breached')
    expect(panel).toHaveTextContent('task.nudged')
    expect(panel).toHaveTextContent('consent.expired')
  })
})

describe('ready to send', () => {
  it('is honest when no engine is running on the page', async () => {
    open('?tab=outbox')
    expect(await screen.findByText('The engine is not running on this page')).toBeInTheDocument()
  })
})

describe('the activity fold', () => {
  it('counts fires and declines separately, and keeps the newest decline reason', () => {
    const activity = activityByRecipe([
      {
        id: 'run-1',
        idempotencyKey: 'a',
        recipeKey: 'renewal.reminder',
        recipeVersion: 2,
        trigger: 'renewal.due',
        subjectEntity: 'RenewalTask',
        subjectId: 'rnw-1',
        phase: null,
        decision: 'fired',
        reason: 'Prepared a message.',
        emitted: [],
        evaluatedAt: '2026-08-01T10:00:00.000Z',
        clockAt: '2026-08-01T10:00:00.000Z',
        causedBy: 'evt-1',
        chain: ['renewal.reminder'],
      },
      {
        id: 'run-2',
        idempotencyKey: 'b',
        recipeKey: 'renewal.reminder',
        recipeVersion: 2,
        trigger: 'renewal.due',
        subjectEntity: 'RenewalTask',
        subjectId: 'rnw-2',
        phase: null,
        decision: 'skipped',
        reason: 'Consent is "expired".',
        emitted: [],
        evaluatedAt: '2026-08-02T10:00:00.000Z',
        clockAt: '2026-08-02T10:00:00.000Z',
        causedBy: 'evt-2',
        chain: ['renewal.reminder'],
      },
    ])

    const seen = activity['renewal.reminder']
    expect(seen.fired).toBe(1)
    expect(seen.skipped).toBe(1)
    expect(seen.lastFiredAt).toBe('2026-08-01T10:00:00.000Z')
    // The decline is newer than the fire, so it is the reason a row shows.
    expect(seen.lastDeclineReason).toBe('Consent is "expired".')
  })
})
