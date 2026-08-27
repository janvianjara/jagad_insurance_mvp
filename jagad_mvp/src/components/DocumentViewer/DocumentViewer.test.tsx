import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { money } from '../../domain/money'
import { PREMIUM_MODES } from '../../domain/workflows'
import { DocumentViewer } from './DocumentViewer'
// Source is read through Vite's `?raw`: `tsconfig.app.json` carries only
// `vite/client` types, so `node:fs` is unavailable to a test living under src/.
//
// The stylesheet itself cannot be read the same way, and the reason is worth
// recording: `vite.config.ts` sets `test.css: false`, and Vitest's CSS plugin
// rewrites EVERY id matching `.css` — `?raw` included — into a class-name proxy
// before Vite's raw loader is reached. Adding `css: { include: [/\.module\.css\?raw/] }`
// to the Vitest config would make `import css from './DocumentViewer.module.css?raw'`
// return real text, and the assertion to add then is: every rule declaring
// `var(--font-doc)` has `.letterhead` in its selector, and none names a chrome
// class. Until the config allows that, the boundary is proved from the tree and
// from this component's own source, below.
import viewerSource from './DocumentViewer.tsx?raw'
import styles from './DocumentViewer.module.css'
import { DOCUMENT_LAYOUTS, buildQuotationDocument } from './document-model'
import type { BuildQuotationDocumentInput, DocumentColumn } from './document-model'

const ROWS = [
  { key: 'sum_insured', label: 'Sum insured', adHoc: false },
  { key: 'room_rent', label: 'Room rent', adHoc: false },
  { key: 'dental', label: 'Dental cover', adHoc: true },
]

function column(overrides: Partial<DocumentColumn> = {}): DocumentColumn {
  return {
    columnKey: 'col-star',
    label: 'Star Health',
    companyName: 'Star Health',
    productName: 'Family Health Optima',
    benefitValues: {
      sum_insured: 'INR 10,00,000',
      room_rent: 'Single private',
      dental: 'Included',
    },
    finalPayablePremium: money(24500),
    ...overrides,
  }
}

const STAR = column()
const CARE = column({
  columnKey: 'col-care',
  label: 'Care Health',
  companyName: 'Care Health',
  productName: 'Care Supreme',
  finalPayablePremium: money(31999),
})
const NIVA = column({
  columnKey: 'col-niva',
  label: 'Niva Bupa',
  companyName: 'Niva Bupa',
  productName: 'ReAssure 2.0',
  finalPayablePremium: money(28750),
})

function parts(overrides: Partial<BuildQuotationDocumentInput> = {}): BuildQuotationDocumentInput {
  return {
    systemNo: 'QT-2041',
    version: 2,
    issuedOn: '2026-02-14T09:30:00.000Z',
    customerName: 'Anita Shah',
    persons: [
      { name: 'Anita Shah', dateOfBirth: '1984-03-11', relationship: 'Self' },
      { name: 'Raj Shah', dateOfBirth: '1981-07-02', relationship: 'Spouse' },
      { name: 'Meera Shah', dateOfBirth: '2014-01-09', relationship: 'Daughter' },
    ],
    rows: ROWS,
    columns: [STAR, CARE, NIVA],
    premiumMode: PREMIUM_MODES.annual,
    preparedBy: 'Nirav Patel',
    agencyName: 'Jagad Insurance',
    ...overrides,
  }
}

function sheets(): HTMLElement[] {
  return Array.from(window.document.querySelectorAll<HTMLElement>('[data-part="letterhead"]'))
}

function chrome(): HTMLElement {
  const found = window.document.querySelector<HTMLElement>('[data-part="chrome"]')
  if (!found) throw new Error('the viewer rendered no chrome')
  return found
}

function printedText(): string {
  return sheets()
    .map((sheet) => sheet.textContent ?? '')
    .join(' ')
}

describe('DocumentViewer', () => {
  /**
   * Canvas 2.3 — "Matrix complete → Final premium entered per company; PDF
   * generated → Single or side-by-side branded quotation; premium entered,
   * never computed."
   */
  it('canvas 2.3: three companies print side by side, one company prints single, and every premium is the typed figure with no total', () => {
    const three = buildQuotationDocument(parts())
    const { unmount } = render(<DocumentViewer document={three} />)

    // Side by side by default: one sheet, all three blocks on it.
    expect(sheets()).toHaveLength(1)
    const spread = sheets()[0]
    expect(within(spread).getByRole('region', { name: 'Star Health' })).toBeInTheDocument()
    expect(within(spread).getByRole('region', { name: 'Care Health' })).toBeInTheDocument()
    expect(within(spread).getByRole('region', { name: 'Niva Bupa' })).toBeInTheDocument()

    const spreadText = printedText()
    expect(spreadText).toContain('24,500.00')
    expect(spreadText).toContain('31,999.00')
    expect(spreadText).toContain('28,750.00')

    // No total, and nothing anywhere equal to the sum of the three figures.
    expect(spreadText).not.toMatch(/total/i)
    expect(spreadText).not.toMatch(/grand|sum of|combined/i)
    expect(spreadText).not.toContain('85,249')
    expect(screen.queryByText(/total/i)).toBeNull()

    unmount()

    // One company: one sheet, printed single, still the figure that was typed.
    const one = buildQuotationDocument(parts({ columns: [STAR] }))
    render(<DocumentViewer document={one} />)
    expect(sheets()).toHaveLength(1)
    expect(printedText()).toContain('24,500.00')
    expect(printedText()).not.toMatch(/total/i)
  })

  it('prints one sheet per company under the single layout', () => {
    const document = buildQuotationDocument(parts())
    render(<DocumentViewer document={document} layout={DOCUMENT_LAYOUTS.single} />)

    expect(sheets()).toHaveLength(3)
    for (const sheet of sheets()) {
      // Every sheet carries the full reference header, as a posted document must.
      expect(within(sheet).getByText('Anita Shah', { selector: 'p' })).toBeInTheDocument()
      expect(sheet.querySelectorAll('[data-part="company"]')).toHaveLength(1)
    }
  })

  it('carries the persons, their dates of birth and the floater statement from the model', () => {
    const document = buildQuotationDocument(parts())
    render(<DocumentViewer document={document} />)

    const sheet = sheets()[0]
    expect(document.floater).toBe(true)
    expect(within(sheet).getByText(/floater cover/i)).toBeInTheDocument()

    for (const person of document.persons) {
      expect(within(sheet).getByText(person.name, { selector: 'td' })).toBeInTheDocument()
    }
    expect(within(sheet).getByText('11 Mar 1984')).toBeInTheDocument()
    expect(within(sheet).getByText('02 Jul 1981')).toBeInTheDocument()
    expect(within(sheet).getByText('09 Jan 2014')).toBeInTheDocument()
    expect(within(sheet).getByText('Spouse')).toBeInTheDocument()
    expect(within(sheet).getByText('Daughter')).toBeInTheDocument()
  })

  it('states individual cover when the model says one person', () => {
    const document = buildQuotationDocument(
      parts({ persons: [{ name: 'Anita Shah', dateOfBirth: '1984-03-11', relationship: 'Self' }] }),
    )
    render(<DocumentViewer document={document} />)

    expect(document.floater).toBe(false)
    expect(screen.getByText(/individual cover/i)).toBeInTheDocument()
    expect(screen.queryByText(/floater/i)).toBeNull()
  })

  it('prints the record id, the version and the premium mode as information', () => {
    const document = buildQuotationDocument(parts({ premiumMode: PREMIUM_MODES.halfYearly }))
    render(<DocumentViewer document={document} />)

    const sheet = sheets()[0]
    expect(within(sheet).getByText('QT-2041')).toBeInTheDocument()
    expect(within(sheet).getByText(/version 2/i)).toBeInTheDocument()
    expect(within(sheet).getByText(/premium mode: half-yearly/i)).toBeInTheDocument()
    expect(within(sheet).getByText(/does not scale any figure/i)).toBeInTheDocument()
    // The mode is a label, never a divisor: the typed figures are untouched.
    expect(printedText()).toContain('24,500.00')
    expect(printedText()).not.toContain('12,250')
  })

  it('prints "Not quoted" for a column with no typed premium, and never a zero', () => {
    const document = buildQuotationDocument(
      parts({
        columns: [
          STAR,
          column({
            columnKey: 'col-care',
            label: 'Care Health',
            companyName: 'Care Health',
            finalPayablePremium: null,
          }),
        ],
      }),
    )
    render(<DocumentViewer document={document} />)

    const care = screen.getByRole('region', { name: 'Care Health' })
    expect(within(care).getByText('Not quoted')).toBeInTheDocument()
    expect(care.textContent).not.toMatch(/0\.00/)
    expect(care.textContent).not.toMatch(/₹/)
    // The quoted column is unaffected: its figure is the one that was typed.
    const star = screen.getByRole('region', { name: 'Star Health' })
    expect(within(star).getByText(/24,500\.00/)).toBeInTheDocument()
  })

  it('marks an ad-hoc benefit row as belonging to this quotation only', () => {
    render(<DocumentViewer document={buildQuotationDocument(parts({ columns: [STAR] }))} />)
    expect(screen.getByText('Dental cover')).toBeInTheDocument()
    expect(screen.getAllByText(/added for this quotation/i).length).toBeGreaterThan(0)
  })

  it('switches layout from its own chrome without touching the document', () => {
    const document = buildQuotationDocument(parts())
    render(<DocumentViewer document={document} />)

    expect(sheets()).toHaveLength(1)
    return userEvent.click(screen.getByRole('button', { name: 'Single' })).then(() => {
      expect(sheets()).toHaveLength(3)
      // The document object itself is untouched by the view choice.
      expect(document.columns).toHaveLength(3)
      expect(document.columns[0].finalPayablePremium).toEqual(money(24500))
    })
  })

  it('reports a layout request instead of holding one when the caller controls it', async () => {
    const asked: string[] = []
    const document = buildQuotationDocument(parts())
    render(
      <DocumentViewer
        document={document}
        layout={DOCUMENT_LAYOUTS.sideBySide}
        onLayoutChange={(next) => asked.push(next)}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Single' }))
    expect(asked).toEqual([DOCUMENT_LAYOUTS.single])
    // Controlled: the view did not change itself.
    expect(sheets()).toHaveLength(1)
  })

  it('renders a prior version exactly as it was locked - same props, same page', () => {
    const v1 = buildQuotationDocument(parts({ version: 1, columns: [STAR, CARE] }))
    const first = render(<DocumentViewer document={v1} showChrome={false} />)
    const printed = printedText()
    first.unmount()

    const again = render(<DocumentViewer document={v1} showChrome={false} />)
    expect(printedText()).toBe(printed)
    again.unmount()
  })

  describe('the Source Serif 4 boundary (plan §2)', () => {
    it('gives the document face to the sheet and to nothing else', () => {
      render(<DocumentViewer document={buildQuotationDocument(parts())} />)

      const [sheet] = sheets()
      const carriers = window.document.getElementsByClassName(styles.letterhead)

      // One element carries the class the stylesheet declares `--font-doc` on,
      // and it is the sheet. Everything in the document inherits from there;
      // nothing outside it can.
      expect(carriers).toHaveLength(1)
      expect(carriers[0]).toBe(sheet)
      expect(chrome().classList.contains(styles.letterhead)).toBe(false)
      expect(sheet.classList.contains(styles.chrome)).toBe(false)
    })

    it('applies the document class in exactly one place in the component', () => {
      // The stylesheet declares the face once, on `.letterhead`; this is the
      // other half of that claim — the class is put on one element, the sheet,
      // and the code sets no type face of its own anywhere. Prose is stripped
      // first, so the rule is read off the code rather than off a comment.
      const code = viewerSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

      expect(code.split('styles.letterhead').length - 1).toBe(1)
      expect(code).not.toContain('font-family')
      expect(code).not.toContain('--font-doc')
      expect(code).not.toContain('Source Serif')
    })

    it('renders the chrome outside the letterhead element', () => {
      render(<DocumentViewer document={buildQuotationDocument(parts())} />)

      const control = chrome()
      const [sheet] = sheets()

      expect(sheet.contains(control)).toBe(false)
      expect(control.closest('[data-part="letterhead"]')).toBeNull()
      expect(sheet.querySelector('[data-part="chrome"]')).toBeNull()
      // The switch is chrome, so it lives in that element and not on the sheet.
      expect(control.contains(screen.getByRole('button', { name: 'Single' }))).toBe(true)
      expect(control.classList.contains(styles.chrome)).toBe(true)
    })

    it('puts no control on the sheet at all - a document is not a screen', () => {
      render(
        <DocumentViewer
          document={buildQuotationDocument(parts())}
          actions={<button type="button">Print</button>}
        />,
      )

      const [sheet] = sheets()
      expect(sheet.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0)
      expect(within(chrome()).getByRole('button', { name: 'Print' })).toBeInTheDocument()
    })

    it('omits the chrome entirely when the caller is exporting', () => {
      render(<DocumentViewer document={buildQuotationDocument(parts())} showChrome={false} />)
      expect(window.document.querySelector('[data-part="chrome"]')).toBeNull()
      expect(sheets()).toHaveLength(1)
    })
  })
})
