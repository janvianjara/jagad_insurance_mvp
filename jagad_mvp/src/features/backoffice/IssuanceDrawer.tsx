import { Link } from 'react-router'
import { POLICY_STATES } from '../../domain/workflows'
import type { KycState } from '../../domain/workflows'
import type { DocumentRecord, Product } from '../../data/repo'
import type { QueueDrawerControls } from '../../components/WorkQueue'
import { Icon } from '../../ui/Icon'
import { StatusPill } from '../../ui/signal'
import { DateTime, Money, RecordId, RelativeTime } from '../../ui/type'
// The issuance panel by its own path: it is the screen that already knows how to
// read an insurer document, confirm what it says and run §9's two gates, and
// this drawer's whole job is to put it beside the row rather than build a second
// one. The feature index would pull three more screens in behind it.
import { IssuancePanel } from '../policies/IssuancePanel'
import { PAYMENT_LABEL, PAYMENT_TONE, POLICY_LABEL, POLICY_TONE } from '../policies/policy-view'
import type { IssuanceDesk, IssuanceRow } from './data/issuance-desk'
import {
  documentsAwaitingReview,
  inDeskSince,
  insurerHasAnswered,
  insurerNumberStateOf,
  issuanceOutstanding,
  policyDocumentPresent,
} from './issuance-view'
import styles from './Issuance.module.css'

export type IssuanceDrawerProps = {
  row: IssuanceRow
  desk: IssuanceDesk
  /** Resolved once for the whole queue; a row and its drawer share one clock. */
  now: Date
  customerName: string
  /** The proposer's KYC, off the customer record. One of §9's two issue gates reads it. */
  kycState: KycState
  /** What the policy was entered on, so the wrong document can be recognised as wrong. */
  product: Product | null
  companyName: string
  /** Every document hanging off this policy. Presence and review state only. */
  documents: readonly DocumentRecord[]
  queue: QueueDrawerControls
}

/**
 * One policy, in the shell's drawer — the desk where the insurer's answer is
 * recorded.
 *
 * Everything that writes here is `<IssuancePanel>`, which the policies feature
 * already built for canvas 3.6 and which this drawer deliberately does not
 * reimplement. That panel owns the whole of the act: the document arrives, the
 * extractor reads it, every reading is an `<OcrField>` a person has to confirm,
 * and issuing goes through `<ConfirmGate>` and then through `policyMachine`,
 * which refuses in its own words when KYC is short or no Final Premium was
 * typed. A second issue button on this screen would be a second set of rules.
 *
 * Three things this drawer adds, and each is a fact the panel has no reason to
 * know:
 *
 *   **Both numbers, at the top.** §8's dual numbering is the reason this queue
 *   exists — `systemNo` from entry, `insurerNo` when the insurer answers — and
 *   `<RecordId>` draws the absent half as "awaited" rather than as a gap.
 *
 *   **What is outstanding, in sentences.** Money collected, documents on file,
 *   documents still waiting on a reviewer. Read-only, every one of them: there
 *   is no control anywhere in this drawer that accepts a figure, and the premium
 *   renders through `<Money>` off the record (D3).
 *
 *   **The honest hole.** A policy that is already live with no insurer number on
 *   it has nowhere to go from here: `PolicyRepository` writes `insurerNo` only on
 *   the `issue` edge, so once a policy is issued there is no move that records a
 *   number that arrived late. That is said plainly rather than hidden behind a
 *   disabled button.
 */
export function IssuanceDrawer({
  row,
  desk,
  now,
  customerName,
  kycState,
  product,
  companyName,
  documents,
  queue,
}: IssuanceDrawerProps) {
  const { policy, draft } = row
  const awaitingNumber = insurerNumberStateOf(policy) === 'awaited'
  const answered = insurerHasAnswered(policy.status)
  const outstanding = issuanceOutstanding({ policy, draft, documents, now })
  const savedAt = inDeskSince(draft)
  const waitingDocuments = documentsAwaitingReview(documents)

  /** The panel is offered only while the insurer's answer is still to be recorded. */
  const canStillIssue =
    policy.status === POLICY_STATES.proposal || policy.status === POLICY_STATES.sent

  return (
    <div className={styles.drawer}>
      <div className={styles.standing}>
        <RecordId systemNo={policy.systemNo} insurerNo={policy.insurerNo} layout="stacked" />
        <StatusPill tone={POLICY_TONE[policy.status]}>{POLICY_LABEL[policy.status]}</StatusPill>
      </div>

      <dl className={styles.facts}>
        <dt>Customer</dt>
        <dd>{customerName}</dd>

        <dt>Cover</dt>
        <dd>
          {product?.name ?? 'Product not resolved'}
          <span className={styles.factNote}>{companyName}</span>
        </dd>

        <dt>Final premium</dt>
        <dd>
          {/* Recorded, never derived, and there is no control in this drawer
              that changes it. The panel below is the only place a figure enters
              this feature, and it enters as text a person confirmed. */}
          <Money paise={policy.finalPremium?.paise ?? null} emphasis="strong" />
        </dd>

        <dt>Premium collected</dt>
        <dd>
          <StatusPill tone={PAYMENT_TONE[policy.paymentState]}>
            {PAYMENT_LABEL[policy.paymentState]}
          </StatusPill>
        </dd>

        <dt>Documents</dt>
        <dd>
          {policyDocumentPresent(documents)
            ? 'The insurer policy document is on file.'
            : 'No insurer policy document is on file.'}
          {waitingDocuments > 0 ? (
            <span className={styles.factNote}>
              {waitingDocuments === 1
                ? 'One document here is still waiting on a reviewer.'
                : `${waitingDocuments} documents here are still waiting on a reviewer.`}{' '}
              <Link to="/back-office/ocr-review">Open the review queue</Link>
            </span>
          ) : null}
        </dd>

        <dt>In the desk since</dt>
        <dd>
          {savedAt === null ? (
            <>
              Not recorded
              <span className={styles.factNote}>
                This policy has no entry beside it, so the book holds no date for when it reached
                this desk. Nothing here invents one.
              </span>
            </>
          ) : (
            <>
              <DateTime value={savedAt} />
              <span className={styles.factNote}>
                <RelativeTime value={savedAt} now={now} addSuffix /> — when the entry was last
                saved, which is the only clock the record carries.
              </span>
            </>
          )}
        </dd>
      </dl>

      {outstanding.length > 0 ? (
        <ul className={styles.outstanding}>
          {outstanding.map((sentence) => (
            <li key={sentence} className={styles.outstandingItem}>
              <Icon name="alert" size="sm" />
              {sentence}
            </li>
          ))}
        </ul>
      ) : null}

      {canStillIssue ? (
        <IssuancePanel
          policy={policy}
          draft={draft}
          kycState={kycState}
          product={product}
          desk={desk.policies}
          now={now}
          // The row has changed state, so the page behind must be re-read. The
          // drawer stays open on purpose: the panel's receipt is what says what
          // actually went out, and closing over it would hide it.
          onChanged={() => queue.reload()}
        />
      ) : (
        <div className={styles.settled}>
          <p className={styles.settledHead}>
            <Icon name="check" size="sm" />
            The insurer has answered and this policy is live.
          </p>

          {answered && awaitingNumber ? (
            // The honest hole. Naming it beats a disabled button nobody can
            // explain, and it is a real gap in the data layer rather than a
            // decision this screen took.
            <p className={styles.gap} data-empty="insurer-no">
              The insurer’s own number is not on this record, and there is no move on this desk
              that records one after issue: the policy repository writes the insurer number on the
              issue edge and nowhere else. The gap is real and is stated rather than hidden behind a
              control that would do nothing.
            </p>
          ) : null}

          <p className={styles.note}>
            Sending the document to the customer and recording what became of it are done on the
            policy’s own file, next to the dispatch log.
          </p>
        </div>
      )}

      <Link className={styles.drawerLink} to={`/policies/${policy.id}`}>
        Open the full policy file
        <Icon name="chevron-right" size="sm" />
      </Link>
    </div>
  )
}
