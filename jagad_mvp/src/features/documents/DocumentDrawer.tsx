import { Link } from 'react-router'
import type { DocumentRecord } from '../../data/repo'
import { canSeeClass } from '../../domain/permissions'
import type { User } from '../../domain/permissions'
import { Badge, StatusPill } from '../../ui/signal'
import { DateTime, MaskedValue, RelativeTime } from '../../ui/type'
import type { DocumentAccess, DocumentSubject } from './data/vault'
import { DOC_TYPE_LABEL, REVIEW_LABEL, REVIEW_TONE, isIdentityDocument } from './document-view'
import styles from './Documents.module.css'

export type DocumentDrawerProps = {
  document: DocumentRecord
  subject: DocumentSubject | null
  retentionLabel: string
  retentionYears: number | null
  user: User
  now: Date
  /** Every recorded open of this document, newest first. */
  accesses: readonly DocumentAccess[]
  /** Staff id to the name to print in the log. */
  actorName: (id: string) => string
}

/**
 * One document, in the shell's drawer.
 *
 * Read-only, and content-free unless the template holds the grant. What is here:
 *
 *   - the metadata: type, version, review state, retention class and its term,
 *     presence, who uploaded it, when it was submitted and verified;
 *   - the record it belongs to, as a link;
 *   - the identity it evidences, MASKED, and only for an identity document and
 *     only for a template holding the `sensitive` grant. `<MaskedValue>` takes
 *     the value and returns the last four characters; there is no prop that
 *     reveals more and no path here that could build one. The full number does
 *     not exist in the store either — `Customer.aadhaarNumber` is typed `null`
 *     and never populated;
 *   - the file's own name, ONLY for a template holding `document-content`. The
 *     file itself is not served: the MVP records that a document exists and what
 *     state it is in, and the access log says `metadata` so a later audit cannot
 *     read an open here as somebody having seen the paper;
 *   - the access log for this document, so the person opening it can see that
 *     their open was recorded — the requirement is not just that opens are
 *     logged, it is that nobody is surprised by it.
 *
 * The OCR values are deliberately absent even for a `document-content` holder.
 * Reviewing an extraction is `/back-office/ocr-review`'s job, behind `<OcrField>`
 * and its no-silent-commit rule; showing the same values here read-only would be
 * a second, unguarded surface onto them.
 */
export function DocumentDrawer({
  document,
  subject,
  retentionLabel,
  retentionYears,
  user,
  now,
  accesses,
  actorName,
}: DocumentDrawerProps) {
  const seesContent = canSeeClass(user, 'document-content')
  const seesSensitive = canSeeClass(user, 'sensitive')
  const showsIdentity =
    seesSensitive &&
    isIdentityDocument(document) &&
    subject !== null &&
    (subject.aadhaarLast4 !== null || subject.panNumber !== null)

  return (
    <div className={styles.drawer}>
      <dl className={styles.facts}>
        <dt>Type</dt>
        <dd>{DOC_TYPE_LABEL[document.docType]}</dd>

        <dt>Version</dt>
        <dd>
          <Badge caps>v{document.version}</Badge>
        </dd>

        <dt>Review</dt>
        <dd>
          <StatusPill tone={REVIEW_TONE[document.reviewState]}>
            {REVIEW_LABEL[document.reviewState]}
          </StatusPill>
        </dd>

        <dt>On file</dt>
        <dd>{document.isPresent ? 'Yes' : 'Not yet — the line is still outstanding'}</dd>

        <dt>Retention</dt>
        <dd>
          {retentionLabel}
          {retentionYears === null ? null : ` · kept ${retentionYears} years`}
        </dd>

        <dt>Uploaded by</dt>
        <dd>{document.uploadedByName ?? 'Nobody yet'}</dd>

        <dt>Submitted</dt>
        <dd>
          <RelativeTime value={document.submittedAt} now={now} absentText="not submitted" />
        </dd>

        <dt>Verified</dt>
        <dd>
          <RelativeTime value={document.verifiedAt} now={now} absentText="not verified" />
        </dd>
      </dl>

      {showsIdentity ? (
        <div className={styles.identity}>
          <p className={styles.identityHead}>What it evidences</p>
          <div className={styles.identityValues}>
            <MaskedValue value={subject.aadhaarLast4} kind="aadhaar" caption="Aadhaar" />
            <MaskedValue value={subject.panNumber} kind="pan" caption="PAN" />
          </div>
          <p className={styles.note}>
            Last four characters only. The staff interface holds no representation of a full
            identity number anywhere, and neither does the record behind this screen.
          </p>
        </div>
      ) : null}

      {subject?.href ? (
        <Link className={styles.drawerLink} to={subject.href}>
          Open the {document.subjectEntity.toLowerCase()} this belongs to
        </Link>
      ) : (
        <p className={styles.note}>
          The {document.subjectEntity.toLowerCase()} this belongs to has no screen in the route map
          yet, so there is nowhere to open.
        </p>
      )}

      <div className={styles.file}>
        <p className={styles.identityHead}>The file</p>
        {seesContent ? (
          <p className={styles.note}>
            Held as <span className={styles.fileName}>{document.fileName ?? 'no file yet'}</span>.
            The MVP records that the document exists and what state it is in; it does not serve the
            file, and this open is logged as metadata for that reason.
          </p>
        ) : (
          <p className={styles.note}>
            Your role does not hold the document-content grant, so the file’s own details are not
            shown. The metadata above is what the vault gives you.
          </p>
        )}
      </div>

      <div className={styles.accessLog}>
        <p className={styles.identityHead}>Access log</p>
        {accesses.length === 0 ? (
          <p className={styles.note}>
            This open is being recorded now and will appear here. Every open of every document is
            logged, including yours.
          </p>
        ) : (
          <ul className={styles.accessList}>
            {accesses.map((entry) => (
              <li key={entry.id} className={styles.accessRow}>
                <DateTime value={entry.openedAt} mode="datetime" />
                <span className={styles.accessActor}>{actorName(entry.actorId)}</span>
                <span className={styles.accessShown}>{entry.shown}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
