/**
 * The scenario rig — one way to walk a canvas row end to end.
 *
 * A scenario test is not a component test. It says "sign in as this person, open
 * this address, do what the canvas row says, and see what a person would see",
 * so the rig has to give it the real thing at every layer:
 *
 *   - the real router (`createAppRoutes`, the tree the browser gets), so a
 *     scenario crosses the shell, the permission guard and the URL exactly as
 *     the demo does. A screen mounted on its own proves the screen; it does not
 *     prove that the person could ever reach it;
 *   - the real repositories over the real fixtures, with the latency removed. No
 *     test here imports a fixture and no component ever could;
 *   - a pinned clock, so a countdown reads the same sentence on every run, and
 *     the demo clock can still be pushed forward from inside a test the way it is
 *     pushed forward in front of a client.
 *
 * It is factored from the two module harnesses that came first —
 * `src/features/inquiries/test-harness.tsx` and
 * `src/features/customers/test-harness.tsx` — and keeps their vocabulary
 * (`WHO`, `freshRepositories`, `signIn`) so a reader moving between them is not
 * learning a third dialect. What it adds is the whole router in place of a
 * hand-written `<Routes>`, which is the only way a route-level row can be shown
 * to be reachable.
 *
 * The steps that land after this one (P-13's Composer, P-15's policy entry) need
 * nothing new here: they render their route through `renderScenario` and use the
 * same `confirmAction` and `panel` helpers.
 */

import { configure, render, screen, within } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { RepositoriesProvider } from '../../app/repositories'
import { createAppRoutes } from '../../app/router'
import { resolveAccount, useDrawerStore, useSessionStore } from '../../app/store'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { useNoticesStore } from '../../features/assistant/notices/notices-store'
import { useConfigStore, useMarketStore } from '../../features/config/shared'
import { CustomerClockBase } from '../../features/customers/clock'
import { InquiryClockBase, useInquiryClockStore } from '../../features/inquiries/clock'
import { IconSprite } from '../../ui/Icon'

/**
 * A scenario mounts the whole product — shell, guards, router and every screen on
 * the walk — so the first paint in a worker is an order of magnitude slower than a
 * component test's. Testing Library's one-second default is a timer, not an
 * assertion, and a timer that expires under parallel load reports a fault that is
 * not there. Five seconds is still short enough that a genuinely broken screen
 * fails fast. Scoped to files that import this rig, because Vitest isolates each
 * test file.
 */
configure({ asyncUtilTimeout: 5_000 })

/**
 * The instant the story cast is written against. Every seeded TAT, expiry and
 * renewal date means what it says relative to this and to nothing else.
 */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/** The story cast's staff ids, as `src/data/fixtures/config-seed.ts` sets them. */
export const WHO = {
  vivek: 'usr-vivek-jagad',
  nikunj: 'usr-nikunj-shah',
  kiran: 'usr-kiran-solanki',
  priya: 'usr-priya-desai',
  amit: 'usr-amit-rana',
  sneha: 'usr-sneha-patel',
  nita: 'usr-nita-shah',
  meera: 'usr-meera-joshi',
} as const

/** The walkthrough customer: KYC part-filled, a consent link out and unanswered. */
export const RAKESH = 'cus-rakesh-patel'

/**
 * A clean world: every session-lifetime and feature slice back to its starting
 * state, and a fresh store built from the fixtures.
 *
 * Feature slices are reset here rather than in each test because a scenario
 * crosses features — a config edit made in one row must not be visible to the
 * next — and a rig that left that to the caller would leak on the day somebody
 * forgot.
 */
export function freshRepositories(): MockRepositories {
  useSessionStore.getState().reset()
  useDrawerStore.getState().closeDrawer()
  useInquiryClockStore.getState().reset()
  useNoticesStore.getState().restoreAll()
  useMarketStore.getState().reset()
  useConfigStore.getState().reset()
  window.localStorage.clear()
  return createMockRepositories({ latency: NO_LATENCY, now: () => WALKTHROUGH_NOW })
}

/**
 * Signs a person in before the shell boots.
 *
 * `useSessionBoot` hydrates only when the store is not ready, so pre-hydrating
 * here decides who the scenario is walked as without a click. Switching account
 * mid-scenario is a different act, and has its own helper below.
 */
export async function signIn(repositories: MockRepositories, userId: string): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

export type ScenarioOptions = {
  /** The instant every clock on the mounted screens reads from. */
  readonly now?: Date
}

export type Scenario = RenderResult & {
  /** The address currently shown, so a test can assert the URL owns the state. */
  currentPath(): string
  /** Navigates the way a link does, without remounting the shell. */
  goTo(path: string): Promise<void>
}

/**
 * Mounts the whole product at one address.
 *
 * Both feature clock bases are supplied because a scenario may cross from an
 * inquiry to a customer in a single walk, and a countdown that changed meaning
 * halfway would make the assertions unreadable.
 */
export function renderScenario(
  repositories: MockRepositories,
  path: string,
  options: ScenarioOptions = {},
): Scenario {
  const now = options.now ?? WALKTHROUGH_NOW
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: [path] })

  const result = render(
    <RepositoriesProvider repositories={repositories}>
      <IconSprite />
      <InquiryClockBase value={now}>
        <CustomerClockBase value={now}>
          <RouterProvider router={router} />
        </CustomerClockBase>
      </InquiryClockBase>
    </RepositoriesProvider>,
  )

  return {
    ...result,
    currentPath() {
      const { pathname, search } = router.state.location
      return `${pathname}${search}`
    },
    async goTo(next: string) {
      await router.navigate(next)
    },
  }
}

/* ------------------------------------------------------------------ reading */

/** The rail, which is the demo's own table of contents. */
export function rail(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Main' })
}

/** A `<Panel>` is a section titled by its heading; this is how a test scopes to one. */
export function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

/** The same, for a panel that has not painted yet. */
export async function findPanel(title: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

/** The demo clock control, which is how a TAT lapse is shown without waiting. */
export function demoClock(): HTMLElement {
  return screen.getByRole('group', { name: 'Demo clock' })
}

/* ------------------------------------------------------------------ acting */

/**
 * Follows a rail link the way a person does.
 *
 * A regular expression is usually what a caller wants: a nav item that carries a
 * live count reads "Inquiries 12", so `/^Inquiries/` is the label a person sees.
 */
export async function clickRailLink(label: string | RegExp): Promise<void> {
  const user = userEvent.setup()
  await user.click(within(rail()).getByRole('link', { name: label }))
}

/** Signs in as somebody else through the rail footer's account switcher. */
export async function switchAccount(name: string): Promise<void> {
  const user = userEvent.setup()
  const select = await screen.findByLabelText('Signed in as')
  const option = within(select as HTMLSelectElement)
    .getAllByRole('option')
    .find((candidate) => candidate.textContent?.startsWith(name))
  if (!option) throw new Error(`Nobody named "${name}" can be signed in as.`)
  await user.selectOptions(select, (option as HTMLOptionElement).value)
}

/**
 * Opens the gate for an action and presses its Confirm.
 *
 * Every outward mutation in this product goes through `<ConfirmGate>`, so this
 * is the only shape a scenario ever needs: press the action, read the preview,
 * confirm. Cancelling is deliberately not wrapped — a test that proves nothing
 * was written should press Cancel itself and say so.
 */
export async function confirmAction(actionLabel: string, confirmLabel: string): Promise<void> {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: actionLabel }))
  await user.click(await screen.findByRole('button', { name: confirmLabel }))
}

/** Pushes the demo clock forward from its own control, as the walkthrough does. */
export async function advanceDemoClock(step: '+15 min' | '+1 hr' | '+4 hr'): Promise<void> {
  const user = userEvent.setup()
  await user.click(within(demoClock()).getByRole('button', { name: step }))
}
