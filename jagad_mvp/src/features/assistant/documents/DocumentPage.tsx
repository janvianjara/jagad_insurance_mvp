import { Icon } from '../../../ui/Icon'
import { DateTime, Money } from '../../../ui/type'
import { CellValue } from '../blocks/CellValue'
import type { AssistantDocumentPage, DocumentSection } from './document-page'
import styles from './DocumentPage.module.css'

/**
 * The produced sheet, rendered — the prototype's `pageHTML()`.
 *
 * It is a pure function of one document and has no controls inside it, which is
 * the same rule `DocumentViewer` keeps and for the same reason: the sheet is
 * what a customer receives, so anything a member of staff can press has to be a
 * sibling of it rather than part of it. The drawer supplies the chrome.
 *
 * Every value comes through `<CellValue>`, `<Money>` or `<DateTime>`, so a
 * document formats a figure exactly as the answer that produced it did. There
 * is no total row, and `DocumentSection` has no way to express one — a sum
 * across recorded figures is arithmetic this platform does not do (D3).
 */

function Section({ section }: { section: DocumentSection }) {
  if (section.section === 'heading') return <h4 className={styles.heading}>{section.text}</h4>

  if (section.section === 'para') return <p className={styles.para}>{section.text}</p>

  if (section.section === 'meta') {
    return (
      <dl className={styles.meta}>
        {section.items.map((item) => (
          <div key={item.key} style={{ display: 'contents' }}>
            <dt className={styles.metaLabel}>{item.label}</dt>
            <dd className={styles.metaValue}>
              <CellValue cell={item.value} />
            </dd>
          </div>
        ))}
      </dl>
    )
  }

  if (section.section === 'table') {
    return (
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {section.columns.map((column) => (
                <th key={column.key} scope="col" data-align={column.align ?? 'start'}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, index) => (
                  <td
                    key={section.columns[index]?.key ?? index}
                    data-align={section.columns[index]?.align ?? 'start'}
                  >
                    <CellValue cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (section.section === 'amounts') {
    return (
      <div className={styles.amounts}>
        <p className={styles.amountsHead}>
          <span>{section.label}</span>
          <span className={styles.amountsNote}>{section.note}</span>
        </p>
        {section.rows.map((row) => (
          <p key={row.key} className={styles.amountRow}>
            <span>{row.label}</span>
            {row.paise === null ? (
              // Absent is absent. Never a zero, never a dash in the money slot —
              // a figure nobody recorded must not look like a figure someone did.
              <span className={styles.amountAbsent}>Not recorded</span>
            ) : (
              <span className={styles.amountValue}>
                <Money paise={row.paise} showPaise={false} />
              </span>
            )}
          </p>
        ))}
      </div>
    )
  }

  return (
    <p className={styles.signature}>
      <span className={styles.signatureBy}>{section.by}</span>
      {section.role}
    </p>
  )
}

export function DocumentPage({ document }: { document: AssistantDocumentPage }) {
  return (
    <>
      <article className={styles.sheet} aria-label={document.fileName}>
        <header className={styles.masthead}>
          <span className={styles.mark} aria-hidden="true">
            <Icon name="shield" size="sm" />
          </span>
          <span className={styles.agency}>
            <span className={styles.agencyName}>{document.agencyName}</span>
            <span className={styles.agencyLine}>{document.agencyLine}</span>
          </span>
          <span className={styles.reference}>
            <span className={styles.referenceValue}>{document.reference}</span>
            <DateTime value={document.issuedOn} mode="date" />
            <br />
            {document.addressedTo}
          </span>
        </header>

        {document.sections.map((section, index) => (
          <Section key={index} section={section} />
        ))}
      </article>

      {/*
        The preview renders the first page and says so. A one-page preview
        captioned as the whole eleven-page pack is the kind of small untruth that
        costs a person their trust in every other figure on the screen.
      */}
      <p className={styles.pageFoot}>
        Page 1 of {document.pages} · preview of the generated document
      </p>
    </>
  )
}
