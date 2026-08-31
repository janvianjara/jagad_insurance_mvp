/**
 * `/wallet` - FR-14.5, and the acid test of §11's row scope.
 *
 * A sub-agent signing in must see their own earnings and be STRUCTURALLY unable
 * to see anyone else's - not a sibling's, and not their own agent's cut off
 * their own business. The isolation has two layers and this file tests both:
 * the scope predicate keeps other people's policies out of the read entirely,
 * and `myLines` keeps other people's lines off this person's own policies.
 *
 * Nothing here imports a fixture. Every expected figure is read back through the
 * same desk the screen reads, so an assertion cannot drift into agreeing with a
 * copy of the data instead of with the book.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import type { User } from '../../domain/permissions'
import { ToastProvider } from '../../ui/surface'
import { commissionDesk, ledgerLines } from '../commission'
import WalletScreen from './WalletScreen'
import { myLines, walletStatement } from './wallet-view'

/** The sub-agent from canvas 1.6, and the agent she reports to. */
const MEERA = { user: 'usr-meera-joshi', agent: 'agt-meera-joshi' } as const
const KIRAN = { user: 'usr-kiran-solanki', agent: 'agt-kiran-solanki' } as const
/** Back office. No agent record at all, so no wallet of her own. */
const PRIYA = 'usr-priya-desai'

let repositories: MockRepositories

beforeEach(() => {
  useSessionStore.getState().reset()
  repositories = createMockRepositories({ latency: NO_LATENCY })
})

async function viewerFor(userId: string): Promise<User> {
  const staff = await repositories.config.users()
  const person = staff.find((row) => row.id === userId)
  if (!person) throw new Error(`No staff account ${userId} in the fixture set.`)
  return resolveAccount(person).user
}

async function signIn(userId: string): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

function renderWallet(path = '/wallet') {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/wallet" element={<WalletScreen />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

/** Meera's own book, read exactly as the screen reads it. */
async function meerasBook() {
  const viewer = await viewerFor(MEERA.user)
  const book = await commissionDesk(repositories).book(viewer, 'wallet')
  const all = ledgerLines(book)
  const mine = myLines(all, MEERA.agent)
  return { book, all, mine, statement: walletStatement(mine, []) }
}

describe('the wallet reads under the grant the account actually holds', () => {
  it('is empty through the commission grant and full through the wallet grant', async () => {
    const viewer = await viewerFor(MEERA.user)
    const desk = commissionDesk(repositories)

    // §3's role table gives a sub-agent Leads, Customers and Wallet - and no
    // commission grant at all. So the same read under `commission` returns
    // nothing: the wallet is not a back door into the ledger.
    expect((await desk.book(viewer)).rows).toHaveLength(0)
    expect((await desk.book(viewer, 'wallet')).rows.length).toBeGreaterThan(0)
  })
})

describe("a sub-agent's own statement", () => {
  it('shows what they earned, rolled up from their own lines', async () => {
    const { statement, mine } = await meerasBook()
    expect(mine.length).toBeGreaterThan(0)

    await signIn(MEERA.user)
    const { container } = renderWallet()

    await screen.findByText('Earned to date')
    const amounts = [...container.querySelectorAll('data[value]')].map((node) =>
      Number(node.getAttribute('value')),
    )
    expect(amounts).toContain(statement.earned.paise)
  })

  it('DOES NOT show the agency pay-in or the agent cut on their own policies', async () => {
    const { all, mine, statement } = await meerasBook()

    // The read admitted whole policies, so the book Meera's screen was built
    // from genuinely contains other parties' lines. That is what makes the
    // assertion below mean something.
    const others = all.filter((line) => line.partyId !== MEERA.agent)
    expect(others.length).toBeGreaterThan(0)

    await signIn(MEERA.user)
    const { container } = renderWallet()
    await screen.findByText('Earned to date')

    const shown = new Set(
      [...container.querySelectorAll('data[value]')].map((node) =>
        Number(node.getAttribute('value')),
      ),
    )

    // Everything Meera is legitimately shown: her own lines, her monthly
    // totals, and the roll-up of the lot.
    const hers = new Set<number>([
      statement.earned.paise,
      ...mine.map((line) => line.computed?.paise ?? 0),
      ...statement.periods.map((period) => period.total.paise),
    ])

    for (const line of others) {
      const paise = line.computed?.paise
      if (paise === undefined || paise === null || hers.has(paise)) continue
      expect(
        shown.has(paise),
        `${line.partyName}'s ${line.level} line on ${line.systemNo} is on a sub-agent's wallet`,
      ).toBe(false)
    }

    // And her agent is not named anywhere on her own wallet either.
    expect(screen.queryByText('Kiran Solanki')).toBeNull()
  })

  it('never reaches a policy that is not their own', async () => {
    const { book } = await meerasBook()
    const wholeBook = await commissionDesk(repositories).book(await viewerFor('usr-vivek-jagad'))

    expect(book.rows.length).toBeGreaterThan(0)
    expect(book.rows.length).toBeLessThan(wholeBook.rows.length)
    for (const row of book.rows) {
      expect(row.scope.subAgentId).toBe(MEERA.agent)
    }

    // The agent she reports to has a strictly larger book than she does, and
    // hers is a subset of it rather than a differently-shaped list.
    const agentBook = await commissionDesk(repositories).book(await viewerFor(KIRAN.user))
    const agentPolicies = new Set(agentBook.rows.map((row) => row.policyId))
    for (const row of book.rows) {
      expect(agentPolicies.has(row.policyId)).toBe(true)
    }
    expect(book.rows.length).toBeLessThan(agentBook.rows.length)
  })

  it('says nothing has been paid rather than printing a zero', async () => {
    const { statement } = await meerasBook()

    // Nothing in this build can record a payout, so `recordedPaid` is absent -
    // not zero - and unpaid is the amount earned rather than a balance worked
    // out from two figures.
    expect(statement.recordedPaid).toBeNull()
    expect(statement.unpaid).toEqual(statement.earned)

    await signIn(MEERA.user)
    renderWallet()
    // Said twice on purpose - once on the tile, once in the standing note - so
    // this asserts both rather than picking one.
    expect(await screen.findAllByText(/nothing has been recorded as paid/i)).toHaveLength(2)
  })

  it('keeps the month in the URL', async () => {
    const { statement } = await meerasBook()
    expect(statement.periods.length).toBeGreaterThan(1)

    // A month other than the newest, so the assertion cannot pass by default.
    const asked = statement.periods[1]

    await signIn(MEERA.user)
    const { container } = renderWallet(`/wallet?period=${asked.period}`)

    await screen.findByText('Earned to date')
    expect(screen.getAllByText(asked.label).length).toBeGreaterThan(0)
    const amounts = [...container.querySelectorAll('data[value]')].map((node) =>
      Number(node.getAttribute('value')),
    )
    expect(amounts).toContain(asked.total.paise)
  })

  it('offers no control that writes - a wallet is a statement, not a request', async () => {
    await signIn(MEERA.user)
    const { container } = renderWallet()
    await screen.findByText('Earned to date')

    expect(container.querySelectorAll('form')).toHaveLength(0)
    expect(container.querySelectorAll('input, textarea')).toHaveLength(0)
    for (const control of screen.getAllByRole('button')) {
      expect(control.textContent ?? '').not.toMatch(
        /\b(send|save|submit|withdraw|request|release|book)\b/i,
      )
    }
  })
})

describe('an account with no agent record', () => {
  it('is told it has no wallet, rather than shown an empty one', async () => {
    await signIn(PRIYA)
    renderWallet()

    // An empty statement would read as "you earned nothing". The truth is that
    // this account is not a person in the channel and has no wallet at all.
    expect(await screen.findByText('This account has no wallet')).toBeInTheDocument()
    expect(screen.queryByText('Earned to date')).toBeNull()
  })
})
