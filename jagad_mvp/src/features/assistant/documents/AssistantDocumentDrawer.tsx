import { Button } from '../../../ui/Button'
import { Icon } from '../../../ui/Icon'
import { Drawer } from '../../../ui/surface'
import { DateTime } from '../../../ui/type'
import { DocumentPage } from './DocumentPage'
import type { AssistantDocumentPage } from './document-page'
import styles from './AssistantDocumentDrawer.module.css'

/**
 * Where a produced document is read — the prototype's `#draw`.
 *
 * The prototype hand-rolls a resizable, maximisable panel with Escape ordering.
 * We already have that primitive: `<Drawer>` was ported from this same
 * behaviour in P-06b and is tested. So this component supplies only what is
 * particular to documents — the index of what this conversation produced, the
 * back button between the index and a sheet, and the sheet itself.
 *
 * Two documents surfaces, one at a time, exactly as the prototype has it: an
 * INDEX when the person pressed the count in the header, and a PAGE when they
 * pressed Open on a document card in the feed. `openId` is which.
 */
export function AssistantDocumentDrawer({
  documents,
  openId,
  onOpen,
  onIndex,
  onClose,
}: {
  documents: readonly AssistantDocumentPage[]
  /** Null shows the index. A document id shows that sheet. */
  openId: string | null
  onOpen: (id: string) => void
  onIndex: () => void
  onClose: () => void
}) {
  const open = documents.find((document) => document.id === openId) ?? null
  const showingIndex = open === null

  return (
    <Drawer
      open
      onClose={onClose}
      title={showingIndex ? 'Documents' : open.title}
      subtitle={
        showingIndex
          ? `${documents.length} ${documents.length === 1 ? 'document' : 'documents'} in this conversation`
          : open.fileName
      }
      headerActions={
        showingIndex || documents.length < 2 ? null : (
          <Button variant="quiet" size="sm" icon="folder" onClick={onIndex}>
            All documents
          </Button>
        )
      }
    >
      {showingIndex ? (
        documents.length === 0 ? (
          <p className={styles.empty}>
            Documents produced in this conversation appear here. Nothing has been generated yet.
          </p>
        ) : (
          <ul className={styles.index}>
            {documents.map((document) => (
              <li key={document.id}>
                <button type="button" className={styles.card} onClick={() => onOpen(document.id)}>
                  <span className={styles.thumb} aria-hidden="true">
                    <Icon name="doc" size="sm" />
                  </span>
                  <span className={styles.cardText}>
                    <span className={styles.cardName}>{document.title}</span>
                    <span className={styles.cardMeta}>
                      {document.pages} {document.pages === 1 ? 'page' : 'pages'} ·{' '}
                      {document.reference} · <DateTime value={document.issuedOn} mode="date" />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <DocumentPage document={open} />
      )}
    </Drawer>
  )
}
