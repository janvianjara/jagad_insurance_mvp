import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { ConfirmGate, OcrField, OcrFormProvider, OcrSubmit } from '../../components/guardrails'
import type { ConfirmChange, OcrFieldState } from '../../components/guardrails'
import type { QueueDrawerControls } from '../../components/WorkQueue'
import type { User } from '../../domain/permissions'
import { canSeeClass } from '../../domain/permissions'
import { Badge, StatusPill } from '../../ui/signal'
import { DateTime, MaskedValue, RecordId, RelativeTime } from '../../ui/type'
import { Icon } from '../../ui/Icon'
import { DOC_TYPE_LABEL, REVIEW_LABEL, REVIEW_TONE } from '../documents/document-view'
import type { DocumentSubject } from '../documents/data/vault'
import type { OcrReviewDesk, OcrReviewRow } from './data/ocr-review-desk'
import { nothingExtracted, stillWaiting } from './data/ocr-review-desk'
import { REVIEW_PROGRESS, REVIEW_PROGRESS_LABEL, daysWaiting } from './ocr-review-view'
import styles from './OcrReview.module.css'

export type OcrReviewDrawerProps = {
  row: OcrReviewRow
  desk: OcrReviewDesk
  /** The record this document hangs off, when the vault could resolve one. */
  subject: DocumentSubject | null
  actor: User
  now: Date
  queue: QueueDrawerControls
}

/**
 * One document, beside what the extractor made of it — FR-16, charter U10.
 *
 * This is the screen the product's strongest guardrail is easiest to see on, so
 * it is built to show the rule rather than merely to obey it:
 *
 *   **Nothing commits silently.** Every extracted value is an `<OcrField>` inside
 *   an `<OcrFormProvider>`. The provider refuses the form's own submit handler
 *   while a single extraction is unconfirmed — not just the button, the handler —
 *   and the count of what is still outstanding is printed above the control
 *   rather than left to be discovered by clicking a dead button.
 *
 *   **Confirming is an outward act, so it is gated.** The submit arms a
 *   `<ConfirmGate>` that lists every value that will be recorded, beside what the
 *   extractor originally read. Cancel writes nothing: the mutation lives in the
 *   gate's `onConfirm` and nowhere else.
 *
 *   **Editing withdraws confirmation.** That is `<OcrField>`'s own behaviour and
 *   nothing here overrides it. A correction is still a reading that wants a
 *   second look, and the original read is kept either way.
 *
 * Two things this drawer deliberately does not show. The document's own body
 * text is `document-content` (§14.1) and is not rendered, summarised or passed
 * anywhere — the MVP serves no file, and the pane on the left says so in one
 * line rather than drawing an empty frame. And an Aadhaar reading arrives here
 * already reduced to four characters by `maskExtractedValue`, which runs before
 * a value can become an `<OcrField>` at all — because that component writes its
 * extraction into a `data-extracted` attribute, and an attribute is a leak.
 */
export function OcrReviewDrawer({
  row,
  desk,
  subject,
  actor,
  now,
  queue,
}: OcrReviewDrawerProps) {
  const { document, extractions } = row

  /** Verdicts as a person makes them, before the gate. Never read for a value. */
  const [pending, setPending] = useState<Readonly<Record<string, OcrFieldState>>>({})
  const [armed, setArmed] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const waiting = stillWaiting(row)
  const seesContent = canSeeClass(actor, 'document-content')
  const waited = daysWaiting(document, now)

  /**
   * The readings split the way the KYC file splits them, and for the same
   * reason: `<OcrField>` starts every field unconfirmed whatever it is handed,
   * so a value somebody has already vouched for must not be put back in front of
   * them as though nobody had. Confirmed readings render read-only; the rest are
   * the form.
   */
  const settled = extractions.filter((extraction) => extraction.confirmed)
  const outstanding = extractions.filter((extraction) => !extraction.confirmed)

  /** Every outstanding reading, as it stands after this session's edits. */
  const verdicts = outstanding.map((extraction) => {
    const verdict = pending[extraction.name]
    return {
      name: extraction.name,
      label: extraction.label,
      value: verdict?.value ?? extraction.value,
      extracted: extraction.extraction.value,
      confirmed: verdict?.confirmed ?? extraction.confirmed,
    }
  })

  const changes: readonly ConfirmChange[] = verdicts.map((verdict) => ({
    key: verdict.name,
    label: verdict.label,
    from: verdict.extracted === verdict.value ? undefined : `read as ${verdict.extracted}`,
    to: verdict.value,
  }))

  function accept() {
    const outcome = desk.accept({
      documentId: document.id,
      verdicts: verdicts.map((verdict) => ({
        name: verdict.name,
        value: verdict.value,
        extracted: verdict.extracted,
        confirmed: verdict.confirmed,
        actorId: actor.id,
      })),
      now,
    })

    setArmed(false)

    if (!outcome.ok) {
      // The domain's own sentence, unedited. Softening it would hide which rule
      // actually stopped the write.
      setRefusal(outcome.reason)
      return
    }

    setRefusal(null)
    // The row's outstanding count has changed, so the page behind must be
    // re-read. The drawer comes back showing the confirmed readings read-only,
    // which is a receipt that survives rather than one that flashes past.
    queue.reload()
  }

  return (
    <div className={styles.drawer}>
      <div className={styles.split}>
        {/* The document. Metadata only — the MVP serves no file, and the pane
            says that rather than drawing an empty viewer frame. */}
        <section className={styles.paper} aria-label="The document">
          <div className={styles.paperHead}>
            <RecordId systemNo={document.systemNo} showInsurer={false} />
            <Badge caps>v{document.version}</Badge>
          </div>

          <dl className={styles.facts}>
            <dt>Type</dt>
            <dd>{DOC_TYPE_LABEL[document.docType]}</dd>

            <dt>About</dt>
            <dd>
              {subject?.href ? (
                <Link to={subject.href}>{subject.label}</Link>
              ) : (
                (subject?.label ?? document.subjectId)
              )}
              <span className={styles.factNote}>{document.subjectEntity}</span>
            </dd>

            <dt>Review</dt>
            <dd>
              <StatusPill tone={REVIEW_TONE[document.reviewState]}>
                {REVIEW_LABEL[document.reviewState]}
              </StatusPill>
            </dd>

            <dt>Uploaded by</dt>
            <dd>{document.uploadedByName ?? 'Nobody yet'}</dd>

            <dt>Submitted</dt>
            <dd>
              {document.submittedAt === null ? (
                'Not submitted'
              ) : (
                <>
                  <DateTime value={document.submittedAt} />
                  <span className={styles.factNote}>
                    <RelativeTime value={document.submittedAt} now={now} addSuffix />
                    {waited !== null && waited >= 1 ? ' waiting to be read' : null}
                  </span>
                </>
              )}
            </dd>
          </dl>

          <p className={styles.note}>
            {seesContent
              ? `Held as ${document.fileName ?? 'no file yet'}. The MVP records that the document exists and what state it is in; it does not serve the file, and nothing on this screen renders a word of what it says.`
              : 'Your role does not hold the document-content grant, so the file’s own details are not shown. What the extractor read is below, and confirming it is what this screen is for.'}
          </p>
        </section>

        {/* What the extractor made of it. */}
        <section className={styles.reading} aria-label="Extracted values">
          {nothingExtracted(row) ? (
            <p className={styles.gap} data-empty="no-extraction">
              {REVIEW_PROGRESS_LABEL[REVIEW_PROGRESS.none]}. No extraction was run over this
              document, so there is nothing here for a person to vouch for — this row is on the
              queue because the document itself has not been reviewed, which is done beside the
              record it belongs to.
            </p>
          ) : (
            <>
              <p className={styles.readingHead}>
                {waiting === 0
                  ? 'Every extraction here has been confirmed.'
                  : waiting === 1
                    ? '1 of these values still needs a person. Nothing is on the record until it has one.'
                    : `${waiting} of these values still need a person. Nothing is on the record until they have one.`}
              </p>

              {settled.length > 0 ? (
                <div className={styles.receipt}>
                  <p className={styles.receiptHead}>
                    <Icon name="check" size="sm" />
                    {settled.length === 1
                      ? '1 value a person has vouched for'
                      : `${settled.length} values a person has vouched for`}
                  </p>
                  <dl className={styles.facts}>
                    {settled.map((extraction) => (
                      <Fragment key={extraction.name}>
                        <dt>{extraction.label}</dt>
                        <dd>
                          {extraction.masked ? (
                            <MaskedValue value={extraction.value} kind="aadhaar" />
                          ) : (
                            extraction.value
                          )}
                          {extraction.value === extraction.extraction.value ? null : (
                            <span className={styles.factNote}>
                              read as {extraction.extraction.value}
                            </span>
                          )}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                  {/* The honest hole, said where the effect would be looked for. */}
                  <p className={styles.gap} data-empty="review-state">
                    The document’s own review state is unchanged: the documents repository is
                    read-only in this MVP and has no move that verifies a document. What is recorded
                    is the verdict and who gave it; the confirmed values reach a policy record on
                    the issuance desk, where the issue gates are.
                  </p>
                  <Link className={styles.drawerLink} to="/back-office/issuance">
                    Open the issuance queue
                    <Icon name="chevron-right" size="sm" />
                  </Link>
                </div>
              ) : null}

              {outstanding.length > 0 ? (
                <OcrFormProvider onSubmit={() => setArmed(true)}>
                  {outstanding.map((extraction) => (
                    <div key={extraction.name} className={styles.field}>
                      <OcrField
                        name={extraction.name}
                        label={extraction.label}
                        extraction={extraction.extraction}
                        hint={
                          extraction.masked
                            ? 'Masked at extraction. Four characters is everything the extractor passed on, and everything this platform will ever hold.'
                            : `Read from ${document.systemNo}.`
                        }
                        onChange={(state) =>
                          setPending((draft) => ({ ...draft, [state.name]: state }))
                        }
                      />
                      {extraction.masked ? (
                        <p className={styles.maskedNote}>
                          <MaskedValue
                            value={extraction.extraction.value}
                            kind="aadhaar"
                            caption="on the record"
                          />
                        </p>
                      ) : null}
                    </div>
                  ))}

                  <OcrSubmit>Record these confirmations</OcrSubmit>
                </OcrFormProvider>
              ) : null}
            </>
          )}

          {refusal ? (
            <p className={styles.refusal} role="alert">
              {refusal}
            </p>
          ) : null}

          {armed ? (
            <ConfirmGate
              title="Record these extracted values?"
              changes={changes}
              note="Each value is recorded against the document with what the extractor originally read kept beside it. Nothing is sent to anybody, and the document’s own review state does not change."
              confirmLabel="Record them"
              receipt="Recorded. Your name and the time are against each value."
              onCancel={() => setArmed(false)}
              onConfirm={accept}
            />
          ) : null}
        </section>
      </div>
    </div>
  )
}
