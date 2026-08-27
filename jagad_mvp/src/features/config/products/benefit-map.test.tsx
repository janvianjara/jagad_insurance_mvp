import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { checklistFor, mapsOfProduct, useMarketStore } from '../shared'
import ProductsScreen from './ProductsScreen'

/**
 * The two things plan §5 hangs off the product screen: the policy-to-benefit map
 * (FR-05.7) and the per-product document checklist.
 *
 * The checklist assertion is the one worth spelling out. A company-wide list is
 * the fallback every product of that insurer inherits, and editing one product
 * has to give that product its own list rather than rewrite the company's —
 * otherwise one product asking for an extra form would put that demand on every
 * other policy the insurer writes.
 */

let repositories: Repositories

const PRODUCT = 'Optima Secure'
const PRODUCT_ID = 'prd-he-ops'
const SIBLING_ID = 'prd-he-opr'
const ROOM_RENT = 'ben-room-rent'

function renderScreen() {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/config/products']}>
          <ProductsScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

function sheet(productId: string) {
  return mapsOfProduct(useMarketStore.getState().benefitMaps, productId)
}

function productNamed(id: string) {
  const product = useMarketStore.getState().products.find((candidate) => candidate.id === id)
  expect(product).toBeDefined()
  return product!
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useMarketStore.getState().reset()
})

describe('the policy to benefit map', () => {
  it('takes a benefit off the sheet only once the change is confirmed', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText(PRODUCT))
    const drawer = await screen.findByRole('dialog', { name: PRODUCT })
    expect(sheet(PRODUCT_ID).some((row) => row.benefitItemId === ROOM_RENT)).toBe(true)

    const row = drawer.querySelector(`[data-benefit="${ROOM_RENT}"]`)
    expect(row).not.toBeNull()
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Remove from sheet' }))

    // Cancel writes nothing.
    await user.click(within(drawer).getByRole('button', { name: 'Save benefit sheet' }))
    const first = await screen.findByRole('dialog', { name: /Save the benefit sheet for/ })
    await user.click(within(first).getByRole('button', { name: 'Cancel' }))
    expect(sheet(PRODUCT_ID).some((entry) => entry.benefitItemId === ROOM_RENT)).toBe(true)

    // Confirm does.
    await user.click(within(drawer).getByRole('button', { name: 'Save benefit sheet' }))
    const gate = await screen.findByRole('dialog', { name: /Save the benefit sheet for/ })
    expect(within(gate).getByText('Taken off the sheet')).toBeInTheDocument()
    await user.click(within(gate).getByRole('button', { name: 'Save sheet' }))

    await waitFor(() =>
      expect(sheet(PRODUCT_ID).some((entry) => entry.benefitItemId === ROOM_RENT)).toBe(false),
    )

    // The row order stays contiguous, and no other product's sheet moved.
    expect(sheet(PRODUCT_ID).map((entry) => entry.sortOrder)).toEqual(
      sheet(PRODUCT_ID).map((_, index) => index + 1),
    )
    expect(sheet(SIBLING_ID).some((entry) => entry.benefitItemId === ROOM_RENT)).toBe(true)
  })
})

describe('a per-product document checklist', () => {
  it('gives the product its own list rather than rewriting the company’s', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText(PRODUCT))
    const drawer = await screen.findByRole('dialog', { name: PRODUCT })

    const panel = drawer.querySelector('[data-checklist="kyc"]') as HTMLElement
    expect(panel).not.toBeNull()
    expect(within(panel).getByText('Inherited from the company')).toBeInTheDocument()

    const inherited = checklistFor(
      useMarketStore.getState().checklists,
      productNamed(PRODUCT_ID),
      'kyc',
    )
    expect(inherited.ownedByProduct).toBe(false)

    await user.type(within(panel).getByLabelText(/Add to kyc documents/), 'Employer letter')
    await user.click(within(panel).getByRole('button', { name: 'Add document' }))
    await user.click(within(panel).getByRole('button', { name: 'Save kyc documents' }))

    const gate = await screen.findByRole('dialog', { name: /Save the kyc documents for/ })
    expect(within(gate).getByText('Applies to')).toBeInTheDocument()
    await user.click(within(gate).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const own = checklistFor(
        useMarketStore.getState().checklists,
        productNamed(PRODUCT_ID),
        'kyc',
      )
      expect(own.ownedByProduct).toBe(true)
      expect(own.items).toContain('Employer letter')
    })

    // The other product of the same company still inherits the untouched list.
    const sibling = checklistFor(
      useMarketStore.getState().checklists,
      productNamed(SIBLING_ID),
      'kyc',
    )
    expect(sibling.ownedByProduct).toBe(false)
    expect(sibling.items).toEqual(inherited.items)
  })
})
