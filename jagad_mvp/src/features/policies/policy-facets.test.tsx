import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockRepositories } from '../../data/mock'
import { CAST, WHO, freshRepositories, renderPolicyFile, signIn } from './test-harness'
import { POLICY_TABS, policyTabFromPath, policyTabHref } from './policy-tabs'
import { endorsementsInFlight, versionHistory } from './version-diff'
import { money } from '../../domain/money'
import { instalmentTally, nextDue, readMandate } from './schedule-view'

/**
 * The policy file's two deep facets — `/policies/:id/versions` and
 * `/policies/:id/schedule`.
 *
 * The claim these tests exist to hold is an information-architecture one, so it
 * is asserted structurally rather than cosmetically: both addresses render THE
 * SAME record, with its header and its tab strip, on the right tab, from a cold
 * landing. If either ever became a page of its own the first two tests fail,
 * because a page of its own would not carry the policy's header.
 *
 * After that they assert the three things that make each tab worth opening — a
 * real field-level diff, a due and a failed mandate drawn as different kinds of
 * thing, and the honest line where the record cannot say which member changed.
 */

describe('the policy file addresses its facets', () => {
  let repositories: MockRepositories

  beforeEach(async () => {
    repositories = freshRepositories()
    await signIn(repositories, WHO.priya)
  })

  it('lands cold on the versions tab with the record still around it', async () => {
    renderPolicyFile(repositories, CAST.issued, '/versions')

    // The record, not a page about the record: the customer's name is the file's
    // heading and both numbers are in its header.
    expect(await screen.findByRole('heading', { name: 'Rakesh Patel' })).toBeInTheDocument()

    const strip = screen.getByRole('tablist', { name: 'Policy file' })
    expect(within(strip).getByRole('tab', { name: /Versions/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(strip).getByRole('tab', { name: /Overview/ })).toHaveAttribute(
      'aria-selected',
      'false',
    )

    expect(screen.getByRole('heading', { name: 'Version history' })).toBeInTheDocument()
    // The overview did not render underneath it. One tab at a time.
    expect(screen.queryByRole('heading', { name: 'Premium' })).toBeNull()
  })

  it('lands cold on the schedule tab, on the same record', async () => {
    renderPolicyFile(repositories, CAST.scheduled, '/schedule')

    expect(await screen.findByRole('heading', { name: 'Jayesh Kapadia' })).toBeInTheDocument()

    const strip = screen.getByRole('tablist', { name: 'Policy file' })
    expect(within(strip).getByRole('tab', { name: /Premium schedule/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('heading', { name: 'Due next' })).toBeInTheDocument()
  })

  it('keeps /policies/:id on the tab it has always opened on', async () => {
    renderPolicyFile(repositories, CAST.issued)

    expect(await screen.findByRole('heading', { name: 'Premium' })).toBeInTheDocument()
    const strip = screen.getByRole('tablist', { name: 'Policy file' })
    expect(within(strip).getByRole('tab', { name: /Overview/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('moves between facets without leaving the record', async () => {
    const person = userEvent.setup()
    renderPolicyFile(repositories, CAST.scheduled)

    await screen.findByRole('heading', { name: 'Jayesh Kapadia' })
    await person.click(screen.getByRole('tab', { name: /Premium schedule/ }))

    expect(await screen.findByRole('heading', { name: 'Due next' })).toBeInTheDocument()
    // Still the same record. The header never went away.
    expect(screen.getByRole('heading', { name: 'Jayesh Kapadia' })).toBeInTheDocument()
  })
})

describe('the version history', () => {
  let repositories: MockRepositories

  beforeEach(async () => {
    repositories = freshRepositories()
    await signIn(repositories, WHO.priya)
  })

  it('marks exactly one version as the one in force', async () => {
    renderPolicyFile(repositories, CAST.issued, '/versions')

    const list = await screen.findByRole('list', { name: 'Policy versions' })
    expect(within(list).getAllByText('In force')).toHaveLength(1)
    expect(within(list).getAllByText('Superseded')).toHaveLength(1)

    // Newest first, and the current one is the higher version number.
    const current = list.querySelector('[data-current]')
    expect(current?.getAttribute('data-version')).toBe('2')
  })

  it('shows the field that actually changed, and who approved it', async () => {
    renderPolicyFile(repositories, CAST.issued, '/versions')

    // END-0035 raised the sum insured from 10 lakh to 15 lakh and was approved.
    const changes = await screen.findByRole('list', { name: 'Changes in version 2' })
    expect(within(changes).getByText('Sum insured')).toBeInTheDocument()

    const endorsement = await repositories.endorsements.get('end-0035')
    expect(endorsement?.changedFields).toContain('sumInsured')

    const users = await repositories.config.users()
    const approver = users.find((user) => user.id === endorsement?.approvedBy)
    expect(approver).toBeDefined()
    expect(screen.getByText(new RegExp(approver?.name ?? 'nobody'))).toBeInTheDocument()
  })

  it('says the earlier values are not kept rather than inventing a before column', async () => {
    renderPolicyFile(repositories, CAST.issued, '/versions')

    expect(
      await screen.findByText(/keeps which fields an endorsement changed, not what each of them held/),
    ).toBeInTheDocument()
  })

  it('offers no way to edit a version, because a version is written and never edited', async () => {
    renderPolicyFile(repositories, CAST.issued, '/versions')

    const panel = (await screen.findByRole('heading', { name: 'Version history' })).closest(
      'section',
    )
    expect(panel).not.toBeNull()

    const within_ = within(panel as HTMLElement)
    expect(within_.queryAllByRole('textbox')).toHaveLength(0)
    expect(within_.queryAllByRole('button')).toHaveLength(0)
  })

  it('cannot say which member a floater change touched, and says so', () => {
    // The record holds `memberAdded` as a bare string, so the platform genuinely
    // does not know. This is the honest line rather than a name it would have to
    // invent — asserted on the pure function, because the fixtures carry no such
    // endorsement today and the rule must hold the day one arrives.
    const entries = versionHistory(
      [
        {
          id: 'pvr-x-2',
          policyId: 'pol-x',
          version: 2,
          effectiveFrom: '2026-06-01',
          documentId: null,
          endorsementNo: 'END-0099',
          insurerEndorsementNo: null,
          note: 'A member joined the floater.',
          createdAt: '2026-06-01T06:00:00.000Z',
        },
      ],
      [
        {
          id: 'end-0099',
          systemNo: 'END-0099',
          insurerEndorsementNo: null,
          policyId: 'pol-x',
          customerId: 'cus-x',
          type: 'financial',
          state: 'policy_versioned',
          ownerId: null,
          requestedAt: '2026-05-30T06:00:00.000Z',
          effectiveFrom: '2026-06-01',
          reason: 'Daughter added to the floater.',
          changedFields: ['memberAdded'],
          replacesInsuredEntity: false,
          delta: { amount: null, source: null, insurerReference: null },
          refund: { amount: null, source: null, insurerReference: null },
          claimsVerdict: null,
          policyVersionId: 'pvr-x-2',
          documentId: null,
          approvedBy: null,
          approvedAt: null,
        },
      ],
    )

    const change = entries[0]?.changes[0]
    expect(change?.label).toBe('Member added')
    expect(change?.attributable).toBe(false)
  })

  it('separates endorsements still in flight from the versions they have not written', async () => {
    const raised = await repositories.endorsements.forPolicy(CAST.issued)
    const open = endorsementsInFlight(raised)

    // POL-4388 carries one applied endorsement and one correction still open.
    expect(open.length).toBeGreaterThan(0)
    expect(open.every((row) => row.policyVersionId === null)).toBe(true)

    renderPolicyFile(repositories, CAST.issued, '/versions')
    const pending = await screen.findByRole('list', { name: 'Endorsements in flight' })
    expect(within(pending).getAllByText(/END-/).length).toBe(open.length)
  })
})

describe('the premium schedule', () => {
  let repositories: MockRepositories

  beforeEach(async () => {
    repositories = freshRepositories()
    await signIn(repositories, WHO.priya)
  })

  it('draws what is due and the failed mandate as two different things', async () => {
    renderPolicyFile(repositories, CAST.scheduled, '/schedule')

    // The due: the seventh instalment, sitting inside its schedule's own grace.
    const due = (await screen.findByRole('heading', { name: 'Due next' })).closest('section')
    expect(within(due as HTMLElement).getByText('In grace')).toBeInTheDocument()
    expect(within(due as HTMLElement).getByText('7 of 12')).toBeInTheDocument()

    // The mandate: a separate panel, and the one that says a person is needed.
    const mandate = screen.getByRole('heading', { name: 'The mandate behind it' }).closest('section')
    expect(within(mandate as HTMLElement).getByText('Last debit failed')).toBeInTheDocument()
    expect(mandate?.querySelector('[data-mandate-failing]')).not.toBeNull()
    expect(
      within(mandate as HTMLElement).getByText(/never presents a debit and holds no bank credential/),
    ).toBeInTheDocument()
  })

  it('shows the grace window this schedule sets rather than a house constant', async () => {
    const schedule = await repositories.schedules.forPolicy(CAST.scheduled)
    expect(schedule?.graceDays).toBe(15)

    renderPolicyFile(repositories, CAST.scheduled, '/schedule')
    expect(await screen.findByText(/15 days, to/)).toBeInTheDocument()
  })

  it('lists the bank presentations and the agency collections separately', async () => {
    renderPolicyFile(repositories, CAST.scheduled, '/schedule')

    const debits = await screen.findByRole('list', { name: 'Mandate presentations' })
    expect(within(debits).getByText('Debit failed')).toBeInTheDocument()
    expect(within(debits).getByText('Debit succeeded')).toBeInTheDocument()
    expect(
      within(debits).getByText('Bank reported insufficient funds on presentation.'),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('list', { name: 'Collections against this policy' }),
    ).toBeInTheDocument()
  })

  it('records money and never produces it', async () => {
    renderPolicyFile(repositories, CAST.scheduled, '/schedule')

    const tab = await screen.findByRole('heading', { name: 'Due next' })
    const panel = tab.closest('[data-policy-schedule]')
    expect(panel).not.toBeNull()

    // No control anywhere on this tab can enter or alter an amount, and there is
    // no total: the only sums this product performs are Net and Final, and
    // neither of them lives on a schedule.
    const inside = within(panel as HTMLElement)
    expect(inside.queryAllByRole('textbox')).toHaveLength(0)
    expect(inside.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(inside.queryByText(/total/i)).toBeNull()

    // The figure on screen is the one the insurer's schedule was typed with.
    const schedule = await repositories.schedules.forPolicy(CAST.scheduled)
    expect(schedule?.instalmentAmountSource).toBe('typed_from_insurer')
  })

  it('says plainly when a policy carries no schedule at all', async () => {
    renderPolicyFile(repositories, CAST.issued, '/schedule')

    expect(
      await screen.findByText('This policy carries no instalment schedule'),
    ).toBeInTheDocument()
    // And nothing is invented to fill the space.
    expect(screen.queryByRole('list', { name: 'Premium schedule' })).toBeNull()
  })
})

describe('the reading rules, without a screen', () => {
  it('reads the tab off the address and builds the address back', () => {
    expect(policyTabFromPath('/policies/pol-4402/schedule')).toBe(POLICY_TABS.schedule)
    expect(policyTabFromPath('/policies/pol-4402/versions')).toBe(POLICY_TABS.versions)
    expect(policyTabFromPath('/policies/pol-4402')).toBe(POLICY_TABS.overview)
    expect(policyTabFromPath('/policies/pol-4402/')).toBe(POLICY_TABS.overview)

    expect(policyTabHref('pol-4402', POLICY_TABS.overview)).toBe('/policies/pol-4402')
    expect(policyTabHref('pol-4402', POLICY_TABS.schedule)).toBe('/policies/pol-4402/schedule')
  })

  it('takes the next due as the earliest unsettled row, and none when all are settled', () => {
    const schedule = {
      id: 'sch-x',
      policyId: 'pol-x',
      state: 'active',
      mode: 'monthly',
      instalmentAmount: money(1_570),
      instalmentAmountSource: 'typed_from_insurer',
      instalmentCount: 2,
      debitDay: 1,
      graceDays: 15,
      startDate: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      supersededByScheduleId: null,
    } as const

    const rows = [
      {
        id: 'a',
        scheduleId: 'sch-x',
        policyId: 'pol-x',
        sequence: 1,
        dueDate: '2026-01-01',
        amount: money(1_570),
        state: 'paid',
        collectionRecordId: null,
        paidAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'b',
        scheduleId: 'sch-x',
        policyId: 'pol-x',
        sequence: 2,
        dueDate: '2026-02-01',
        amount: money(1_570),
        state: 'in_grace',
        collectionRecordId: null,
        paidAt: null,
      },
    ] as const

    const due = nextDue(rows, schedule)
    expect(due?.instalment.id).toBe('b')
    expect(due?.graceEndsOn).toBe('2026-02-16')
    expect(due?.needsAPerson).toBe(true)

    expect(nextDue([rows[0]], schedule)).toBeNull()
    expect(instalmentTally(rows).map((entry) => entry.state)).toEqual(['paid', 'in_grace'])
  })

  it('reads a failing mandate off its state, and a pattern off its events', () => {
    const now = new Date('2026-08-26T09:30:00.000Z')
    const mandate = {
      id: 'mnd-x',
      policyId: 'pol-x',
      customerId: 'cus-x',
      kind: 'enach',
      reference: 'ENACH-X',
      bankName: 'A bank',
      debitDay: 1,
      validFrom: '2026-01-01',
      validUntil: '2027-01-01',
      state: 'debit_failed',
      registeredBy: 'usr-x',
      registeredAt: '2026-01-01T00:00:00.000Z',
    } as const

    const one = readMandate(
      mandate,
      [
        {
          id: 'e1',
          mandateId: 'mnd-x',
          occurredAt: '2026-08-01T00:00:00.000Z',
          outcome: 'failure',
          reference: 'r1',
          failureReason: 'No funds.',
        },
      ],
      now,
    )
    expect(one.failing).toBe(true)
    expect(one.pattern).toBe(false)

    const two = readMandate(
      mandate,
      [
        {
          id: 'e1',
          mandateId: 'mnd-x',
          occurredAt: '2026-07-01T00:00:00.000Z',
          outcome: 'failure',
          reference: 'r1',
          failureReason: 'No funds.',
        },
        {
          id: 'e2',
          mandateId: 'mnd-x',
          occurredAt: '2026-08-01T00:00:00.000Z',
          outcome: 'failure',
          reference: 'r2',
          failureReason: 'No funds.',
        },
      ],
      now,
    )
    expect(two.pattern).toBe(true)
    expect(two.lastFailureAt).toBe('2026-08-01T00:00:00.000Z')

    // A cancelled mandate is not failing, whatever its history says.
    expect(readMandate({ ...mandate, state: 'cancelled' }, two.failures, now).failing).toBe(false)
  })
})
