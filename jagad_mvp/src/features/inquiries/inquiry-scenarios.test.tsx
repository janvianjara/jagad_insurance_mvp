import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { WHO, freshRepositories, renderInquiries, signIn } from './test-harness'

/**
 * Canvas flow 1 — "Inquiry -> TAT -> Assignment" — one test per row.
 *
 * These six are the acceptance criteria for the module, written as the canvas
 * writes them: a situation, a trigger, and the outcome a sales manager expects.
 * They render the real screens against the real mock repositories, so a scenario
 * passing here means the walkthrough works, not that a helper returns the right
 * object.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

/** A `<Panel>` is a section titled by its heading; this is how a test scopes to one. */
function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${title}".`)
  return section
}

/** Opens the gate for the named action and presses its Confirm. */
async function confirmAction(actionLabel: string, confirmLabel: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: actionLabel }))
  const gate = await screen.findByRole('button', { name: confirmLabel })
  await user.click(gate)
}

describe('canvas 1 — inquiry, TAT and assignment', () => {
  it('1.1 an inquiry arrives from the website and routing assigns it, notifies, and starts the TAT clock', async () => {
    // INQ-1044: from the website, Health, routing has not run yet.
    renderInquiries(repositories, '/inquiries/inq-1044')

    expect(await screen.findByRole('heading', { name: 'Urvashi Naik' })).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()

    await confirmAction('Assign', 'Assign and notify')

    // Assigned to the matching person in the Health group.
    expect(await screen.findByText('Assigned')).toBeInTheDocument()
    const record = panel('The record')
    // The owner row by name: the same person can appear on the panel twice —
    // Kiran Solanki is also the agent on this inquiry — so the assertion says
    // which row it means rather than trusting there to be only one match.
    expect(within(record).getByText('Owner').nextElementSibling).toHaveTextContent('Kiran Solanki')

    // Notified, and logged in the trail.
    expect(screen.getByText('Assigned by routing')).toBeInTheDocument()
    expect(screen.getByText(/Kiran Solanki notified\./)).toBeInTheDocument()

    // The TAT timer is running, and its allowance came from configuration.
    expect(
      within(record).getByText('60 minutes, from the Health category in configuration'),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/due in/).length).toBeGreaterThan(0)
  })

  it('1.2 the assignee confirms inside the TAT, so it is accepted, they own it, and the clock stops', async () => {
    // INQ-1045: assigned 35 minutes ago against a 60 minute allowance.
    renderInquiries(repositories, '/inquiries/inq-1045')

    expect(await screen.findByRole('heading', { name: 'Tejas Amin' })).toBeInTheDocument()
    expect(screen.getAllByText(/due in/).length).toBeGreaterThan(0)

    await confirmAction('Confirm and accept', 'Confirm')

    expect(await screen.findByText('Accepted')).toBeInTheDocument()
    const record = panel('The record')
    // The owner row by name: the same person can appear on the panel twice —
    // Kiran Solanki is also the agent on this inquiry — so the assertion says
    // which row it means rather than trusting there to be only one match.
    expect(within(record).getByText('Owner').nextElementSibling).toHaveTextContent('Kiran Solanki')

    // The clock stopped, and the acceptance is on the timeline.
    expect(screen.getByText('clock stopped')).toBeInTheDocument()
    expect(screen.queryByText(/due in/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Accepted — the assignee owns it and the clock stopped'),
    ).toBeInTheDocument()
  })

  it('1.3 the TAT passes with no confirmation, so it auto-reassigns to the next person in the category and both are notified', async () => {
    // INQ-1046: assigned 130 minutes ago against a 60 minute allowance.
    renderInquiries(repositories, '/inquiries/inq-1046')

    expect(await screen.findByRole('heading', { name: 'Rina Chokshi' })).toBeInTheDocument()
    expect(screen.getAllByText(/breached by/).length).toBeGreaterThan(0)

    await confirmAction('Auto-reassign to the next person', 'Reassign and notify')

    expect(await screen.findByText('Reassigned')).toBeInTheDocument()

    // Next in the Motor group, and the group did not widen.
    const record = panel('The record')
    // The owner row by name: the same person can appear on the panel twice —
    // Kiran Solanki is also the agent on this inquiry — so the assertion says
    // which row it means rather than trusting there to be only one match.
    expect(within(record).getByText('Owner').nextElementSibling).toHaveTextContent('Kiran Solanki')
    expect(within(record).getByText('Motor')).toBeInTheDocument()

    // Both notified, and both holds are on the timeline.
    const trail = screen.getByRole('list', { name: 'Assignment trail' })
    expect(within(trail).getByText('Assigned by routing')).toBeInTheDocument()
    expect(
      within(trail).getByText('Auto-reassigned to the next person in the category'),
    ).toBeInTheDocument()
    expect(within(trail).getByText(/Nita Shah and Kiran Solanki notified\./)).toBeInTheDocument()
  })

  it('1.4 the TAT lapses a second time, so escalation hands the sales manager the full history', async () => {
    // INQ-1042: reassigned once, second allowance already spent.
    renderInquiries(repositories, '/inquiries/inq-1042')

    expect(await screen.findByRole('heading', { name: 'Sagar Bhavsar' })).toBeInTheDocument()

    await confirmAction('Escalate with the full history', 'Escalate')

    expect(await screen.findByText('Escalated')).toBeInTheDocument()

    // The sales manager named by the escalation recipe, not by this screen.
    const record = panel('The record')
    expect(within(record).getByText('Nikunj Shah')).toBeInTheDocument()

    // §9: the escalation carries the FULL assignment history, not just the item.
    const carried = screen.getByRole('list', {
      name: 'Assignment history carried with this escalation',
    })
    expect(within(carried).getByText('Kiran Solanki')).toBeInTheDocument()
    expect(within(carried).getByText('Nita Shah')).toBeInTheDocument()
    expect(within(carried).getAllByRole('listitem')).toHaveLength(2)
  })

  it('1.5 routing cannot resolve a category, so the inquiry lands in the unrouted queue with an admin alert and is never lost', async () => {
    // The queue says so out loud.
    const queue = renderInquiries(repositories, '/inquiries')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 inquiry is unrouted')
    expect(alert).toHaveTextContent(/held here and alerted rather than dropped/)
    expect(await screen.findByText('Ketan Zaveri')).toBeInTheDocument()
    queue.unmount()

    // And so does the record itself.
    renderInquiries(repositories, '/inquiries/inq-1041')
    expect(await screen.findByRole('heading', { name: 'Ketan Zaveri' })).toBeInTheDocument()
    const recordAlert = await screen.findByRole('alert')
    expect(recordAlert).toHaveTextContent('Unrouted — the admin has been alerted')
    expect(recordAlert).toHaveTextContent(/No category matches this inquiry/)
    expect(screen.getByText('Unrouted — no category matched')).toBeInTheDocument()
  })

  it('1.6 a sub-agent in the field saves a name and a mobile only, and the inquiry is created, linked to them, and enters routing', async () => {
    await signIn(repositories, WHO.meera)
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries/new')

    // Two fields. Nothing else is touched.
    await user.type(await screen.findByLabelText(/^Name/), 'Hemal Trivedi')
    await user.type(screen.getByLabelText(/^Mobile/), '9825110099')
    await user.click(screen.getByRole('button', { name: 'Save inquiry' }))

    // It exists, on the platform's own numbering, and it is linked to her.
    expect(await screen.findByRole('heading', { name: 'Hemal Trivedi' })).toBeInTheDocument()
    expect(screen.getByText('INQ-1047')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()

    const record = panel('The record')
    expect(within(record).getByText('Meera Joshi')).toBeInTheDocument()
    expect(within(record).getByText('Health')).toBeInTheDocument()

    // And it has entered routing: a destination and an allowance are resolved.
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument()
    expect(
      within(record).getByText('60 minutes, from the Health category in configuration'),
    ).toBeInTheDocument()
  })

  it('captures a run of leads without leaving the form, keeping the batch and clearing the person', async () => {
    // Intake is rarely one lead: a call sheet or a morning's post is a batch, and
    // a form that navigates away after each save makes the person come back for
    // every one of them.
    await signIn(repositories, WHO.meera)
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries/new')

    await user.type(await screen.findByLabelText(/^Name/), 'Hemal Trivedi')
    await user.type(screen.getByLabelText(/^Mobile/), '9825110099')
    await user.selectOptions(screen.getByLabelText(/^Source/), 'walk_in')
    await user.click(screen.getByRole('button', { name: 'Save and add another' }))

    // The form is still up - no navigation - and it says what it just took.
    const receipt = await screen.findByRole('region', { name: 'Captured in this sitting' })
    expect(receipt).toHaveTextContent('1 inquiry captured in this sitting')
    expect(within(receipt).getByRole('link', { name: 'INQ-1047' })).toBeInTheDocument()
    expect(within(receipt).getByText('Hemal Trivedi')).toBeInTheDocument()

    // The person is gone, so the next lead cannot inherit their number.
    expect(screen.getByLabelText(/^Name/)).toHaveValue('')
    expect(screen.getByLabelText(/^Mobile/)).toHaveValue('')
    // The batch is not: a run of captures shares its context.
    expect(screen.getByLabelText(/^Source/)).toHaveValue('walk_in')

    // A second one goes in the same way, and the receipt counts both.
    await user.type(screen.getByLabelText(/^Name/), 'Nisha Bhatt')
    await user.type(screen.getByLabelText(/^Mobile/), '9825110100')
    await user.click(screen.getByRole('button', { name: 'Save and add another' }))

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: 'Captured in this sitting' }),
      ).toHaveTextContent('2 inquiries captured in this sitting')
    })

    // Both are real records, reached through the repository rather than the screen.
    const page = await repositories.inquiries.list({ page: 1, pageSize: 200 })
    const names = page.rows.map((row) => row.contactName)
    expect(names).toContain('Hemal Trivedi')
    expect(names).toContain('Nisha Bhatt')
  })

  it('1.7 capture names who takes it, so one save creates the inquiry, assigns it and starts the clock', async () => {
    const user = userEvent.setup()
    renderInquiries(repositories, '/inquiries/new')

    await user.type(await screen.findByLabelText(/^Name/), 'Bhavna Desai')
    await user.type(screen.getByLabelText(/^Mobile/), '9825220011')
    await user.selectOptions(screen.getByLabelText(/^Category/), 'cat-health')
    await user.selectOptions(screen.getByLabelText(/^Assign to/), WHO.kiran)

    // Assigning notifies somebody, so the save stops at the gate and says who.
    await user.click(screen.getByRole('button', { name: 'Save and assign to Kiran Solanki' }))
    const gate = await screen.findByText(/Kiran Solanki is notified and their clock starts/)
    expect(gate).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save and assign' }))

    // One save: the record exists, Kiran owns it, and the clock is running.
    expect(await screen.findByRole('heading', { name: 'Bhavna Desai' })).toBeInTheDocument()
    expect(await screen.findByText('Assigned')).toBeInTheDocument()
    const record = panel('The record')
    expect(within(record).getByText('Owner').nextElementSibling).toHaveTextContent('Kiran Solanki')
    expect(screen.getAllByText(/due in/).length).toBeGreaterThan(0)
  })

  it('1.8 the person routing suggests can be overruled, and the inquiry goes where it was sent', async () => {
    const user = userEvent.setup()
    // INQ-1044: routing suggests Kiran Solanki, as 1.1 shows. Nita takes it.
    renderInquiries(repositories, '/inquiries/inq-1044')

    await user.click(await screen.findByRole('button', { name: 'Assign' }))
    await user.selectOptions(screen.getByLabelText(/^Assign to/), WHO.nita)
    await user.click(screen.getByRole('button', { name: 'Assign and notify' }))

    expect(await screen.findByText('Assigned')).toBeInTheDocument()
    const record = panel('The record')
    expect(within(record).getByText('Owner').nextElementSibling).toHaveTextContent('Nita Shah')

    // The allowance is still the category's, not something the screen chose.
    expect(
      within(record).getByText('60 minutes, from the Health category in configuration'),
    ).toBeInTheDocument()
  })
})

/**
 * The conversation the PRD had no object for — FR-06.13 to .17.
 *
 * §9.1 ended at the TAT fork and §9.2 opened with the customer and the candidate
 * policies already chosen. These four are the seam between them, walked on the
 * real screens: what was said, what happens next, and what the platform does
 * when the answer to the second question is missing.
 */
describe('canvas 1 continued — the contact, the outcome and the next action', () => {
  it('1.9 logging a callback records the contact, raises the follow-up and dates the inquiry', async () => {
    const user = userEvent.setup()
    // INQ-1039 is accepted and being worked; Nita owns it.
    await signIn(repositories, WHO.nita)
    renderInquiries(repositories, '/inquiries/inq-1039')

    await user.click(await screen.findByRole('button', { name: 'Log a contact' }))
    await user.selectOptions(screen.getByLabelText(/^Outcome/), 'call_back')

    // The outcome proposes when to ring back, from its own configured interval.
    const when = screen.getByLabelText(/^When/) as HTMLInputElement
    expect(when.value).not.toBe('')

    await user.type(screen.getByLabelText(/^Note/), 'Back on Monday, ring him then.')
    await user.click(screen.getByRole('button', { name: 'Log the contact' }))

    // It is on the timeline, in the words a person would read.
    expect((await screen.findAllByText(/Call — Connected — call back/)).length).toBeGreaterThan(0)

    // And the record now says when the next thing happens. The screen re-reads
    // after a write, so this waits for the panel rather than the render pass.
    const contact = await screen.findByRole('heading', { name: 'Contact' })
    const panelEl = contact.closest('section') as HTMLElement
    expect(within(panelEl).getByText('Stage').nextElementSibling).toHaveTextContent(
      'Follow-up scheduled',
    )
    expect(within(panelEl).getByText('Next action').nextElementSibling).not.toHaveTextContent(
      'Nothing is scheduled',
    )
  })

  it('1.10 an outcome that leaves the inquiry open cannot be saved without a date', async () => {
    const user = userEvent.setup()
    await signIn(repositories, WHO.nita)
    renderInquiries(repositories, '/inquiries/inq-1039')

    await user.click(await screen.findByRole('button', { name: 'Log a contact' }))
    await user.selectOptions(screen.getByLabelText(/^Outcome/), 'call_back')
    await user.clear(screen.getByLabelText(/^When/))

    // No date, so there is nothing to confirm and the reason says why.
    expect(screen.queryByRole('button', { name: 'Log the contact' })).not.toBeInTheDocument()
    expect(screen.getByText(/needs a next action with a date/)).toBeInTheDocument()
    expect(screen.getByText(/how a lead goes quiet and nobody notices/)).toBeInTheDocument()
  })

  it('1.11 a wrong number is a data fault, not a lost sale, and closes without a follow-up', async () => {
    const user = userEvent.setup()
    await signIn(repositories, WHO.nita)
    renderInquiries(repositories, '/inquiries/inq-1039')

    await user.click(await screen.findByRole('button', { name: 'Log a contact' }))
    await user.selectOptions(screen.getByLabelText(/^Outcome/), 'wrong_number')

    // It asks for the reason and asks for no date, because nothing follows.
    expect(screen.queryByLabelText(/^When/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Reason/), 'Number belongs to somebody else.')
    await user.click(screen.getByRole('button', { name: 'Log the contact' }))

    const heading = await screen.findByRole('heading', { name: 'Contact' })
    const contact = heading.closest('section') as HTMLElement
    await waitFor(() =>
      expect(within(contact).getByText('Stage').nextElementSibling).toHaveTextContent(
        'Data issue',
      ),
    )
    expect(within(contact).getByText('Next action').nextElementSibling).toHaveTextContent(
      'Nothing is scheduled',
    )
  })

  it('1.13 the requirement form asks the questions its own line needs, and no others', async () => {
    const user = userEvent.setup()
    // INQ-1031 is a motor inquiry that is being worked.
    await signIn(repositories, WHO.nita)
    renderInquiries(repositories, '/inquiries/inq-1031')

    // It already carries a captured requirement, read back in its own words.
    const heading = await screen.findByRole('heading', { name: 'What they need' })
    const panel = heading.closest('section') as HTMLElement
    expect(within(panel).getByText('Make and model')).toBeInTheDocument()
    expect(within(panel).getByText('Maruti Baleno Zeta')).toBeInTheDocument()

    // Motor questions, not health ones. The line decides which form is asked.
    await user.click(within(panel).getByRole('button', { name: 'Recapture' }))
    expect(await screen.findByLabelText(/^Vehicle type/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Maternity/)).not.toBeInTheDocument()
  })

  it('1.14 a requirement captured on the inquiry is what the composer opens with', async () => {
    await signIn(repositories, WHO.nita)
    const requirement = await repositories.requirements.forInquiry('inq-1031')
    expect(requirement).not.toBeNull()

    // §9.2 step 4 assumed the agent remembered this. Now it is on the record,
    // and the composer reads it rather than the agent's memory.
    expect(requirement?.values.makeModel).toBe('Maruti Baleno Zeta')
    expect(requirement?.values.coverKind).toBe('comprehensive')
    // Pinned, so it keeps rendering under the questions that were actually asked.
    expect(requirement?.schemaVersion).toBe(1)
    expect(requirement?.objectKey).toBe('inquiry_requirement_motor')
  })

  it('1.15 a lead nobody can reach is parked, and can be brought back rather than lost', async () => {
    const user = userEvent.setup()
    await signIn(repositories, WHO.nita)

    const recipes = await repositories.config.recipes()
    const attempts = Number(
      recipes.find((row) => row.key === 'inquiry.dormancy')?.parameters.maxAttempts,
    )

    renderInquiries(repositories, '/inquiries/inq-1036')
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await user.click(await screen.findByRole('button', { name: 'Log a contact' }))
      await user.selectOptions(screen.getByLabelText(/^Outcome/), 'not_reachable')
      await user.click(screen.getByRole('button', { name: 'Log the contact' }))
      await screen.findByRole('button', { name: /Log a contact|Bring this lead back/ })
    }

    // Parked, and the panel offers the way back rather than only a way to close.
    const back = await screen.findByRole('button', { name: 'Bring this lead back' })
    expect(back).toBeInTheDocument()

    await user.click(back)
    await user.type(screen.getByLabelText(/^Why is it coming back/), 'He rang the office himself.')
    await user.click(screen.getByRole('button', { name: 'Bring it back' }))

    // Back in the pipeline with the counter reset — not closed as Lost.
    await waitFor(async () => {
      const inquiry = await repositories.inquiries.get('inq-1036')
      expect(inquiry?.stageKey).toBeNull()
      expect(inquiry?.contactAttempts).toBe(0)
      expect(inquiry?.status).toBe('accepted')
    })
  })

  it('1.12 the inquiry carries its contact history, and a lead gone quiet says so', async () => {
    await signIn(repositories, WHO.nita)
    renderInquiries(repositories, '/inquiries/inq-1039')

    // A week of contact: two no-answers, a call that connected, an inbound reply.
    expect(await screen.findByText(/WhatsApp received — Connected — needs information/)).toBeInTheDocument()
    expect(screen.getAllByText(/Not reachable/).length).toBeGreaterThan(0)

    const contact = panel('Contact')
    expect(within(contact).getByText('Attempts').nextElementSibling).toHaveTextContent('2')
    // The next action came and went yesterday, and the panel says so rather than
    // rendering a date the reader has to compare against today themselves.
    expect(within(contact).getByText('Next action').nextElementSibling).toHaveTextContent('overdue')
  })
})
