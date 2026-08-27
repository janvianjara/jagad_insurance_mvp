import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PremiumBlock } from './PremiumBlock'
import { TYPED_PREMIUM_SOURCES } from './entry-types'
import type { PremiumComponent, PremiumEntry } from './entry-types'

/**
 * The premium block, asserted through the screen rather than through its props.
 *
 * D3 is a promise about what a person sees, so it is checked where a person
 * would check it: the derived total moves when the typed figures move, the typed
 * Final does not, and no keystroke anywhere in the block puts a figure into the
 * control that gates issuance. A unit test on a reducer would pass just as
 * happily against a version of this block that pre-filled the Final on blur.
 *
 * The components here are a motor product's, and they are only an example. The
 * block reads whatever the schema's roll-up declares, which is why nothing in
 * this file depends on there being two of them.
 */

const COMPONENTS: readonly PremiumComponent[] = [
  { key: 'ownDamage', label: 'Own damage', amount: null },
  { key: 'thirdParty', label: 'Third party', amount: null },
]

/** Holds the entry the way an entry screen does, and shows what it holds. */
function Block() {
  const [value, setValue] = useState<PremiumEntry>({
    components: COMPONENTS,
    gst: null,
    finalPremium: null,
    finalPremiumSource: TYPED_PREMIUM_SOURCES.typed,
  })

  return (
    <>
      <PremiumBlock value={value} onChange={setValue} />
      <p data-probe="final">
        {value.finalPremium === null ? 'unrecorded' : String(value.finalPremium.paise)}
      </p>
      <p data-probe="source">{value.finalPremiumSource}</p>
    </>
  )
}

/** What the entry actually holds, read off the host rather than off the DOM. */
function probe(name: string): string {
  const node = document.querySelector(`[data-probe="${name}"]`)
  if (!node) throw new Error(`The harness has no "${name}" probe.`)
  return node.textContent ?? ''
}

/**
 * A derived row's recorded paise. `<Money>` renders integer paise into the
 * `value` attribute of a `<data>` element and prints nothing there when the
 * figure is unrecorded, which is the difference this whole block turns on.
 */
function derived(kind: 'net' | 'final'): string {
  const cell = document.querySelector(`[data-rollup="${kind}"][data-derived="true"] output`)
  if (!cell) throw new Error(`The roll-up has no derived ${kind} row.`)
  const value = cell.querySelector('data')
  return value === null ? 'not recorded' : (value.getAttribute('value') ?? '')
}

describe('the premium block', () => {
  it('leaves every component optional and still records a typed Final premium', async () => {
    render(<Block />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Final premium'), '48250')

    expect(probe('final')).toBe('4825000')
    expect(probe('source')).toBe(TYPED_PREMIUM_SOURCES.typed)

    // Nothing was asked for and nothing refused: §9 keeps the components
    // optional forever, so an empty one is an ordinary state, not an error.
    expect(screen.getByLabelText('Own damage')).toHaveValue('')
    expect(screen.getByLabelText('Third party')).toHaveValue('')
    expect(screen.getByLabelText('GST')).toHaveValue('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('derives Net from the typed components and Final from the typed GST', async () => {
    render(<Block />)
    const user = userEvent.setup()

    expect(derived('net')).toBe('0')
    expect(derived('final')).toBe('not recorded')

    await user.type(screen.getByLabelText('Own damage'), '1000')
    expect(derived('net')).toBe('100000')

    await user.type(screen.getByLabelText('Third party'), '500')
    expect(derived('net')).toBe('150000')

    // Final stays unrecorded while GST is: a missing figure is not a zero, and
    // the block will not assert a total nobody gave it.
    expect(derived('final')).toBe('not recorded')

    await user.type(screen.getByLabelText('GST'), '270')
    expect(derived('final')).toBe('177000')
  })

  it('renders the derived rows as read-only outputs that cannot be typed into', async () => {
    render(<Block />)

    const rows = document.querySelectorAll('[data-derived="true"]')
    expect(rows).toHaveLength(2)

    for (const cell of rows) {
      const output = cell.querySelector('output')
      expect(output).not.toBeNull()
      expect(output?.querySelector('input, textarea, [contenteditable]')).toBeNull()
    }

    // Four ways to type an amount into this block and no fifth: two components,
    // GST, and the Final. The derived rows are not among them.
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
  })

  it('never copies the derived Final into the typed Final', async () => {
    render(<Block />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Own damage'), '1000')
    await user.type(screen.getByLabelText('Third party'), '500')
    await user.type(screen.getByLabelText('GST'), '270')

    expect(derived('final')).toBe('177000')

    // The whole seam of the screen: a figure the platform worked out is beside
    // the control, never inside it.
    expect(screen.getByLabelText('Final premium')).toHaveValue('')
    expect(probe('final')).toBe('unrecorded')
  })

  it('leaves the typed Final alone when a component changes', async () => {
    render(<Block />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Final premium'), '2000')
    expect(probe('final')).toBe('200000')

    await user.type(screen.getByLabelText('Own damage'), '1000')

    expect(derived('net')).toBe('100000')
    expect(screen.getByLabelText('Final premium')).toHaveValue('2000')
    expect(probe('final')).toBe('200000')
  })
})
