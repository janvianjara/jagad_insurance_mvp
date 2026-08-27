import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import {
  RAKESH,
  WHO,
  advanceDemoClock,
  clickRailLink,
  confirmAction,
  demoClock,
  findPanel,
  freshRepositories,
  rail,
  renderScenario,
  signIn,
  switchAccount,
} from './harness'

/**
 * The walkthrough itself — the parts of `documents/DEMO_SCRIPT.md` that are a
 * behaviour rather than a click.
 *
 * Two things are proved here that no module test could prove, because both are
 * properties of the demo rather than of a screen:
 *
 *   - the demo clock actually lapses a turnaround in front of a client. Canvas
 *     1.3's trigger is "TAT passes with no confirmation", and the module test for
 *     that row opens an inquiry that was seeded already-lapsed. That proves the
 *     machine; it does not prove that anybody can *show* the lapse happening. The
 *     control that makes it showable had no test at all before this one;
 *   - the golden path is walkable from the rail. A demo script that names an
 *     address is worthless if the person following it cannot get there by
 *     clicking, so the spine is walked link by link rather than by retyping URLs.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

describe('the demo clock', () => {
  it('lapses a live turnaround in front of the client, and the reassignment the machine refused becomes possible', async () => {
    // INQ-1045: assigned 35 minutes ago against a 60 minute allowance, so it is
    // inside its TAT and stays inside it however long the demo talks.
    renderScenario(repositories, '/inquiries/inq-1045')

    expect(await screen.findByRole('heading', { name: 'Tejas Amin' })).toBeInTheDocument()
    expect(screen.getAllByText(/due in/).length).toBeGreaterThan(0)

    // The next move is offered but refused, and the refusal is the machine's own
    // sentence: the allowance has not run out yet.
    const reassign = screen.getByRole('button', { name: 'Auto-reassign to the next person' })
    expect(reassign).toBeDisabled()
    const because = reassign.getAttribute('aria-describedby')
    expect(because).not.toBeNull()
    expect(document.getElementById(because as string)?.textContent ?? '').toMatch(
      /allowance|elapsed|still/i,
    )

    // One press, and an hour has passed for everything on the screen.
    await advanceDemoClock('+1 hr')

    expect(within(demoClock()).getByText('+60 min ahead')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(/breached by/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/due in/)).not.toBeInTheDocument()

    // The same action, now allowed, because the clock moved and nothing else did.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Auto-reassign to the next person' }),
      ).toBeEnabled(),
    )

    await confirmAction('Auto-reassign to the next person', 'Reassign and notify')
    expect(await screen.findByText('Reassigned')).toBeInTheDocument()

    // The record moved on the advanced instant, not on a back-dated one: this is
    // exactly the record the demo would have produced an hour later.
    const after = await repositories.inquiries.get('inq-1045')
    expect(after?.status).toBe('reassigned')
    expect(new Date(after?.assignedAt ?? 0).getTime()).toBeGreaterThan(
      new Date('2026-08-26T10:00:00.000Z').getTime(),
    )
  }, 20_000)

  it('reads the base instant again once it is reset, so a second run of the demo starts where the first did', async () => {
    renderScenario(repositories, '/inquiries/inq-1045')
    await screen.findByRole('heading', { name: 'Tejas Amin' })

    await advanceDemoClock('+4 hr')
    await waitFor(() => expect(screen.getAllByText(/breached by/).length).toBeGreaterThan(0))

    const user = userEvent.setup()
    await user.click(within(demoClock()).getByRole('button', { name: 'Reset clock' }))

    await waitFor(() => expect(screen.getAllByText(/due in/).length).toBeGreaterThan(0))
    expect(within(demoClock()).queryByText(/ahead/)).toBeNull()
  }, 20_000)
})

describe('the golden path', () => {
  it('is walkable from the rail, screen by screen, in the order the demo script gives them', async () => {
    const scenario = renderScenario(repositories, '/')

    // 1. Land on the Assistant, which is where every role starts.
    expect(await screen.findByRole('heading', { name: 'Assistant' })).toBeInTheDocument()

    // 2. Configuration, the claim the whole flow-6 story rests on.
    await clickRailLink(/^Companies/)
    await waitFor(() => expect(scenario.currentPath()).toBe('/config/companies'))
    expect(await screen.findByText('HDFC Ergo General Insurance')).toBeInTheDocument()

    await clickRailLink(/^Agencies/)
    await waitFor(() => expect(scenario.currentPath()).toBe('/config/agencies'))
    expect(await screen.findByText('Jagad Insurance (HDFC Ergo)')).toBeInTheDocument()

    // 3. The inquiry desk, with the unrouted lead held rather than dropped.
    await clickRailLink(/^Inquiries/)
    await waitFor(() => expect(scenario.currentPath()).toBe('/inquiries'))
    expect(await screen.findByRole('alert')).toHaveTextContent('1 inquiry is unrouted')

    // 4. The customer the paperwork half of the demo is about.
    await clickRailLink(/^Customers/)
    await waitFor(() => expect(scenario.currentPath()).toBe('/customers'))
    expect(await screen.findByText('Rakesh Patel')).toBeInTheDocument()
  }, 20_000)

  it('narrows to what the agent may see when the demo switches account, which is the whole point of section 1', async () => {
    renderScenario(repositories, '/assistant')
    await screen.findByRole('navigation', { name: 'Main' })

    // The admin sees the sections the demo script's section 2 walks.
    expect(within(rail()).getByRole('link', { name: /^Companies/ })).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: /^Agencies/ })).toBeInTheDocument()

    await switchAccount('Kiran Solanki')

    // The agent does not, and the rail said so without anybody editing the rail:
    // it is rendered from the permission evaluator, which is the claim the script
    // makes out loud at this exact moment in the demo.
    await waitFor(() =>
      expect(within(rail()).queryByRole('link', { name: /^Companies/ })).toBeNull(),
    )
    expect(within(rail()).queryByRole('link', { name: /^Agencies/ })).toBeNull()
    expect(within(rail()).queryByRole('link', { name: /^Users/ })).toBeNull()

    // What he keeps is his own book, and it is relabelled to say so: the section
    // reads "My book" and its items read "My customers", "My leads". Commission
    // is narrowed to his own, not removed — a demo that claimed he loses it would
    // be claiming the wrong thing.
    expect(within(rail()).getByRole('link', { name: /^My customers/ })).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: /^My leads/ })).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: /^Commission/ })).toBeInTheDocument()
  }, 20_000)

  it('opens Rakesh Patel on the KYC tab from the back-office queue, which is where the demo picks him up', async () => {
    // The URL owns the search, so this is the queue the script tells the
    // presenter to open — reconstructible, not the result of typing into a box.
    const scenario = renderScenario(repositories, '/back-office/kyc?q=Patel')

    expect(await screen.findByText('Rakesh Patel')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByText('Rakesh Patel'))

    // The URL owns the tab, so the address in the demo script is the address a
    // click produces — the script can be followed by typing or by clicking.
    await waitFor(() => expect(scenario.currentPath()).toBe(`/customers/${RAKESH}?tab=kyc`))
    expect(await screen.findByText('KYC part-filled')).toBeInTheDocument()
    expect(await screen.findByText('2 of 4 on file')).toBeInTheDocument()
    expect(await findPanel('Extracted values — confirm each one')).toBeInTheDocument()
  }, 20_000)
})
