import { useState } from 'react'
import type { CollectionRecord } from '../../data/repo'
import type { User } from '../../domain/permissions'
import { ConfirmGate } from '../../components/guardrails'
import type { QueueDrawerControls } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { Field, Input, Textarea } from '../../ui/form'
import { StatusPill } from '../../ui/signal'
import { DateTime, Money, RelativeTime } from '../../ui/type'
import { canIssueReceipt } from '../../domain/workflows'
import {
  COLLECTION_LABEL,
  COLLECTION_TONE,
  INSTRUMENT_LABEL,
  MODE_LABEL,
  ROUTE_LABEL,
  canBounce,
  daysWaiting,
} from './collection-view'
import type { CollectionDesk } from './data/collection-desk'
import { isBackOfficeVerifier } from './data/collection-desk'
import styles from './Collections.module.css'

export type CollectionDrawerProps = {
  collection: CollectionRecord
  desk: CollectionDesk
  /**
   * The signed-in user as the session store resolved them — the shape `can()`
   * evaluates, not the staff record. §9 refuses a verifier who took the money.
   */
  actor: User
  now: Date
  customerName: string
  collectedByName: string
  queue: QueueDrawerControls
}

/** Which of the two moves the drawer is currently previewing, if either. */
type Pending = 'verify' | 'bounce' | null

/**
 * One collection, in the shell's drawer — and the only place in the product
 * where a collection is verified.
 *
 * Everything this drawer can do is a §9 move on `collectionMachine`, so nothing
 * here decides anything: it collects what the machine's command needs, shows the
 * person what will change, and reports the machine's own refusal sentence when it
 * says no. Three rules hold the screen honest and each is visible in the code:
 *
 *   No amount is entered. `<Money>` reads `collection.amount` and there is no
 *   control that accepts a figure. The record-only rule (D3) is at its most
 *   fragile on a screen about money that also has a button, so the absence is
 *   deliberate rather than incidental.
 *
 *   No receipt. `canIssueReceipt()` refuses unconditionally, and its sentence is
 *   printed where a person would look for the button rather than left for them to
 *   discover by asking.
 *
 *   Cancel writes nothing. `<ConfirmGate>` owns that promise; what this file must
 *   not do is act before Confirm, which is why the mutation lives in the gate's
 *   `onConfirm` and nowhere else.
 *
 * The bounce control is offered only for a cheque, because the machine refuses it
 * for anything else — a button that exists to be refused teaches people to
 * distrust the screen.
 */
export function CollectionDrawer({
  collection,
  desk,
  actor,
  now,
  customerName,
  collectedByName,
  queue,
}: CollectionDrawerProps) {
  const [pending, setPending] = useState<Pending>(null)
  const [bounceReason, setBounceReason] = useState('')
  const [followUpDueOn, setFollowUpDueOn] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)

  const waited = daysWaiting(collection, now)
  const mayVerify = isBackOfficeVerifier(actor)
  const isOwnCollection = collection.collectedBy === actor.id

  async function runVerify() {
    setRefusal(null)
    const result = await desk.verify(collection.id, {
      actorId: actor.id,
      verifiedBy: actor.id,
      verifierIsBackOffice: mayVerify,
      now,
    })
    if (!result.ok) {
      setRefusal(result.reason)
      setPending(null)
      return
    }
    // The row has left the queue, so the list behind must be re-read: `?record=`
    // is not part of the query key and closing alone would leave it standing.
    queue.reload()
    queue.close()
  }

  async function runBounce() {
    setRefusal(null)
    const result = await desk.markBounced(collection.id, {
      actorId: actor.id,
      bounceReason,
      // §9: the follow-up task is part of the same move, not a later nicety.
      followUpTaskCreated: true,
      followUpTaskDueOn: followUpDueOn,
      now,
    })
    if (!result.ok) {
      setRefusal(result.reason)
      setPending(null)
      return
    }
    queue.reload()
    queue.close()
  }

  return (
    <div className={styles.drawer}>
      <dl className={styles.facts}>
        <dt>State</dt>
        <dd>
          <StatusPill tone={COLLECTION_TONE[collection.state]}>
            {COLLECTION_LABEL[collection.state]}
          </StatusPill>
        </dd>

        <dt>Customer</dt>
        <dd>{customerName}</dd>

        <dt>Amount</dt>
        <dd>
          {/* Recorded, never derived. There is no control here that changes it. */}
          <Money paise={collection.amount?.paise ?? null} emphasis="strong" />
        </dd>

        <dt>Instrument</dt>
        <dd>{INSTRUMENT_LABEL[collection.instrument]}</dd>

        <dt>Route</dt>
        <dd>{ROUTE_LABEL[collection.route]}</dd>

        <dt>Taken</dt>
        <dd>
          {MODE_LABEL[collection.mode]}
          {collection.mode === 'on_field' ? (
            <span className={styles.factNote}>
              An on-field collection cannot close until the back office has verified it.
            </span>
          ) : null}
        </dd>

        <dt>Reference</dt>
        <dd>{collection.reference ?? 'None recorded'}</dd>

        <dt>Collected by</dt>
        <dd>{collectedByName}</dd>

        <dt>Collected</dt>
        <dd>
          {collection.collectedAt === null ? (
            'Not recorded'
          ) : (
            <>
              <DateTime value={collection.collectedAt} />
              <span className={styles.factNote}>
                <RelativeTime value={collection.collectedAt} now={now} />
                {waited !== null && waited >= 1 ? ' waiting to be checked' : null}
              </span>
            </>
          )}
        </dd>
      </dl>

      {/* The refusal comes from the machine and is rendered as written. Softening
          it would hide which rule actually stopped the move. */}
      {refusal ? (
        <p className={styles.refusal} role="alert">
          {refusal}
        </p>
      ) : null}

      {pending === null ? (
        <div className={styles.actions}>
          <Button
            variant="primary"
            icon="check"
            disabled={!mayVerify || isOwnCollection}
            onClick={() => setPending('verify')}
          >
            Verify this collection
          </Button>

          {canBounce(collection) ? (
            <Button icon="alert" onClick={() => setPending('bounce')}>
              Record a bounce
            </Button>
          ) : null}

          {!mayVerify ? (
            <p className={styles.blocked}>
              Verification of a collection is a back-office act, and this account is not back-office
              staff.
            </p>
          ) : null}

          {mayVerify && isOwnCollection ? (
            <p className={styles.blocked}>
              You recorded this collection. The person who collected the money cannot be the person
              who verifies it.
            </p>
          ) : null}
        </div>
      ) : null}

      {pending === 'verify' ? (
        <ConfirmGate
          title="Verify this collection?"
          changes={[
            { key: 'state', label: 'State', from: 'Awaiting verification', to: 'Verified' },
            { key: 'by', label: 'Verified by', to: actor.name },
            { key: 'amount', label: 'Amount as recorded', to: <Money paise={collection.amount?.paise ?? null} /> },
          ]}
          note={
            <>
              This records that the money arrived. {receiptNote()}
            </>
          }
          confirmLabel="Verify"
          receipt="Verified. The collection has left this queue."
          onConfirm={() => void runVerify()}
          onCancel={() => setPending(null)}
        />
      ) : null}

      {pending === 'bounce' ? (
        <div className={styles.bounceForm}>
          <Field
            label="What the bank said"
            hint="Recorded as written. A bounce with no reason cannot be chased."
          >
            <Textarea
              value={bounceReason}
              rows={2}
              onChange={(event) => setBounceReason(event.target.value)}
            />
          </Field>

          <Field label="Follow-up due" hint="The chase task is raised as part of this same move.">
            <Input
              type="date"
              value={followUpDueOn}
              onChange={(event) => setFollowUpDueOn(event.target.value)}
            />
          </Field>

          <ConfirmGate
            title="Record this cheque as bounced?"
            // An empty list disables Confirm, which is exactly the behaviour
            // wanted while either field is blank: the machine would refuse the
            // move, and a gate that offers a button the machine will reject
            // teaches people to click through refusals.
            changes={
              bounceReason.trim() === '' || followUpDueOn === ''
                ? []
                : [
                    { key: 'state', label: 'State', from: 'Awaiting verification', to: 'Bounced' },
                    { key: 'reason', label: 'Bank reason', to: bounceReason.trim() },
                    { key: 'task', label: 'Follow-up task', to: `Due ${followUpDueOn}` },
                  ]
            }
            note="The collection reopens: the money is still owed. The customer and the collecting agent are told."
            confirmLabel="Record bounce"
            receipt="Bounce recorded, and the follow-up task is on the books."
            onConfirm={() => void runBounce()}
            onCancel={() => setPending(null)}
          />
        </div>
      ) : null}
    </div>
  )
}

/**
 * §9: "Record-only. No receipt slip is issued by the platform."
 *
 * Printed where somebody would look for the button, in the machine's own words,
 * rather than left to be discovered by asking.
 */
function receiptNote() {
  const refusal = canIssueReceipt()
  return refusal.ok ? null : <span className={styles.receiptNote}>{refusal.reason}</span>
}
