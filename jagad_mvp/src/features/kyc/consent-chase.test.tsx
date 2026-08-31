import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { STORY_ONLY } from '../../data/fixtures'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { CHASE_EXCLUSIONS, CONSENT_CADENCE, chaseExclusionFor, splitForChase } from './chase-rules'
import KycQueueScreen from './KycQueueScreen'

/**
 * FR-08.4, FR-20, FR-21 — chasing outstanding consent from the KYC queue.
 *
 * The promise has two halves and they fail differently. The queue has to be able
 * to SAY how long a file has gone un-chased, which needs the fact to be on the
 * record at all; and the send has to be a gated, per-page, honest bulk action
 * that leaves the same trace a person opening one file would leave.
 *
 * The story cast alone here, with no generated volume: these tests are about
 * three named people and what happens to them, and three hundred strangers on
 * the page would make every count in the file a moving target.
 */

const PRIYA = 'usr-priya-desai'
/** Partial KYC, and the consent link is already out and unanswered. */
const RAKESH = 'cus-rakesh-patel'
/** Pending KYC, nobody has ever sent them anything. */
const HITESH = 'cus-hitesh-mehta'
const DIPIKA = 'cus-dipika-shah'

let repositories: MockRepositories

beforeEach(async () => {
  useSessionStore.getState().reset()
  repositories = createMockRepositories({
    latency: NO_LATENCY,
    fixtureOptions: { volume: STORY_ONLY },
  })
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), PRIYA)
})

function renderQueue() {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/back-office/kyc']}>
          <Routes>
            <Route path="/back-office/kyc" element={<KycQueueScreen />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

async function rowFor(name: string): Promise<HTMLElement> {
  return screen.findByRole('row', { name: new RegExp(name) })
}

/**
 * The `<ConfirmGate>` inside the bulk dialog.
 *
 * Scoped rather than queried globally because `<BulkActionGate>` puts
 * `confirmTitle` on the modal AND on the gate, so the sentence is in the DOM
 * twice for every bulk action in the product. That is worth tidying in the
 * shared component; it is not this queue's to fix, and a test that matched
 * either one would pass for the wrong reason.
 */
function gateFor(title: string): HTMLElement {
  return screen.getByRole('region', { name: title })
}

/** Ticks the given rows' checkboxes. Only rows on screen have one. */
async function select(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
  for (const name of names) {
    const row = await rowFor(name)
    await user.click(within(row).getByRole('checkbox'))
  }
}

describe('the queue can say how long a file has gone un-chased', () => {
  it('says "never" for a file nobody has ever sent a link to', async () => {
    const hitesh = await repositories.customers.get(HITESH)
    expect(hitesh?.lastConsentChaseAt).toBeNull()
    expect(hitesh?.consentChaseCount).toBe(0)

    renderQueue()
    expect(within(await rowFor('Hitesh Mehta')).getByText('never')).toBeInTheDocument()
  })

  it('shows when the last link went out, and how many have, once there is more than one', async () => {
    const rakesh = await repositories.customers.get(RAKESH)
    expect(rakesh?.lastConsentChaseAt).not.toBeNull()
    expect(rakesh?.consentChaseCount).toBe(2)

    renderQueue()
    const row = await rowFor('Rakesh Patel')
    expect(within(row).getByText('2 sent')).toBeInTheDocument()
    expect(within(row).queryByText('never')).toBeNull()
  })

  it('sorts on it, putting the never-chased first', async () => {
    // Never-chased sorts as the empty string, which is the top of an ascending
    // list — the right end for a chase list.
    const page = await repositories.customers.list({
      page: 1,
      pageSize: 50,
      filters: { kycState: ['pending', 'partial'] },
      sort: { field: 'lastConsentChaseAt', direction: 'asc' },
    })

    expect(page.rows[0]?.lastConsentChaseAt).toBeNull()
  })
})

describe('who may be chased', () => {
  it('leaves out a live link, a consent already given, and a file at the cadence cap', async () => {
    const rakesh = await repositories.customers.get(RAKESH)
    // Rakesh's link is out and unanswered, so sending another makes two live links.
    expect(chaseExclusionFor(rakesh!)).toBe(CHASE_EXCLUSIONS.linkLive)

    expect(chaseExclusionFor({ ...rakesh!, consentState: 'submitted' })).toBe(
      CHASE_EXCLUSIONS.alreadyGiven,
    )

    const capped = {
      ...rakesh!,
      consentState: 'not_sent' as const,
      consentChaseCount: CONSENT_CADENCE.maxAttempts,
    }
    expect(chaseExclusionFor(capped)).toBe(CHASE_EXCLUSIONS.capReached)
  })

  it('lets through a file that has never been sent one', async () => {
    const hitesh = await repositories.customers.get(HITESH)
    expect(chaseExclusionFor(hitesh!)).toBeNull()
    expect(splitForChase([hitesh!]).sending).toHaveLength(1)
  })
})

describe('the bulk send', () => {
  it('previews the recipients, the expiry and the state change before anything is sent', async () => {
    const user = userEvent.setup()
    renderQueue()
    await select(user, 'Hitesh Mehta', 'Dipika Shah')

    await user.click(screen.getByRole('button', { name: 'Send consent link' }))

    const gate = within(gateFor('Send a consent link to 2 customers?'))
    expect(gate.getByText('2 customers')).toBeInTheDocument()
    expect(gate.getByText('7 days from now')).toBeInTheDocument()
    expect(gate.getByText('Link out, unanswered')).toBeInTheDocument()

    // Nothing has been written: the gate is a preview until Confirm.
    const hitesh = await repositories.customers.get(HITESH)
    expect(hitesh?.consentState).toBe('not_sent')
  })

  it('says how many rows it will leave out, and why, rather than dropping them quietly', async () => {
    const user = userEvent.setup()
    renderQueue()
    // Rakesh already has a link out. Ticking him must not send him a second.
    await select(user, 'Hitesh Mehta', 'Rakesh Patel')

    await user.click(screen.getByRole('button', { name: 'Send consent link' }))

    const gate = within(gateFor('Send a consent link to 1 customer?'))
    expect(gate.getByText('1 customer')).toBeInTheDocument()
    expect(gate.getByText(`1 of 2 — 1 ${CHASE_EXCLUSIONS.linkLive}`)).toBeInTheDocument()
  })

  it('sends, records the chase on each file, and gives every recipient their own token', async () => {
    const user = userEvent.setup()
    renderQueue()
    await select(user, 'Hitesh Mehta', 'Dipika Shah')

    await user.click(screen.getByRole('button', { name: 'Send consent link' }))
    await user.click(screen.getByRole('button', { name: 'Send links' }))

    await waitFor(async () => {
      const hitesh = await repositories.customers.get(HITESH)
      expect(hitesh?.consentState).toBe('link_issued')
    })

    for (const id of [HITESH, DIPIKA]) {
      const after = await repositories.customers.get(id)
      expect(after?.consentState).toBe('link_issued')
      // The chase is recorded by the move itself, not by the action.
      expect(after?.lastConsentChaseAt).not.toBeNull()
      expect(after?.consentChaseCount).toBe(1)
    }

    const first = await repositories.customers.consent(HITESH)
    const second = await repositories.customers.consent(DIPIKA)
    expect(first?.token).toBeTruthy()
    expect(first?.token).not.toBe(second?.token)
    // §9: the link opens one form. It carries no session and grants no account,
    // which `issueConsentLink` builds in rather than being asked for.
    expect(first?.token.startsWith('cns-')).toBe(true)
  })

  it('writes nothing at all when the gate is cancelled', async () => {
    const user = userEvent.setup()
    renderQueue()
    await select(user, 'Hitesh Mehta')

    await user.click(screen.getByRole('button', { name: 'Send consent link' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const after = await repositories.customers.get(HITESH)
    expect(after?.consentState).toBe('not_sent')
    expect(after?.lastConsentChaseAt).toBeNull()
    expect(after?.consentChaseCount).toBe(0)
    expect(await repositories.customers.consent(HITESH)).toBeNull()
  })

  it('refuses to confirm when every ticked row is one it must not write to', async () => {
    const user = userEvent.setup()
    renderQueue()
    await select(user, 'Rakesh Patel')

    await user.click(screen.getByRole('button', { name: 'Send consent link' }))

    // An empty preview disables Confirm — a button over an empty box trains
    // people to click through.
    expect(screen.getByRole('button', { name: 'Send links' })).toBeDisabled()
  })

  it('offers no way to select rows that are not on the page', async () => {
    const user = userEvent.setup()
    renderQueue()
    await screen.findByRole('grid')

    // The header checkbox ticks the rows the table was handed, which is this
    // page. There is deliberately no "select all 119" anywhere on the queue: one
    // click that messages a hundred unread rows is not a feature.
    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' })
    await user.click(selectAll)

    const rows = within(screen.getByRole('grid')).getAllByRole('row').slice(1)
    const ticked = rows.filter((row) => within(row).getByRole('checkbox').ariaChecked !== 'false')
    expect(ticked.length).toBeLessThanOrEqual(rows.length)
    expect(screen.queryByRole('button', { name: /select all .* files/i })).toBeNull()
  })
})
