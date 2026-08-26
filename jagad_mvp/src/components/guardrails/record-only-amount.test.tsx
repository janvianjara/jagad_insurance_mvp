/*
 * D3, made testable: the platform RECORDS money, it never calculates it.
 *
 * These assertions are the rule; RecordOnlyAmount and RollUp are only its
 * implementation. Written before either component existed, and deliberately
 * hostile: a future change that computes a premium into the input has to break
 * one of these to land.
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecordOnlyAmount } from './RecordOnlyAmount'
import { RECORD_ONLY_AMOUNT_PROPS } from './record-only-props'
import { RollUp } from './RollUp'
import amountSource from './RecordOnlyAmount.tsx?raw'
import { fromPaise } from '../../domain/money'
import type { Money } from '../../domain/money'

/**
 * Every way a codebase spells "we worked this number out for you". A prop name
 * matching this is an auto-fill path, and an auto-fill path on an amount input
 * is the defect D3 exists to prevent.
 */
const AUTOFILL_WORDS =
  /default|suggest|calculat|comput|derive|derived|prefill|pre-fill|preset|auto|estimate|initial|fallback|seed|formula|total|recommend/i

/** A controlled host, because the component is controlled and a test should say so. */
function AmountHarness({ onValueChange }: { onValueChange: (value: Money | null) => void }) {
  const [amount, setAmount] = useState<Money | null>(null)
  return (
    <RecordOnlyAmount
      label="Final premium"
      value={amount}
      onValueChange={(next) => {
        setAmount(next)
        onValueChange(next)
      }}
    />
  )
}

describe('RecordOnlyAmount — the amount is typed, never produced', () => {
  it('renders empty when nothing has been recorded — an unrecorded amount is not zero', () => {
    render(<RecordOnlyAmount label="Final premium" value={null} onValueChange={vi.fn()} />)

    const input = screen.getByLabelText(/Final premium/)
    expect(input).toHaveValue('')
    expect(input).not.toHaveValue('0')
    expect(input).not.toHaveValue('0.00')
  })

  it('carries the prototype affordance: type the figure', () => {
    render(<RecordOnlyAmount label="Final premium" value={null} onValueChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(/type the figure/i)).toBeInTheDocument()
  })

  it('accepts a typed amount and reports it as integer paise', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<AmountHarness onValueChange={onValueChange} />)

    await user.type(screen.getByLabelText(/Final premium/), '1204.35')

    const last = onValueChange.mock.lastCall?.[0] as Money
    expect(last.paise).toBe(120435)
    expect(last.currency).toBe('INR')
    expect(Number.isInteger(last.paise)).toBe(true)
  })

  it('takes the paise part without float drift', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<AmountHarness onValueChange={onValueChange} />)

    await user.type(screen.getByLabelText(/Final premium/), '0.10')
    expect((onValueChange.mock.lastCall?.[0] as Money).paise).toBe(10)
  })

  it('renders a recorded amount back as rupees and paise', () => {
    render(
      <RecordOnlyAmount label="Final premium" value={fromPaise(120435)} onValueChange={vi.fn()} />,
    )
    expect(screen.getByLabelText(/Final premium/)).toHaveValue('1204.35')
  })

  it('reports null when the figure is cleared — cleared is unrecorded, not zero', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<AmountHarness onValueChange={onValueChange} />)

    const input = screen.getByLabelText(/Final premium/)
    await user.type(input, '900')
    await user.clear(input)

    expect(onValueChange).toHaveBeenLastCalledWith(null)
  })

  it('has no auto-fill prop: the exhaustive prop list holds no computed value path', () => {
    // RECORD_ONLY_AMOUNT_PROPS is derived from `keyof RecordOnlyAmountProps` through
    // a `satisfies` check, so a new prop cannot be added without appearing here.
    const offenders = RECORD_ONLY_AMOUNT_PROPS.filter((prop) => AUTOFILL_WORDS.test(prop))
    expect(offenders).toEqual([])
    expect(RECORD_ONLY_AMOUNT_PROPS).toContain('value')
    expect(RECORD_ONLY_AMOUNT_PROPS).toContain('onValueChange')
  })

  it('has no auto-fill prop in the source either — the props block is read and checked', () => {
    const block = amountSource.match(/export type RecordOnlyAmountProps = \{([\s\S]*?)\n\}/)
    expect(block).not.toBeNull()

    const propNames = [...(block?.[1] ?? '').matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1])
    expect(propNames.length).toBeGreaterThan(0)
    expect(propNames.filter((prop) => AUTOFILL_WORDS.test(prop))).toEqual([])
  })

  it('ignores an auto-fill prop pushed in from outside the type', () => {
    // The type refuses this at compile time; the cast checks that a JS caller
    // sneaking past the type finds nowhere to put the number either.
    const Untyped = RecordOnlyAmount as unknown as (
      props: Record<string, unknown>,
    ) => ReactElement | null

    render(
      <Untyped
        label="Final premium"
        value={null}
        onValueChange={vi.fn()}
        defaultValue={fromPaise(500000)}
        suggestedValue={fromPaise(500000)}
        calculateFrom={[fromPaise(500000)]}
      />,
    )

    expect(screen.getByLabelText(/Final premium/)).toHaveValue('')
  })
})

const COMPONENTS = [
  { key: 'own-damage', label: 'Own damage', amount: fromPaise(10) },
  { key: 'third-party', label: 'Third party', amount: fromPaise(20) },
]

describe('RollUp — the only arithmetic the product allows', () => {
  it('shows Net as the sum of the typed components, in exact paise', () => {
    const { container } = render(<RollUp components={COMPONENTS} gst={fromPaise(5)} />)

    // 0.10 + 0.20 is 0.30, not 0.30000000000000004: the sum is integer paise.
    const net = container.querySelector('[data-rollup="net"]')
    expect(net?.textContent).toContain('0.30')
    expect(net?.querySelector('data')).toHaveAttribute('value', '30')
  })

  it('shows Final as Net plus the recorded GST, and nothing else', () => {
    const { container } = render(<RollUp components={COMPONENTS} gst={fromPaise(5)} />)

    const final = container.querySelector('[data-rollup="final"]')
    expect(final?.querySelector('data')).toHaveAttribute('value', '35')
  })

  it('leaves Final unrecorded when GST has not been typed — it never assumes zero', () => {
    const { container } = render(<RollUp components={COMPONENTS} gst={null} />)

    const final = container.querySelector('[data-rollup="final"]')
    expect(final?.querySelector('data')).toBeNull()
    expect(final?.textContent).toMatch(/not recorded/i)
  })

  it('is read-only: a derived figure cannot be edited', () => {
    const { container } = render(<RollUp components={COMPONENTS} gst={fromPaise(5)} />)

    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.querySelector('[contenteditable]')).toBeNull()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)

    for (const name of ['net', 'final']) {
      const row = container.querySelector(`[data-rollup="${name}"]`)
      expect(row?.querySelector('output')).not.toBeNull()
    }
  })

  it('marks derived figures as derived, so nobody reads one as a typed one', () => {
    const { container } = render(<RollUp components={COMPONENTS} gst={fromPaise(5)} />)

    expect(container.querySelector('[data-rollup="net"]')).toHaveAttribute('data-derived', 'true')
    expect(container.querySelector('[data-rollup="final"]')).toHaveAttribute('data-derived', 'true')
    expect(container.querySelector('[data-rollup="component"]')).not.toHaveAttribute('data-derived')
    expect(screen.getByText(/derived from the figures above/i)).toBeInTheDocument()
  })
})
