/**
 * The money surfaces - `/commission/ledger`, `/commission/payouts`, and the row
 * scope all three of them read through.
 *
 * The chain's arithmetic is proved in `src/domain/commission.test.ts` and the
 * scope predicate in `src/domain/visibility.test.ts`. What is proved here is the
 * half those two cannot reach: that the screens showing that money apply the
 * scope, that they show a computed figure and a booked figure as two different
 * things, and that the one control on them which looks like it moves money says
 * plainly that it does not.
 */

import { screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { LEDGER_ENTRY_KINDS } from '../../data/repo'
import CommissionScreen from './CommissionScreen'
import { commissionDesk } from './data/commission-desk'
import { ledgerLines } from './ledger-view'
import { payoutRows } from './payout-view'
import {
  WHO,
  freshRepositories,
  renderLedger,
  renderPayouts,
  signIn,
  viewerFor,
} from './test-harness'

let repositories: MockRepositories

beforeEach(() => {
  repositories = freshRepositories()
})

/** Every `data[value]` on screen, as integer paise. Money renders as `<data>`. */
function renderedPaise(root: ParentNode = document): readonly number[] {
  return [...root.querySelectorAll('data[value]')].map((node) =>
    Number(node.getAttribute('value')),
  )
}

async function linesFor(userId: string) {
  const viewer = await viewerFor(repositories, userId)
  return ledgerLines(await commissionDesk(repositories).book(viewer))
}

/* ------------------------------------------------------------------ the ledger */

describe('/commission/ledger - the line-by-line book', () => {
  it('unfolds the chain into one line per party per level', async () => {
    await signIn(repositories, WHO.vivek)
    const lines = await linesFor(WHO.vivek)
    const book = await commissionDesk(repositories).book(await viewerFor(repositories, WHO.vivek))

    // The grain is genuinely below `/commission`: more lines than policies,
    // because a three-level chain pays three parties off one contract.
    expect(lines.length).toBeGreaterThan(book.rows.length)

    renderLedger(repositories)
    expect(await screen.findByText(`${lines.length} lines`)).toBeInTheDocument()

    // Two amount columns, never one: a single "Amount" would have to pick
    // between what the chain worked out and what somebody booked, and quietly
    // drop the other.
    const grid = screen.getByRole('grid')
    const headers = within(grid)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent ?? '')
    for (const wanted of ['Computed', 'Booked', 'Reconciliation']) {
      expect(headers.some((header) => header.startsWith(wanted))).toBe(true)
    }
  })

  it('shows the computed figure and the booked figure as two different things, and never nets them', async () => {
    const lines = await linesFor(WHO.vivek)
    const differing = lines.filter((line) => line.reconciliation === 'differs')

    // Guards the rest of this test: it is only meaningful while the fixture set
    // actually holds a statement figure that disagrees with the computation.
    expect(differing).toHaveLength(1)
    const line = differing[0]
    if (!line.computed || !line.booked) throw new Error('A differing line needs both figures.')

    await signIn(repositories, WHO.vivek)
    // Narrowed by the URL to the one row, so the assertion below is about that
    // row and not about whatever else happened to be on the page.
    renderLedger(repositories, '/commission/ledger?status=differs')
    await screen.findByText('1 line')

    const user = userEvent.setup()
    await user.click(screen.getAllByRole('row')[1])

    const drawer = await screen.findByRole('dialog')
    const amounts = renderedPaise(drawer)

    // Both figures are present, side by side and the same size.
    expect(amounts).toContain(line.computed.paise)
    expect(amounts).toContain(line.booked.paise)

    // And the difference between them is NOWHERE, because nothing subtracted
    // one from the other. D3 permits addition and nothing else on money, and a
    // variance is a conversation with the insurer rather than a figure this
    // screen may assert.
    const difference = Math.abs(line.booked.paise - line.computed.paise)
    expect(difference).toBeGreaterThan(0)
    expect(amounts).not.toContain(difference)

    expect(within(drawer).getByText(/Differs from statement/)).toBeInTheDocument()
    expect(
      within(drawer).getByText(/statement figure is (higher|lower) than the computed pay-in/),
    ).toBeInTheDocument()
  })

  it('is reconstructible from its URL', async () => {
    await signIn(repositories, WHO.vivek)
    const lines = await linesFor(WHO.vivek)
    const agreeing = lines.filter((line) => line.reconciliation === 'agrees')
    expect(agreeing.length).toBeGreaterThan(0)

    renderLedger(repositories, '/commission/ledger?status=agrees')

    // The address said which slice of the book to show, and the page shows
    // exactly that slice - no local state got a say.
    expect(await screen.findByText(`${agreeing.length} lines`)).toBeInTheDocument()
  })

  it('holds no control that writes, from any role including admin', async () => {
    await signIn(repositories, WHO.vivek)
    const { container } = renderLedger(repositories)
    await screen.findByRole('grid')

    // §9: the ledger is read and never written. A control worded as an act would
    // be the first sign that stopped being true.
    expect(container.querySelectorAll('form')).toHaveLength(0)
    for (const control of screen.getAllByRole('button')) {
      expect(control.textContent ?? '').not.toMatch(
        /\b(send|save|submit|approve|reject|book|release|adjust|delete)\b/i,
      )
    }
  })
})

/* ------------------------------------------------------------------ row scope */

describe('§11 row scope, applied to money', () => {
  it('gives an agent their own book and their sub-agents, and not the agency', async () => {
    const wholeBook = await linesFor(WHO.vivek)
    const agentBook = await linesFor(WHO.kiran)

    // Doing work: the agency's book is strictly larger than the agent's.
    expect(agentBook.length).toBeGreaterThan(0)
    expect(agentBook.length).toBeLessThan(wholeBook.length)

    // Every line the agent can reach is on business they or their sub-agent
    // sourced. A peer agent's line would fail this, and it is the assertion the
    // whole fix exists for.
    for (const line of agentBook) {
      expect(line.scope.agentId).toBe('agt-kiran-solanki')
    }

    await signIn(repositories, WHO.kiran)
    renderLedger(repositories)
    expect(await screen.findByText(`${agentBook.length} lines`)).toBeInTheDocument()
  })

  it('scopes the summary screen as well, so two views of one book agree', async () => {
    const viewer = await viewerFor(repositories, WHO.kiran)
    const book = await commissionDesk(repositories).book(viewer)
    const whole = await commissionDesk(repositories).book(
      await viewerFor(repositories, WHO.vivek),
    )
    expect(book.rows.length).toBeLessThan(whole.rows.length)

    await signIn(repositories, WHO.kiran)
    render(
      <RepositoriesProvider repositories={repositories}>
        <MemoryRouter initialEntries={['/commission']}>
          <CommissionScreen />
        </MemoryRouter>
      </RepositoriesProvider>,
    )

    // The headline says the agent's own count, not the agency's. Before the row
    // scope existed this screen printed the whole book to this account.
    expect(await screen.findByText(`${book.rows.length} issued policies`)).toBeInTheDocument()
    expect(screen.queryByText(`${whole.rows.length} issued policies`)).toBeNull()
  })

  it('refuses row by row, not only route by route', async () => {
    // The back office holds no commission grant at all, so `can()` says no about
    // every row. The ledger is empty and teaches, rather than showing a table
    // with someone else's money in it.
    expect(await linesFor(WHO.priya)).toHaveLength(0)

    await signIn(repositories, WHO.priya)
    renderLedger(repositories)

    expect(
      await screen.findByText('No commission line is in this book yet'),
    ).toBeInTheDocument()
  })
})

/* ----------------------------------------------------------------- the payouts */

describe('/commission/payouts - the cycle', () => {
  it('groups the book into one payee per month, and never the agency', async () => {
    const lines = await linesFor(WHO.vivek)
    const viewer = await viewerFor(repositories, WHO.vivek)
    const book = await commissionDesk(repositories).book(viewer)
    const rows = payoutRows(lines, book.payoutsRecorded)

    expect(rows.length).toBeGreaterThan(0)
    // §9: a payee is an agent or a sub-agent. The agency is the payer and keeps
    // what is left, which is not a payout and never appears here.
    for (const row of rows) {
      expect(['agent', 'sub_agent']).toContain(row.partyKind)
    }

    await signIn(repositories, WHO.vivek)
    renderPayouts(repositories)
    expect(await screen.findByText(`${rows.length} payouts`)).toBeInTheDocument()
  })

  it('states what is outstanding without subtracting anything', async () => {
    const lines = await linesFor(WHO.vivek)
    const viewer = await viewerFor(repositories, WHO.vivek)
    const book = await commissionDesk(repositories).book(viewer)

    // Nothing has ever been recorded as paid in this build, so every row's
    // outstanding IS its due - an identity, not a computed balance.
    expect(book.payoutsRecorded).toHaveLength(0)
    for (const row of payoutRows(lines, book.payoutsRecorded)) {
      expect(row.recordedPaid).toBeNull()
      expect(row.outstanding).toEqual(row.due)
    }
  })

  it('releases through the gate, and says plainly that nothing was written', async () => {
    await signIn(repositories, WHO.vivek)
    const user = userEvent.setup()
    renderPayouts(repositories)
    await screen.findByText(/\d+ payouts/)

    await user.click(screen.getAllByRole('row')[1])
    const drawer = await screen.findByRole('dialog')

    await user.click(within(drawer).getByRole('button', { name: 'Release this payout' }))
    await user.click(within(drawer).getByRole('button', { name: 'Release' }))

    // The receipt is the truth, and it is the same sentence the screen showed
    // before the button was pressed.
    expect(await within(drawer).findByText(/Nothing was released/)).toBeInTheDocument()

    // And the ledger is untouched: no payout entry exists, because none can.
    const ledger = await repositories.commission.list({ page: 1, pageSize: 1000 })
    expect(ledger.rows.filter((row) => row.kind === LEDGER_ENTRY_KINDS.payout)).toHaveLength(0)
  })

  it('writes nothing when the gate is cancelled', async () => {
    await signIn(repositories, WHO.vivek)
    const user = userEvent.setup()
    renderPayouts(repositories)
    await screen.findByText(/\d+ payouts/)

    await user.click(screen.getAllByRole('row')[1])
    const drawer = await screen.findByRole('dialog')

    await user.click(within(drawer).getByRole('button', { name: 'Release this payout' }))
    await user.click(within(drawer).getByRole('button', { name: 'Cancel' }))

    // Back to where it started, with nothing recorded and nothing claimed.
    await waitFor(() => {
      expect(
        within(drawer).getByRole('button', { name: 'Release this payout' }),
      ).toBeInTheDocument()
    })
    const ledger = await repositories.commission.list({ page: 1, pageSize: 1000 })
    expect(ledger.rows.filter((row) => row.kind === LEDGER_ENTRY_KINDS.payout)).toHaveLength(0)
  })

  it('refuses an account that may read commission but not approve it', async () => {
    // Kiran holds `view` on commission and nothing else. He can see what he is
    // owed on this screen and cannot decide that it goes out - a different
    // grant, and a different act.
    await signIn(repositories, WHO.kiran)
    const user = userEvent.setup()
    renderPayouts(repositories)
    await screen.findByText(/\d+ payouts?/)

    // The bulk release is not offered at all, rather than offered and refused.
    expect(screen.queryByRole('button', { name: 'Release payouts' })).toBeNull()

    await user.click(screen.getAllByRole('row')[1])
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByRole('button', { name: 'Release this payout' })).toBeDisabled()
    expect(within(drawer).getByText(/Releasing a payout is an approval/)).toBeInTheDocument()
  })

  it('carries FR-14.7 GST columns and admits they are empty', async () => {
    await signIn(repositories, WHO.vivek)
    renderPayouts(repositories)
    await screen.findByText(/\d+ payouts/)

    const grid = screen.getByRole('grid')
    expect(within(grid).getByRole('columnheader', { name: /GST/ })).toBeInTheDocument()
    // No record in the model carries GST against a commission line, so the cells
    // say so rather than printing a zero somebody might reconcile against.
    expect(within(grid).getAllByText('not recorded').length).toBeGreaterThan(0)
  })
})
