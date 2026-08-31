import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockRepositories } from '../../data/mock'
import { RAKESH, WHO, freshRepositories, renderCustomers, signIn } from './test-harness'
import { CUSTOMER_TABS, customerTabFromLocation, customerTabHref } from './customer-tabs'
import { channelStandings, consentLedger, suppressedChannels } from './consent-view'

/** Jayesh gave his consent 298 days ago. Rakesh has a link out and unanswered. */
const JAYESH = 'cus-jayesh-kapadia'

/** Twelve or more digits in a row, however a document spaces them. */
const LONG_DIGIT_RUN = /\d(?:[\s-]?\d){11,}/

/**
 * `/customers/:id/consent` — one customer's consent ledger, FR-20.1.
 *
 * The first two tests are the information-architecture claim: the deep route
 * renders the Customer 360 itself, with its header and its tab strip, on the
 * consent tab. If this ever became an orphan page reached by leaving the record,
 * they fail — an orphan page would not carry the customer's name as its heading
 * or the 360's tab strip beneath it.
 *
 * The rest hold the three things that make the screen a compliance surface
 * rather than a decoration: it is scoped to ONE customer, it masks Aadhaar to
 * four digits like every other screen in this feature, and its one mutation goes
 * through `<ConfirmGate>` with Cancel writing nothing.
 */

describe('the consent ledger is a facet of the customer, not a page of its own', () => {
  let repositories: MockRepositories

  beforeEach(async () => {
    repositories = freshRepositories()
    await signIn(repositories, WHO.priya)
  })

  it('lands cold on the consent tab with the record still around it', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}/consent`)

    expect(await screen.findByRole('heading', { name: 'Rakesh Patel' })).toBeInTheDocument()

    const strip = screen.getByRole('tablist', { name: 'Customer 360' })
    expect(within(strip).getByRole('tab', { name: /^Consent/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('heading', { name: 'Where consent stands' })).toBeInTheDocument()
    // The tab it opens on by default did not render underneath it.
    expect(screen.queryByRole('heading', { name: 'Household' })).toBeNull()
  })

  it('leaves the query-string tabs exactly as they were', async () => {
    const person = userEvent.setup()
    renderCustomers(repositories, `/customers/${RAKESH}?tab=documents`)
    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument()

    // And a person can walk from one to the consent ledger without leaving.
    await person.click(screen.getByRole('tab', { name: /^Consent/ }))
    expect(await screen.findByRole('heading', { name: 'The ledger' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rakesh Patel' })).toBeInTheDocument()
  })
})

describe('the ledger', () => {
  let repositories: MockRepositories

  beforeEach(async () => {
    repositories = freshRepositories()
    await signIn(repositories, WHO.priya)
  })

  it('shows this customer’s consent and nobody else’s', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}/consent`)

    const ledger = await screen.findByRole('list', { name: 'Consent ledger' })
    expect(within(ledger).getByText('Consent link issued')).toBeInTheDocument()

    // Rakesh has NOT come back. Jayesh has — and his line must not be here.
    expect(within(ledger).queryByText('Consent given by the customer')).toBeNull()

    const jayesh = await repositories.customers.consent(JAYESH)
    expect(jayesh?.submittedAt).not.toBeNull()
  })

  it('shows the given consent on the customer who actually gave it', async () => {
    renderCustomers(repositories, `/customers/${JAYESH}/consent`)

    const ledger = await screen.findByRole('list', { name: 'Consent ledger' })
    expect(within(ledger).getByText('Consent given by the customer')).toBeInTheDocument()
  })

  it('never prints the link token, on any state', async () => {
    const consent = await repositories.customers.consent(RAKESH)
    expect(consent?.token).toBeTruthy()

    renderCustomers(repositories, `/customers/${RAKESH}/consent`)
    await screen.findByRole('heading', { name: 'Where consent stands' })
    expect(screen.queryByText(consent?.token ?? 'no token')).toBeNull()
  })

  it('masks Aadhaar to the last four digits, like every other screen here', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}/consent`)
    await screen.findByRole('heading', { name: 'Where consent stands' })

    const customer = await repositories.customers.get(RAKESH)
    expect(customer?.aadhaarLast4).toBeTruthy()
    expect(customer?.aadhaarNumber).toBeNull()

    // The field is on the page, drawn as a masked identifier rather than a bare
    // number, and no run of twelve digits appears anywhere on the tab.
    const panel = screen
      .getByRole('heading', { name: 'Where consent stands' })
      .closest('section') as HTMLElement
    expect(within(panel).getByText('Aadhaar')).toBeInTheDocument()
    // Two masked identifiers on the block — the Aadhaar and the PAN — and both
    // are drawn as masks rather than as values.
    expect(within(panel).getAllByText(/••••/).length).toBeGreaterThan(0)
    expect(LONG_DIGIT_RUN.test(panel.textContent ?? '')).toBe(false)
  })

  it('says which sends a withdrawal would stop, rather than asserting an unnamed effect', async () => {
    renderCustomers(repositories, `/customers/${RAKESH}/consent`)

    const channels = await screen.findByRole('list', { name: 'Consent by channel' })
    expect(within(channels).getByText('WhatsApp')).toBeInTheDocument()
    expect(within(channels).getByText('The link went out here')).toBeInTheDocument()

    const templates = await repositories.config.templates()
    const active = templates.filter((row) => row.active && row.channel === 'whatsapp')
    if (active.length > 0) {
      expect(within(channels).getByText(new RegExp(active[0].key))).toBeInTheDocument()
    }
  })
})

describe('recording a withdrawal', () => {
  let repositories: MockRepositories

  beforeEach(async () => {
    repositories = freshRepositories()
    await signIn(repositories, WHO.priya)
  })

  it('goes through the gate, and Cancel writes nothing', async () => {
    const person = userEvent.setup()
    renderCustomers(repositories, `/customers/${RAKESH}/consent`)

    await screen.findByRole('heading', { name: 'Withdrawal' })
    await person.click(screen.getByRole('button', { name: 'Record a withdrawal' }))
    await person.type(
      screen.getByRole('textbox'),
      'Asked on the phone to stop all marketing messages.',
    )

    const gate = await screen.findByRole('region', { name: 'Record this withdrawal' })
    await person.click(within(gate).getByRole('button', { name: 'Cancel' }))

    // Nothing recorded, and nothing suppressed.
    expect(screen.queryByText('Consent withdrawn')).toBeNull()
    expect(
      screen.getByText(/No withdrawal has been recorded against this customer/),
    ).toBeInTheDocument()
  })

  it('records what the customer asked for, and marks those channels suppressed', async () => {
    const person = userEvent.setup()
    renderCustomers(repositories, `/customers/${RAKESH}/consent`)

    await screen.findByRole('heading', { name: 'Withdrawal' })
    await person.click(screen.getByRole('button', { name: 'Record a withdrawal' }))
    await person.type(screen.getByRole('textbox'), 'Asked us to stop messaging entirely.')

    const gate = await screen.findByRole('region', { name: 'Record this withdrawal' })
    await person.click(within(gate).getByRole('button', { name: 'Record the withdrawal' }))

    expect(await screen.findByText('Consent withdrawn')).toBeInTheDocument()
    // Once in the withdrawal panel, once as the ledger line's own detail: the
    // customer's words are what both of them carry.
    expect(screen.getAllByText('Asked us to stop messaging entirely.')).toHaveLength(2)

    // Every channel it named now reads as suppressed.
    const channels = screen.getByRole('list', { name: 'Consent by channel' })
    expect(within(channels).getAllByText('Suppressed by withdrawal')).toHaveLength(3)

    // And the ledger carries the act.
    const ledger = screen.getByRole('list', { name: 'Consent ledger' })
    expect(within(ledger).getByText(/Consent withdrawn on/)).toBeInTheDocument()
  })

  it('does not move the consent state, and says why not', async () => {
    const person = userEvent.setup()
    renderCustomers(repositories, `/customers/${RAKESH}/consent`)

    await screen.findByRole('heading', { name: 'Withdrawal' })
    await person.click(screen.getByRole('button', { name: 'Record a withdrawal' }))
    await person.type(screen.getByRole('textbox'), 'Withdrawn by telephone.')

    const gate = await screen.findByRole('region', { name: 'Record this withdrawal' })
    await person.click(within(gate).getByRole('button', { name: 'Record the withdrawal' }))
    await screen.findByText('Consent withdrawn')

    // The machine has no `withdrawn` state, so nothing pretended it moved.
    const after = await repositories.customers.get(RAKESH)
    expect(after?.consentState).toBe('link_issued')
    expect(
      screen.getByText(/The consent state machine has no withdrawn state yet/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Nothing writes that log yet/)).toBeInTheDocument()
  })

  it('refuses to offer the gate until the record would be worth keeping', async () => {
    const person = userEvent.setup()
    renderCustomers(repositories, `/customers/${RAKESH}/consent`)

    await screen.findByRole('heading', { name: 'Withdrawal' })
    await person.click(screen.getByRole('button', { name: 'Record a withdrawal' }))

    // No reason typed yet: no gate, and the screen says what is missing.
    expect(screen.queryByRole('region', { name: 'Record this withdrawal' })).toBeNull()
    expect(
      screen.getByText(/Name at least one channel and say what the customer asked for/),
    ).toBeInTheDocument()
  })
})

describe('the reading rules, without a screen', () => {
  it('reads the tab from the path first and the query string second', () => {
    expect(customerTabFromLocation('/customers/cus-x/consent', '')).toBe(CUSTOMER_TABS.consent)
    expect(customerTabFromLocation('/customers/cus-x', '?tab=timeline')).toBe(
      CUSTOMER_TABS.timeline,
    )
    expect(customerTabFromLocation('/customers/cus-x', '')).toBe(CUSTOMER_TABS.household)
    expect(customerTabFromLocation('/customers/cus-x', '?tab=nonsense')).toBe(
      CUSTOMER_TABS.household,
    )

    expect(customerTabHref('cus-x', CUSTOMER_TABS.consent)).toBe('/customers/cus-x/consent')
    expect(customerTabHref('cus-x', CUSTOMER_TABS.household)).toBe('/customers/cus-x')
    expect(customerTabHref('cus-x', CUSTOMER_TABS.timeline)).toBe('/customers/cus-x?tab=timeline')
  })

  it('draws a ledger line only where a timestamp exists to put it at', () => {
    const now = new Date('2026-08-26T09:30:00.000Z')
    const customer = {
      consentChaseCount: 0,
      lastConsentChaseAt: null,
    } as unknown as Parameters<typeof consentLedger>[0]

    // No consent record at all: nothing to say, and nothing invented.
    expect(consentLedger(customer, null, [], now)).toHaveLength(0)

    const chased = {
      consentChaseCount: 3,
      lastConsentChaseAt: '2026-08-24T09:30:00.000Z',
    } as unknown as Parameters<typeof consentLedger>[0]

    const entries = consentLedger(
      chased,
      {
        id: 'cns-x',
        customerId: 'cus-x',
        state: 'expired',
        token: 'cns-secret',
        channel: 'sms',
        issuedAt: '2026-08-01T09:30:00.000Z',
        expiresAt: '2026-08-08T09:30:00.000Z',
        submittedAt: null,
      },
      [],
      now,
    )

    expect(entries.map((entry) => entry.act)).toEqual(['chased', 'expired', 'link_issued'])
    // Newest first.
    expect(entries[0].at > entries[1].at).toBe(true)
    // The chase line says exactly what the record knows and no more.
    expect(entries[0].label).toBe('Chased 3 times')
  })

  it('says a channel is suppressed only because a withdrawal named it', () => {
    const withdrawal = {
      customerId: 'cus-x',
      withdrawnAt: '2026-08-25T09:30:00.000Z',
      actorId: 'usr-x',
      channels: ['sms'] as const,
      reason: 'Stop texting me.',
    }

    expect(suppressedChannels([withdrawal])).toEqual(['sms'])

    const standings = channelStandings(null, [], [], [withdrawal])
    expect(standings.find((row) => row.channel === 'sms')?.suppressed).toBe(true)
    expect(standings.find((row) => row.channel === 'email')?.suppressed).toBe(false)
  })
})
