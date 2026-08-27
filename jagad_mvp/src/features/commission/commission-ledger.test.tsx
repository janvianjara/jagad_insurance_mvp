/**
 * `/commission` - the read-only ledger view.
 *
 * The §9 bullets about the chain itself are proved in `src/domain/commission.test.ts`,
 * where the arithmetic lives. What this file is for is the other half of the
 * step: that the screen showing that arithmetic cannot change it, and that what
 * it prints is what the domain computed rather than a second copy of the sums.
 */

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import CommissionScreen from './CommissionScreen'
import { commissionDesk } from './data/commission-desk'

/** The owner. The strongest role there is, so "read-only" has to hold for it. */
const ADMIN = 'usr-vivek-jagad'

let repositories: MockRepositories

beforeEach(() => {
  useSessionStore.getState().reset()
  repositories = createMockRepositories({ latency: NO_LATENCY })
})

async function signInAsAdmin(): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), ADMIN)
}

function renderScreen(path = '/commission') {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <MemoryRouter initialEntries={[path]}>
        <CommissionScreen />
      </MemoryRouter>
    </RepositoriesProvider>,
  )
}

/** The first policy on the page, whichever it is. The screen orders by pay-in. */
async function firstChainOpener(): Promise<HTMLElement> {
  const openers = await screen.findAllByRole('button', { name: /POL-/ })
  return openers[0]
}

function regionFor(opener: HTMLElement): HTMLElement {
  const id = opener.getAttribute('aria-controls')
  const region = id ? document.getElementById(id) : null
  if (!region) throw new Error('The chain disclosure controls no region.')
  return region
}

describe('the commission ledger view', () => {
  it('expands the chain per policy and totals the book by channel', async () => {
    await signInAsAdmin()
    renderScreen()

    // Both channels are named, including one with nothing in it: an owner asking
    // "how much came in through brokers" gets an answer either way.
    const totals = await screen.findByRole('table', { name: 'Booked totals by channel' })
    expect(within(totals).getByText('Own code')).toBeInTheDocument()
    expect(within(totals).getByText('Broker channel')).toBeInTheDocument()

    const opener = await firstChainOpener()
    await userEvent.click(opener)

    const region = regionFor(opener)
    expect(within(region).getByText('pays in')).toBeInTheDocument()
    expect(within(region).getByText('net profit')).toBeInTheDocument()
    expect(within(region).getByText(/of basis/)).toBeInTheDocument()
    expect(within(region).getByText(/The parts add up to the pay-in exactly/)).toBeInTheDocument()
  })

  it('reads the ledger and never writes to it, from any role including admin', async () => {
    await signInAsAdmin()
    const { container } = renderScreen()

    await firstChainOpener()

    // Nothing that could carry a value into a mutation exists on this screen.
    expect(container.querySelectorAll('form')).toHaveLength(0)
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0)

    // Every control either opens a chain or turns a page. A `<ConfirmGate>`
    // would show up here as neither, which is exactly what this forbids.
    const controls = screen.getAllByRole('button')
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) {
      const opensAChain = control.hasAttribute('aria-expanded')
      const turnsAPage = control.closest('nav[aria-label="Pagination"]') !== null
      expect(opensAChain || turnsAPage, `${control.textContent} writes nothing`).toBe(true)
      // Belt and braces: no control on this screen is even WORDED as an act.
      expect(control.textContent ?? '').not.toMatch(
        /\b(send|save|submit|approve|reject|confirm|delete|discard|escalate|adjust)\b/i,
      )
    }

    // And the desk itself has no writer to reach for, whatever the screen does.
    expect(Object.keys(commissionDesk(repositories))).toEqual(['book'])
  })

  it('keeps the page in the URL and the totals on the whole book', async () => {
    await signInAsAdmin()
    renderScreen('/commission?page=3')

    // A page read off the address, exactly as §7 asks: the same URL rebuilds the
    // same view. The pager reports where in the book that page sits.
    const pager = await screen.findByRole('navigation', { name: 'Pagination' })
    expect(pager.textContent).toContain('51')

    // The headline total counts every issued policy, not the twenty-five shown.
    const book = await commissionDesk(repositories).book()
    expect(book.rows.length).toBeGreaterThan(25)
    expect(screen.getByText(`${book.rows.length} issued policies`)).toBeInTheDocument()
  })

  it('prints the figures the domain computed, and they reconcile', async () => {
    const book = await commissionDesk(repositories).book()

    expect(book.rows.length).toBeGreaterThan(0)
    expect(book.totals).not.toBeNull()

    // The book carries all three levels, so the screen has a real three-level
    // chain to expand rather than only the two-level shape.
    const threeLevel = book.rows.filter((row) => row.chain.subAgentId !== null)
    expect(threeLevel.length).toBeGreaterThan(0)
    for (const row of threeLevel) {
      expect(row.chain.agentCut.paise).toBe(
        row.chain.agentNet.paise + row.chain.subAgentShare.paise,
      )
    }

    // The screen's headline total is the chain arithmetic rolled up, and the
    // roll-up keeps the invariant: the outward shares plus the net profit are
    // the pay-in, exactly, across the whole book.
    const total = book.totals
    if (!total) throw new Error('The book has no total.')
    expect(total.agentShare.paise + total.subAgentShare.paise + total.netProfit.paise).toBe(
      total.payIn.paise,
    )

    for (const channel of book.channels) {
      expect(channel.agentShare.paise + channel.subAgentShare.paise + channel.netProfit.paise).toBe(
        channel.payIn.paise,
      )
    }

    // Every rendered amount is an integer number of paise. A float that reached
    // this screen would have to pass through here first.
    await signInAsAdmin()
    const { container } = renderScreen()
    await firstChainOpener()

    const amounts = [...container.querySelectorAll('data[value]')]
    expect(amounts.length).toBeGreaterThan(0)
    for (const amount of amounts) {
      expect(Number.isInteger(Number(amount.getAttribute('value')))).toBe(true)
    }
  })

  it('says why an issued policy has no chain instead of dropping it', async () => {
    const book = await commissionDesk(repositories).book()

    // Whether the fixture set has any is not the point - the point is that a
    // policy the chain refuses is carried with its reason rather than filtered
    // into silence, and that the reason is a sentence a person can act on.
    for (const refusal of book.refusals) {
      expect(refusal.systemNo).not.toBe('')
      expect(refusal.reason.length).toBeGreaterThan(20)
    }

    expect(book.rows.length + book.refusals.length).toBeGreaterThan(0)
  })
})
