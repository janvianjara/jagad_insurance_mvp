/*
 * The composer's screen half — and the one moment of the demo everything else
 * supports: the Final Payable Premium column, empty, with the machine refusing
 * to generate until a person types the insurer's figure.
 *
 * Two kinds of assertion here on purpose. The behavioural ones prove no
 * interaction in the grid ever puts a figure in a premium control. The
 * structural ones read this folder's own source and prove there is no prop, no
 * export and no arithmetic that could — because "we never auto-fill" is a claim
 * until something executes it (D3).
 */
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fromPaise } from '../../domain/money'
import { PREMIUM_MODES } from '../../domain/workflows'
import { RECORD_ONLY_AMOUNT_PROPS } from '../guardrails'
import type { BenefitItem, PolicyBenefitMap } from '../../data/repo/benefits'
import { BenefitMatrix } from './BenefitMatrix'
import { openMatrixDraft, setColumnPremium } from './matrix-model'
import type { MatrixColumn, MatrixDraft, OpenMatrixInput } from './matrix-model'

const BENEFITS: readonly BenefitItem[] = [
  { id: 'b-room', key: 'room-rent', label: 'Room rent limit', line: 'health', valueKind: 'text', sortOrder: 10, active: true },
  { id: 'b-pre', key: 'pre-hosp', label: 'Pre-hospitalisation', line: 'health', valueKind: 'text', sortOrder: 20, active: true },
  { id: 'b-mat', key: 'maternity', label: 'Maternity cover', line: 'health', valueKind: 'covered', sortOrder: 30, active: true },
  { id: 'b-rest', key: 'restore', label: 'Restoration of sum insured', line: 'health', valueKind: 'covered', sortOrder: 40, active: true },
]

const MAPS: Readonly<Record<string, readonly PolicyBenefitMap[]>> = {
  'p-star': [
    { id: 'm-1', productId: 'p-star', benefitItemId: 'b-room', defaultValue: 'Single private room', sortOrder: 1 },
    { id: 'm-2', productId: 'p-star', benefitItemId: 'b-pre', defaultValue: '60 days', sortOrder: 2 },
    { id: 'm-3', productId: 'p-star', benefitItemId: 'b-mat', defaultValue: 'Covered after 36 months', sortOrder: 3 },
  ],
  'p-care': [
    { id: 'm-4', productId: 'p-care', benefitItemId: 'b-room', defaultValue: 'No room rent capping', sortOrder: 1 },
    { id: 'm-5', productId: 'p-care', benefitItemId: 'b-pre', defaultValue: '30 days', sortOrder: 2 },
    { id: 'm-6', productId: 'p-care', benefitItemId: 'b-rest', defaultValue: 'Unlimited restoration', sortOrder: 3 },
  ],
}

const STAR: MatrixColumn = {
  columnKey: 'col-star',
  label: 'Star Comprehensive',
  companyId: 'c-star',
  companyName: 'Star Health',
  productId: 'p-star',
  productName: 'Comprehensive',
}

const CARE: MatrixColumn = {
  columnKey: 'col-care',
  label: 'Care Supreme',
  companyId: 'c-care',
  companyName: 'Care Health',
  productId: 'p-care',
  productName: 'Supreme',
}

function catalogueInput(): OpenMatrixInput {
  return {
    columns: [STAR, CARE],
    benefitItems: BENEFITS,
    mapsByProduct: MAPS,
    premiumMode: PREMIUM_MODES.annual,
  }
}

/** A controlled host, because the component is controlled and a test should say so. */
function Harness({
  initial,
  readOnly = false,
  onDraft,
}: {
  initial: MatrixDraft
  readOnly?: boolean
  onDraft?: (draft: MatrixDraft) => void
}) {
  const [draft, setDraft] = useState(initial)
  return (
    <BenefitMatrix
      draft={draft}
      readOnly={readOnly}
      caption="Comparison"
      onDraftChange={(next) => {
        setDraft(next)
        onDraft?.(next)
      }}
    />
  )
}

function premiumInput(columnLabel: string): HTMLElement {
  return screen.getByLabelText(`Final Payable Premium — ${columnLabel}`)
}

function cell(rowKey: string, columnKey: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-matrix-cell="${rowKey}:${columnKey}"]`)
  if (!found) throw new Error(`no cell ${rowKey}:${columnKey}`)
  return found
}

function root(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[data-benefit-matrix]')
  if (!found) throw new Error('no matrix rendered')
  return found
}

describe('canvas 2.1 — the matrix opens on the union of the mapped benefits, defaults pre-filled', () => {
  it('renders one row per union benefit and one column per company and product', () => {
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    expect(screen.getByRole('columnheader', { name: /Star Comprehensive/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Care Supreme/ })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Room rent limit/ })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Restoration of sum insured/ })).toBeInTheDocument()

    // Star Health · Comprehensive, so a demo viewer can tell two products of one
    // company apart without opening the column.
    expect(screen.getByText(/Star Health/)).toBeInTheDocument()
  })

  it('pre-fills every cell from that column’s own catalogue default', () => {
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    expect(within(cell('room-rent', 'col-star')).getByRole('textbox')).toHaveValue(
      'Single private room',
    )
    expect(within(cell('room-rent', 'col-care')).getByRole('textbox')).toHaveValue(
      'No room rent capping',
    )
    expect(within(cell('pre-hosp', 'col-star')).getByRole('textbox')).toHaveValue('60 days')
    expect(within(cell('pre-hosp', 'col-care')).getByRole('textbox')).toHaveValue('30 days')
  })

  it('leaves a product that does not map a benefit empty, never borrowing the neighbour’s value', () => {
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    expect(within(cell('maternity', 'col-care')).getByRole('textbox')).toHaveValue('')
    expect(within(cell('restore', 'col-star')).getByRole('textbox')).toHaveValue('')
    // ... while the column that does map it still reads its own default.
    expect(within(cell('maternity', 'col-star')).getByRole('textbox')).toHaveValue(
      'Covered after 36 months',
    )
  })

  it('reports a typed cell edit as a new draft rather than mutating the old one', async () => {
    const user = userEvent.setup()
    const before = openMatrixDraft(catalogueInput())
    const snapshot = JSON.stringify(before)
    const onDraft = vi.fn()

    render(<Harness initial={before} onDraft={onDraft} />)
    await user.type(within(cell('maternity', 'col-care')).getByRole('textbox'), 'Not covered')

    expect(within(cell('maternity', 'col-care')).getByRole('textbox')).toHaveValue('Not covered')
    expect(JSON.stringify(before)).toBe(snapshot)
    expect(onDraft.mock.lastCall?.[0]).not.toBe(before)
  })
})

describe('canvas 2.2 — an ad-hoc row is added inline, on this quotation only', () => {
  it('adds the row from inside the grid, marks it, and leaves the catalogue byte-identical', async () => {
    const user = userEvent.setup()
    const catalogueBefore = JSON.stringify(BENEFITS)
    const mapsBefore = JSON.stringify(MAPS)
    const onDraft = vi.fn()

    render(<Harness initial={openMatrixDraft(catalogueInput())} onDraft={onDraft} />)

    await user.type(
      screen.getByLabelText(/Add a benefit for this quotation only/),
      'OPD consultation cover',
    )
    await user.click(screen.getByRole('button', { name: /Add row/ }))

    const added = screen.getByRole('rowheader', { name: /OPD consultation cover/ })
    expect(added).toBeInTheDocument()
    expect(within(added).getByText(/This quotation only/)).toBeInTheDocument()

    // The catalogue the matrix was opened from is untouched, byte for byte.
    expect(JSON.stringify(BENEFITS)).toBe(catalogueBefore)
    expect(JSON.stringify(MAPS)).toBe(mapsBefore)

    const draft = onDraft.mock.lastCall?.[0] as MatrixDraft
    const row = draft.rows[draft.rows.length - 1]
    expect(row.benefitItemId).toBeNull()
    expect(row.adHoc).toBe(true)
    expect(row.label).toBe('OPD consultation cover')

    // And the next quotation over the same two products opens without it.
    expect(openMatrixDraft(catalogueInput()).rows.some((each) => each.adHoc)).toBe(false)
  })

  it('gives the ad-hoc row an empty cell in every column, not a guessed one', async () => {
    const user = userEvent.setup()
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    await user.type(screen.getByLabelText(/Add a benefit for this quotation only/), 'Dental')
    await user.keyboard('{Enter}')

    for (const columnKey of ['col-star', 'col-care']) {
      expect(within(cell('adhoc-dental', columnKey)).getByRole('textbox')).toHaveValue('')
    }
  })

  it('clears the entry box after adding, and refuses a blank label', async () => {
    const user = userEvent.setup()
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    const entry = screen.getByLabelText(/Add a benefit for this quotation only/)
    await user.click(screen.getByRole('button', { name: /Add row/ }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(4 + 2 + 1)

    await user.type(entry, 'Dental')
    await user.click(screen.getByRole('button', { name: /Add row/ }))
    expect(entry).toHaveValue('')
  })

  it('lets an ad-hoc row be removed and leaves catalogue rows unremovable', async () => {
    const user = userEvent.setup()
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    await user.type(screen.getByLabelText(/Add a benefit for this quotation only/), 'Dental')
    await user.click(screen.getByRole('button', { name: /Add row/ }))

    expect(screen.queryByRole('button', { name: /Remove row: Room rent limit/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Remove row: Dental/ }))
    expect(screen.queryByRole('rowheader', { name: /Dental/ })).toBeNull()
  })
})

describe('the premium-mode row is informational (D-A)', () => {
  it('offers every mode the domain carries, Single included', () => {
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    for (const label of ['Annual', 'Half-yearly', 'Quarterly', 'Monthly', 'Single']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText(/does not scale, split or alter any figure/i)).toBeInTheDocument()
  })

  it('changes no premium and no cell value when the mode changes', async () => {
    const user = userEvent.setup()
    let draft = openMatrixDraft(catalogueInput())
    draft = setColumnPremium(draft, 'col-star', fromPaise(1850000))
    const onDraft = vi.fn()

    render(<Harness initial={draft} onDraft={onDraft} />)

    const cellsBefore = ['col-star', 'col-care'].flatMap((columnKey) =>
      ['room-rent', 'pre-hosp', 'maternity', 'restore'].map(
        (rowKey) => (within(cell(rowKey, columnKey)).getByRole('textbox') as HTMLInputElement).value,
      ),
    )

    await user.click(screen.getByRole('radio', { name: 'Monthly' }))

    const next = onDraft.mock.lastCall?.[0] as MatrixDraft
    expect(next.premiumMode).toBe(PREMIUM_MODES.monthly)
    expect(next.premiums).toEqual(draft.premiums)
    expect(next.values).toEqual(draft.values)

    // The figure on screen is the figure that was typed — not a twelfth of it.
    expect(premiumInput('Star Comprehensive')).toHaveValue('18500')
    expect(premiumInput('Care Supreme')).toHaveValue('')
    expect(
      ['col-star', 'col-care'].flatMap((columnKey) =>
        ['room-rent', 'pre-hosp', 'maternity', 'restore'].map(
          (rowKey) =>
            (within(cell(rowKey, columnKey)).getByRole('textbox') as HTMLInputElement).value,
        ),
      ),
    ).toEqual(cellsBefore)
  })
})

describe('the premium stop — the platform records the figure, it never works it out (D3)', () => {
  it('opens with every premium control empty and the matrix not ready', () => {
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    expect(premiumInput('Star Comprehensive')).toHaveValue('')
    expect(premiumInput('Care Supreme')).toHaveValue('')
    expect(premiumInput('Star Comprehensive')).not.toHaveValue('0')
    expect(root()).toHaveAttribute('data-ready', 'false')
    expect(root()).toHaveAttribute('data-missing-premium', 'col-star col-care')
  })

  it('shows the machine’s own refusal sentence as the reason, naming the empty columns', () => {
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    const stop = screen.getByRole('status')
    expect(stop).toHaveAttribute('data-state', 'blocked')
    expect(stop).toHaveTextContent(/Final Payable Premium is missing for/)
    expect(stop).toHaveTextContent(/Star Comprehensive/)
    expect(stop).toHaveTextContent(/Care Supreme/)
    expect(stop).toHaveTextContent(/the platform does not work it out/i)
  })

  it('clears the stop only when a person has typed a figure into every column', async () => {
    const user = userEvent.setup()
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)

    await user.type(premiumInput('Star Comprehensive'), '18500')
    expect(root()).toHaveAttribute('data-ready', 'false')
    expect(root()).toHaveAttribute('data-missing-premium', 'col-care')

    await user.type(premiumInput('Care Supreme'), '16999')
    expect(root()).toHaveAttribute('data-ready', 'true')
    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'ready')
  })

  it('does not render a Generate button — the screen owns that, the matrix owns the reason', () => {
    render(<Harness initial={openMatrixDraft(catalogueInput())} />)
    expect(screen.queryByRole('button', { name: /generate/i })).toBeNull()
  })

  it('never populates a premium from a benefit cell, an ad-hoc row or a mode change', async () => {
    const user = userEvent.setup()
    const onDraft = vi.fn()
    render(<Harness initial={openMatrixDraft(catalogueInput())} onDraft={onDraft} />)

    await user.type(within(cell('room-rent', 'col-star')).getByRole('textbox'), ' upgraded')
    await user.type(within(cell('pre-hosp', 'col-care')).getByRole('textbox'), '45')
    await user.type(screen.getByLabelText(/Add a benefit for this quotation only/), 'Dental')
    await user.click(screen.getByRole('button', { name: /Add row/ }))
    await user.type(within(cell('adhoc-dental', 'col-star')).getByRole('textbox'), 'Covered')
    await user.click(screen.getByRole('radio', { name: 'Monthly' }))

    // Every keystroke above went somewhere. None of them went here.
    expect(premiumInput('Star Comprehensive')).toHaveValue('')
    expect(premiumInput('Care Supreme')).toHaveValue('')
    expect(root()).toHaveAttribute('data-ready', 'false')

    for (const call of onDraft.mock.calls) {
      const draft = call[0] as MatrixDraft
      expect(draft.premiums).toEqual({ 'col-star': null, 'col-care': null })
    }

    // And the only control that does fill it, does.
    await user.type(premiumInput('Star Comprehensive'), '18500')
    expect((onDraft.mock.lastCall?.[0] as MatrixDraft).premiums['col-star']?.paise).toBe(1850000)
  })

  it('treats a cleared premium as unrecorded, not as zero', async () => {
    const user = userEvent.setup()
    let draft = openMatrixDraft(catalogueInput())
    draft = setColumnPremium(draft, 'col-star', fromPaise(1850000))
    draft = setColumnPremium(draft, 'col-care', fromPaise(1699900))

    render(<Harness initial={draft} />)
    expect(root()).toHaveAttribute('data-ready', 'true')

    await user.clear(premiumInput('Care Supreme'))
    expect(root()).toHaveAttribute('data-ready', 'false')
    expect(screen.getByRole('status')).toHaveTextContent(/Care Supreme/)
  })
})

/*
 * The structural half. Every source file in this folder is read as text and
 * checked, so the guarantee survives a rewrite of the component rather than only
 * describing today's one.
 */
const FOLDER_SOURCES = Object.entries(
  import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
).filter(([path]) => !path.includes('.test.')) as Array<[string, string]>

/** Every way a codebase spells "we worked this number out for you". */
const AUTOFILL_WORDS =
  /default|suggest|calculat|comput|derive|prefill|pre-fill|preset|auto|estimate|initial|fallback|seed|formula|total|recommend|placeholder/i

function recordOnlyAmountUsages(): Array<{ file: string; block: string }> {
  return FOLDER_SOURCES.flatMap(([file, source]) =>
    // The leading \\s matters: it keeps a `<RecordOnlyAmount>` inside a doc
    // comment from opening a match that runs on to the real element's `/>`.
    [...source.matchAll(/<RecordOnlyAmount(\s[\s\S]*?)\/>/g)].map((match) => ({
      file,
      block: match[1],
    })),
  )
}

describe('D3, structurally — there is nowhere in this folder to put a computed premium', () => {
  it('reads the real sources, so an empty glob cannot pass this suite by accident', () => {
    const files = FOLDER_SOURCES.map(([file]) => file)
    expect(files).toContain('./matrix-model.ts')
    expect(files).toContain('./BenefitMatrix.tsx')
    expect(FOLDER_SOURCES.every(([, source]) => source.length > 0)).toBe(true)
  })

  it('passes no auto-fill prop to RecordOnlyAmount anywhere in the folder', () => {
    const usages = recordOnlyAmountUsages()
    expect(usages.length).toBeGreaterThan(0)

    for (const { file, block } of usages) {
      const props = [...block.matchAll(/^\s*([a-zA-Z]\w*)=/gm)].map((match) => match[1])
      expect(props, file).toContain('value')
      expect(props, file).toContain('onValueChange')
      expect(props.filter((prop) => AUTOFILL_WORDS.test(prop)), file).toEqual([])
      // Stronger than the prop names: the whole element, expression bodies
      // included, carries none of the vocabulary of a produced figure.
      expect(AUTOFILL_WORDS.test(block), file).toBe(false)
      // A spread would smuggle a prop past the checks above.
      expect(block, file).not.toContain('{...')
    }
  })

  it('has no auto-fill prop to pass: the control’s whole surface is checked', () => {
    // RECORD_ONLY_AMOUNT_PROPS is derived from `keyof RecordOnlyAmountProps`
    // through a `satisfies` check, so a new prop cannot exist without appearing
    // in it. There is deliberately no defaultValue and no placeholder.
    expect(RECORD_ONLY_AMOUNT_PROPS.filter((prop) => AUTOFILL_WORDS.test(prop))).toEqual([])
    expect(RECORD_ONLY_AMOUNT_PROPS).toContain('value')
    expect(RECORD_ONLY_AMOUNT_PROPS).toContain('onValueChange')
  })

  it('writes a premium through setColumnPremium and through nothing else', () => {
    const component = FOLDER_SOURCES.find(([file]) => file === './BenefitMatrix.tsx')?.[1] ?? ''

    expect(component.match(/setColumnPremium/g)).toHaveLength(2) // the import and the one call
    expect(component).not.toMatch(/premiums:\s/)
    expect(component).not.toMatch(/premiums\[[^\]]*\]\s*=[^=]/)
    // No arithmetic on an amount: the component formats paise, it never bends it.
    expect(component).not.toMatch(/paise\s*[-+*/%]|[-+*/%]\s*\w*\.paise/)
  })

  it('keeps the model free of any premium-producing export', () => {
    const model = FOLDER_SOURCES.find(([file]) => file === './matrix-model.ts')?.[1] ?? ''
    const exported = [...model.matchAll(/export (?:function|const) (\w+)/g)].map((match) => match[1])

    expect(exported).toContain('setColumnPremium')
    expect(
      exported.filter(
        (name) => /premium/i.test(name) && AUTOFILL_WORDS.test(name.replace(/premiumMode/i, '')),
      ),
    ).toEqual([])
    expect(model).not.toMatch(/\bpaise\b/)
  })
})

describe('readOnly — a locked prior version', () => {
  it('renders every cell and figure as text, with no way in', () => {
    let draft = openMatrixDraft(catalogueInput())
    draft = setColumnPremium(draft, 'col-star', fromPaise(1850000))
    draft = setColumnPremium(draft, 'col-care', fromPaise(1699900))

    render(<Harness initial={draft} readOnly />)

    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Add row/ })).toBeNull()
    expect(root()).toHaveAttribute('data-readonly', 'true')

    expect(cell('room-rent', 'col-star')).toHaveTextContent('Single private room')
    const premium = document.querySelector('[data-premium-cell="col-star"] data')
    expect(premium).toHaveAttribute('value', '1850000')
    expect(screen.getByText('Annual')).toBeInTheDocument()
  })

  it('says an unrecorded figure is unrecorded rather than printing zero', () => {
    render(<Harness initial={openMatrixDraft(catalogueInput())} readOnly />)

    const cellNode = document.querySelector('[data-premium-cell="col-star"]')
    expect(cellNode).toHaveTextContent(/not recorded/i)
    expect(cellNode?.querySelector('data')).toBeNull()
    expect(root()).toHaveAttribute('data-ready', 'false')
  })

  it('shows an unmapped benefit as not covered, not as an empty guess', () => {
    render(<Harness initial={openMatrixDraft(catalogueInput())} readOnly />)
    expect(cell('maternity', 'col-care')).toHaveTextContent(/not covered/i)
  })
})
