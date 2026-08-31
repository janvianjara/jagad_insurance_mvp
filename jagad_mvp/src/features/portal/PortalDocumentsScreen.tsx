import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { MaskedField } from '../../components/MaskedField'
import { DateTime, RecordId } from '../../ui/type'
import { DOC_TYPE_LABEL } from '../documents/document-view'
import { portalDesk } from './data/portal-desk'
import type { PortalDocument } from './data/portal-desk'
import { usePortalIdentity } from './portal-session'
import styles from './Portal.module.css'

/**
 * `/portal/documents` — the customer's own papers, and only theirs.
 *
 * Every record on this page was read through `documents.forSubject` against a
 * subject the customer owns: their own file, one of their policies, one of their
 * claims. There is no list read on this screen and therefore no filtering in the
 * component — the scope is the query, which is what makes the privacy claim
 * testable rather than a comment.
 *
 * **Identity numbers are last four, always.** Aadhaar and PAN render through
 * `<MaskedValue>`, which has no prop that reveals a full value and never will.
 * The number shown is the customer's own record, not something read off the
 * document: this feature does not look inside a document at all, and `fileName`,
 * `extractedText` and the OCR readings never reach this screen.
 *
 * **Download is offered where a file exists, and nowhere else.** The MVP records
 * that a document arrived and what it was called; the bytes are not stored, and
 * the fixture URLs point at a scheme no browser can open. A button that produced
 * nothing would be worse than the honest line this renders instead.
 */
export function PortalDocumentsScreen() {
  const repositories = useRepositories()
  const desk = portalDesk(repositories)
  const identity = usePortalIdentity()
  const customerId = identity.customerId ?? ''

  const loaded = useResource(() => desk.documents(customerId), `portal:documents:${customerId}`)

  if (loaded.status === 'loading') {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="45%" height="1.75rem" />
        <Skeleton height="6rem" />
        <Skeleton height="6rem" />
      </div>
    )
  }

  if (loaded.status === 'error') {
    return (
      <EmptyState
        variant="error"
        title="Your documents could not be loaded"
        explanation={loaded.error?.message ?? 'The request failed before anything was read.'}
        action={
          <Button variant="primary" onClick={() => loaded.reload()}>
            Try again
          </Button>
        }
      />
    )
  }

  const rows = loaded.data ?? []
  const waiting = rows.filter((row) => !row.record.isPresent)
  const held = rows.filter((row) => row.record.isPresent)

  return (
    <>
      <div className={styles.screenHead}>
        <h1 className={styles.title}>My documents</h1>
        <p className={styles.lead}>
          Everything filed against you, your policies and your claims. Identity numbers are shown as
          the last four characters only.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing is filed against you yet"
          explanation="A document appears here once it has been recorded against your file, one of your policies or one of your claims — whether you sent it or Jagad Insurance filed it for you."
        />
      ) : null}

      {waiting.length > 0 ? (
        <section className={`${styles.card} ${styles.nextUp}`} aria-label="Still to reach us">
          <p className={styles.nextUpKicker}>Still to reach us</p>
          <ul className={styles.attentionList}>
            {waiting.map((row) => (
              <li key={row.record.id} className={styles.attentionItem}>
                <span className={styles.attentionTitle}>{DOC_TYPE_LABEL[row.record.docType]}</span>
                <span className={styles.attentionDetail}>
                  Asked for against {row.belongsTo.toLowerCase()}. Jagad Insurance sends a one-off
                  link to your phone when it is time to send this; the link expires and is not a
                  login.
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {held.length > 0 ? (
        <ul className={styles.list}>
          {held.map((row) => (
            <li key={row.record.id}>
              <DocumentCard row={row} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

function DocumentCard({ row }: { row: PortalDocument }) {
  const { record } = row
  const downloadable = isFetchable(record.fileUrl)

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h2 className={styles.cardTitle}>{DOC_TYPE_LABEL[record.docType]}</h2>
          <p className={styles.cardMeta}>{row.belongsTo}</p>
        </div>
        <StatusPill tone={record.reviewState === 'verified' ? 'ok' : 'info'}>
          {record.reviewState === 'verified' ? 'Verified' : 'On file'}
        </StatusPill>
      </div>

      <RecordId systemNo={record.systemNo} showInsurer={false} />

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Received</dt>
          <dd className={styles.factValue}>
            <DateTime value={record.submittedAt} mode="date" absentText="date not recorded" />
          </dd>
        </div>
        {row.identityKind !== null ? (
          <div className={styles.fact}>
            <dt className={styles.factLabel}>On your record</dt>
            <dd className={styles.factValue}>
              {row.identityKind === 'aadhaar' ? (
                <MaskedField
                  label="Aadhaar"
                  last4={row.identityValue}
                  note="Jagad Insurance stores the last four digits only. The full number is never held."
                />
              ) : (
                <MaskedField label="PAN" value={row.identityValue} kind="pan" />
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      {downloadable ? (
        <a className={styles.disclosure} href={record.fileUrl ?? '#'} download>
          <Button variant="quiet" icon="doc">
            Download
          </Button>
        </a>
      ) : (
        <p className={styles.note}>
          Jagad Insurance has recorded this document but does not hold a copy you can download from
          here yet. Ask your agent and they will send it to you.
        </p>
      )}
    </article>
  )
}

/**
 * Whether the browser could actually fetch this. The MVP stores presence rather
 * than bytes, so the recorded URLs use a scheme nothing can open — offering a
 * download button over one of those would be a button that does nothing.
 */
function isFetchable(url: string | null): boolean {
  if (url === null) return false
  return url.startsWith('https://') || url.startsWith('http://') || url.startsWith('blob:')
}

export default PortalDocumentsScreen
