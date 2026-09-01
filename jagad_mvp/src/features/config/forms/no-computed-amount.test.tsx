import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import { useFormsStore } from './forms-store'
import { conditionSourceKeys, moneyLeafKeys } from './schema-draft'
import FormsScreen from './FormsScreen'

/**
 * D3, as the builder expresses it.
 *
 * The grammar has no expression node and no default, so the only way this
 * screen could invent a computed amount is by inventing a control the renderer
 * cannot read. These assertions are therefore about absence: no control on any
 * field sets a default, a rate or a formula; a roll-up offers exactly its typed
 * components and its typed GST figure; and no condition anywhere may read an
 * amount, because branching on money is reasoning about money.
 */

let repositories: Repositories

/** Anything that would put a figure in front of somebody, or derive one. */
const FORBIDDEN_CONTROL = /default|prefill|pre-fill|formula|calculat|percent|per cent|\brate\b|multiplier/i

function renderBuilder(recordId: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/config/forms?record=${recordId}`]}>
          <FormsScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

function fieldRow(scope: HTMLElement, key: string): HTMLElement {
  const row = scope.querySelector(`li[data-field-key="${key}"]`)
  expect(row).not.toBeNull()
  return row as HTMLElement
}

/**
 * Opens a field's panel — every control this file is about lives in one, and a
 * control that is not offered has to be looked for where it would have been.
 */
async function openField(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement,
  key: string,
): Promise<HTMLElement> {
  const row = fieldRow(scope, key)
  await user.click(within(row).getByRole('button', { expanded: false }))
  return row
}

/** Every control a person can operate in this scope, by its visible label. */
function controlLabels(scope: HTMLElement): string[] {
  return [...scope.querySelectorAll('label')].map((label) => label.textContent ?? '')
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useFormsStore.getState().reset()
  useConfigStore.getState().reset()
})

describe('the roll-up, which is the only arithmetic a schema can express', () => {
  it('offers its typed components and its typed GST figure, and nothing else', async () => {
    const user = userEvent.setup()
    renderBuilder('frm-policy-health-v2')
    const drawer = await screen.findByRole('dialog', { name: /Policy entry health · version 2/ })

    const rollUp = await openField(user, drawer, 'finalPremium')
    expect(within(rollUp).getByLabelText('Kind')).toHaveValue('rollup')

    // Net is a sum over typed amounts: one tick box per money leaf, and the GST
    // leaf is offered as GST rather than as a component.
    expect(within(rollUp).getByRole('checkbox', { name: 'Base premium' })).toBeChecked()
    expect(within(rollUp).getByRole('checkbox', { name: 'Loading' })).toBeChecked()
    expect(within(rollUp).queryByRole('checkbox', { name: 'GST' })).toBeNull()
    expect(within(rollUp).getByLabelText(/GST figure/)).toHaveValue('gstAmount')

    // No rate, no coefficient, no third operation — and nowhere to write one.
    for (const label of controlLabels(rollUp)) {
      expect(label).not.toMatch(FORBIDDEN_CONTROL)
    }

    // A derived figure is not something a person fills in, so it is never asked
    // to be required.
    expect(within(rollUp).queryByText('Required')).toBeNull()
  })

  it('never lets an amount be a component of itself or a second derivation', async () => {
    renderBuilder('frm-policy-health-v2')
    await screen.findByRole('dialog', { name: /Policy entry health · version 2/ })

    const schema = useFormsStore
      .getState()
      .schemas.find((row) => row.id === 'frm-policy-health-v2')!

    // Only typed money leaves are candidates. The roll-up itself is not one.
    expect(moneyLeafKeys(schema.stages)).toEqual([
      'sumInsured',
      'basePremium',
      'loadingAmount',
      'gstAmount',
    ])
    expect(moneyLeafKeys(schema.stages)).not.toContain('finalPremium')
  })
})

describe('an amount field', () => {
  it('carries no default, no placeholder and no bounds', async () => {
    const user = userEvent.setup()
    renderBuilder('frm-policy-health-v2')
    const drawer = await screen.findByRole('dialog', { name: /Policy entry health · version 2/ })

    const money = await openField(user, drawer, 'basePremium')
    expect(money).toHaveTextContent(/An amount is typed from a document/)

    for (const label of controlLabels(money)) {
      expect(label).not.toMatch(FORBIDDEN_CONTROL)
    }
    expect(within(money).queryByLabelText(/Smallest/)).toBeNull()
    expect(within(money).queryByLabelText(/Largest/)).toBeNull()
  })
})

describe('branching', () => {
  it('does not offer an amount as a condition, on a field or on a stage', async () => {
    const user = userEvent.setup()
    renderBuilder('frm-policy-health-v2')
    const drawer = await screen.findByRole('dialog', { name: /Policy entry health · version 2/ })

    const mode = await openField(user, drawer, 'premiumMode')
    const condition = within(mode).getByLabelText(/Shown when/)
    const offered = [...condition.querySelectorAll('option')].map((option) => option.value)

    expect(offered).toContain('floater')
    for (const amount of ['basePremium', 'loadingAmount', 'gstAmount', 'finalPremium']) {
      expect(offered).not.toContain(amount)
    }
  })

  it('excludes amounts from the source list in the draft helper too', () => {
    const stages = [
      {
        key: 'premium',
        label: 'Premium',
        fields: [
          { key: 'basePremium', label: 'Base', kind: 'money' as const, required: true, visibleWhen: null, masterTypeId: null },
          { key: 'premiumMode', label: 'Mode', kind: 'select' as const, required: true, visibleWhen: null, masterTypeId: null },
          {
            key: 'finalPremium',
            label: 'Final',
            kind: 'rollup' as const,
            required: false,
            visibleWhen: null,
            masterTypeId: null,
            components: ['basePremium'],
            gstField: null,
          },
        ],
      },
    ]

    expect(conditionSourceKeys(stages, 'premiumMode')).toEqual([])
  })
})
