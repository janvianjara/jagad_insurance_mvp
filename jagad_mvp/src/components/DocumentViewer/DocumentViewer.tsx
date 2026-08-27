import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { DateTime, Money as AmountText, RecordId } from '../../ui/type'
import { DOCUMENT_LAYOUTS, PREMIUM_MODE_LABELS, defaultLayoutFor } from './document-model'
import type {
  DocumentBenefitRow,
  DocumentColumn,
  DocumentLayout,
  QuotationDocument,
} from './document-model'
import styles from './DocumentViewer.module.css'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** A figure nobody typed prints as words. Never as zero, never as a dash in the money slot. */
const NOT_QUOTED = 'Not quoted'

/** Absent in a benefit cell means the company did not state it — not that it is nil. */
const NOT_STATED = 'Not stated'

const LAYOUT_LABELS: Readonly<Record<DocumentLayout, string>> = {
  [DOCUMENT_LAYOUTS.single]: 'Single',
  [DOCUMENT_LAYOUTS.sideBySide]: 'Side by side',
}

export type DocumentViewerProps = {
  /** The document to print. It is read, never edited — see the note below. */
  document: QuotationDocument
  /**
   * Controlled layout. Left out, the viewer starts at `defaultLayoutFor` and the
   * switch in its chrome changes what is shown; supplied, the caller owns it and
   * the switch only reports the request through `onLayoutChange`.
   */
  layout?: DocumentLayout
  onLayoutChange?: (layout: DocumentLayout) => void
  /** Caller-owned chrome controls — a print or share action. Never inside the sheet. */
  actions?: ReactNode
  /** Off for an export or an embedded preview, where a control must not appear on the page. */
  showChrome?: boolean
  className?: string
}

/**
 * The letterhead render (plan §2, §5 Composer row, canvas 2.3).
 *
 * This is the thing the customer receives, so it is drawn as a document and not
 * as a screen: Source Serif 4 across the whole sheet, a masthead, a reference
 * header, and one block per company. The plan's type rule is narrow on purpose —
 * `--font-doc` belongs to generated documents ONLY — so the layout switch and
 * anything else the caller hangs in `actions` live outside the sheet element and
 * keep the UI sans face. `DocumentViewer.test.tsx` proves that boundary from the
 * rendered tree and from this file's own source: the document class is applied
 * to exactly one element, and no control is ever rendered inside it.
 *
 * Nothing here is computed. Each column prints the Final Payable Premium that
 * was typed into the matrix, a column without one prints "Not quoted", and there
 * is deliberately no total row and no figure spanning two companies — a sum
 * across insurers would be an amount this platform invented (D3). The premium
 * mode prints as information (D-A); it scales nothing on the page.
 *
 * The component is a pure function of its props, with no editing of the document
 * anywhere inside it. That is what lets a locked prior version render through the
 * same code path and come out exactly as it was sent (§9).
 */
export function DocumentViewer({
  document,
  layout,
  onLayoutChange,
  actions,
  showChrome = true,
  className,
}: DocumentViewerProps) {
  const [picked, setPicked] = useState<DocumentLayout | null>(null)
  const active = layout ?? picked ?? defaultLayoutFor(document)

  function choose(next: DocumentLayout) {
    if (layout === undefined) setPicked(next)
    onLayoutChange?.(next)
  }

  // Single prints one company per sheet; side-by-side puts them on one sheet.
  // A document with no columns still prints its header, rather than nothing.
  const sheets: readonly (readonly DocumentColumn[])[] =
    active === DOCUMENT_LAYOUTS.single
      ? document.columns.map((column) => [column])
      : [document.columns]

  return (
    <section className={cx(styles.viewer, className)} data-layout={active}>
      {showChrome ? (
        <div className={styles.chrome} data-part="chrome">
          <div className={styles.layoutSwitch} role="group" aria-label="Document layout">
            {Object.values(DOCUMENT_LAYOUTS).map((option) => (
              <Button
                key={option}
                size="sm"
                variant={option === active ? 'primary' : 'quiet'}
                aria-pressed={option === active}
                onClick={() => choose(option)}
              >
                {LAYOUT_LABELS[option]}
              </Button>
            ))}
          </div>
          {actions ? <div className={styles.chromeActions}>{actions}</div> : null}
        </div>
      ) : null}

      <div className={styles.sheets}>
        {(sheets.length > 0 ? sheets : [[]]).map((columns, index) => (
          <DocumentSheet
            key={columns[0]?.columnKey ?? `sheet-${index}`}
            document={document}
            columns={columns}
            spread={active === DOCUMENT_LAYOUTS.sideBySide}
          />
        ))}
      </div>
    </section>
  )
}

type DocumentSheetProps = {
  document: QuotationDocument
  columns: readonly DocumentColumn[]
  spread: boolean
}

/** One printed sheet. Everything below this element is in the document face. */
function DocumentSheet({ document, columns, spread }: DocumentSheetProps) {
  return (
    <article className={styles.letterhead} data-part="letterhead">
      <header className={styles.masthead}>
        <p className={styles.agency}>{document.agencyName}</p>
        <div className={styles.identity}>
          <h1 className={styles.title}>Quotation</h1>
          <p className={styles.meta}>
            <RecordId systemNo={document.systemNo} showInsurer={false} />
            <span className={styles.version}>Version {document.version}</span>
            <span className={styles.issued}>
              Issued <DateTime value={document.issuedOn} />
            </span>
          </p>
        </div>
      </header>

      <section className={styles.reference} aria-label="Prepared for">
        <h2 className={styles.sectionTitle}>Prepared for</h2>
        <p className={styles.customer}>{document.customerName}</p>
        <p className={styles.cover} data-floater={document.floater || undefined}>
          {document.floater
            ? 'Floater cover for the persons below.'
            : 'Individual cover for the person below.'}
        </p>
        <table className={styles.persons}>
          <thead>
            <tr>
              <th scope="col">Person covered</th>
              <th scope="col">Date of birth</th>
              <th scope="col">Relationship</th>
            </tr>
          </thead>
          <tbody>
            {document.persons.map((person, index) => (
              <tr key={`${person.name}-${index}`}>
                <td>{person.name}</td>
                <td>
                  <DateTime value={person.dateOfBirth} absentText="not recorded" />
                </td>
                <td>{person.relationship ?? NOT_STATED}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.mode}>
          Premium mode: {PREMIUM_MODE_LABELS[document.premiumMode]}
          <span className={styles.modeNote}>
            Stated for information. It does not scale any figure printed here.
          </span>
        </p>
      </section>

      <div className={styles.columns} data-spread={spread || undefined}>
        {columns.map((column) => (
          <CompanyBlock key={column.columnKey} column={column} rows={document.rows} />
        ))}
      </div>

      <footer className={styles.footer}>
        <p className={styles.preparedBy}>Prepared by {document.preparedBy}</p>
        <p className={styles.disclaimer}>
          Each premium above is the figure quoted by that company and recorded as received. No
          amount on this document is calculated, and no figure is added across companies.
        </p>
      </footer>
    </article>
  )
}

type CompanyBlockProps = {
  column: DocumentColumn
  rows: readonly DocumentBenefitRow[]
}

/** One company's block: its benefit values, then the premium that was typed for it. */
function CompanyBlock({ column, rows }: CompanyBlockProps) {
  const premium = column.finalPayablePremium

  return (
    <section className={styles.column} aria-label={column.label} data-part="company">
      <header className={styles.columnHead}>
        <p className={styles.company}>{column.companyName}</p>
        <p className={styles.product}>{column.productName}</p>
      </header>

      <table className={styles.benefits}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-adhoc={row.adHoc || undefined}>
              <th scope="row" className={styles.benefitLabel}>
                {row.label}
                {row.adHoc ? <span className={styles.adHoc}>added for this quotation</span> : null}
              </th>
              <td className={styles.benefitValue}>{column.benefitValues[row.key] ?? NOT_STATED}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={styles.premium}>
        <span className={styles.premiumLabel}>Final Payable Premium</span>
        <AmountText
          paise={premium ? premium.paise : null}
          currency={premium ? premium.currency : undefined}
          absentText={NOT_QUOTED}
          emphasis="strong"
          className={styles.premiumFigure}
        />
      </p>
    </section>
  )
}
