/**
 * Dispatch — plan §5's "dispatch" on the Policy detail row, FR-10.9, canvas n24.
 *
 * Until this existed the module could move a policy to `dispatched` and record
 * nothing about where the document went. The state said a thing had happened and
 * the record could not say what: not the channel, not the recipient, not whether
 * it arrived. A policyholder ringing to say the document never came could be
 * answered only with "the system says we sent it".
 *
 * Three decisions are worth stating.
 *
 * **A dispatch is a row, not a status.** A policy commonly has more than one —
 * the e-policy on the day of issue, the physical copy a week later, a re-send
 * after the first came back. One mutable field could only ever describe the most
 * recent, so the panel lists them and the newest is simply the last.
 *
 * **Delivered and confirmed are different claims and are never merged.**
 * `delivered` is what the courier says. `confirmed_by_customer` is what the
 * customer says, recorded by whoever heard it. Only the second is evidence in a
 * dispute, so the panel never lets the first stand in for it and never infers
 * either from the passage of time.
 *
 * **Sending is outward, so it is gated.** The document leaves the agency and
 * reaches a person, which is exactly the class of move `<ConfirmGate>` exists
 * for. Cancel writes nothing — no row, and no state change on the policy.
 */

import { useState } from 'react'
import { ConfirmGate } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import type { DeliveryState, DispatchChannel, PolicyDispatch } from '../../data/repo'
import { Button } from '../../ui/Button'
import { Field, Input, Select } from '../../ui/form'
import { StatusPill } from '../../ui/signal'
import { DateTime } from '../../ui/type'
import type { PolicyDesk } from './data/policy-desk'
import {
  DELIVERY_LABEL,
  DELIVERY_TONE,
  DISPATCH_CHANNEL_LABEL,
  isCourier,
} from './policy-view'
import styles from './DispatchPanel.module.css'

export type DispatchPanelProps = {
  policyId: string
  dispatches: readonly PolicyDispatch[]
  /** Set while the policy has not reached a state a document can be sent from. */
  disabled?: boolean
  disabledReason?: string
  actorId: string
  desk: PolicyDesk
  onChanged: () => void
}

type DispatchDraft = {
  channel: DispatchChannel
  recipientName: string
  recipientContactMasked: string
  courierName: string
  trackingRef: string
}

const EMPTY: DispatchDraft = {
  channel: 'e_policy_email',
  recipientName: '',
  recipientContactMasked: '',
  courierName: '',
  trackingRef: '',
}

/**
 * What the gate lists before anything is written. Every line is a fact the
 * person can check against what they are about to do, which is the whole point
 * of the gate — a confirm dialog that only says "are you sure" confirms nothing.
 */
function changesOf(draft: DispatchDraft): readonly ConfirmChange[] {
  const changes: ConfirmChange[] = [
    { key: 'channel', label: 'Channel', to: DISPATCH_CHANNEL_LABEL[draft.channel] },
    { key: 'recipient', label: 'Recipient', to: draft.recipientName },
    { key: 'contact', label: 'Contact', to: draft.recipientContactMasked },
  ]
  if (isCourier(draft.channel)) {
    changes.push({ key: 'courier', label: 'Courier', to: draft.courierName })
    changes.push({
      key: 'tracking',
      label: 'Tracking',
      to: draft.trackingRef === '' ? 'Not recorded' : draft.trackingRef,
    })
  }
  return changes
}

/** The two things a dispatch cannot go out without, plus the courier's name. */
function incompleteReason(draft: DispatchDraft): string | null {
  if (draft.recipientName.trim() === '') return 'Name who this is going to.'
  if (draft.recipientContactMasked.trim() === '') {
    return 'Record the contact it went to, masked.'
  }
  if (isCourier(draft.channel) && draft.courierName.trim() === '') {
    return 'Name the courier. A physical dispatch with no carrier cannot be chased.'
  }
  return null
}

export function DispatchPanel({
  policyId,
  dispatches,
  disabled = false,
  disabledReason,
  actorId,
  desk,
  onChanged,
}: DispatchPanelProps) {
  const [draft, setDraft] = useState<DispatchDraft | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  async function send(next: DispatchDraft) {
    const outcome = await desk.dispatch(policyId, {
      actorId,
      channel: next.channel,
      recipientName: next.recipientName.trim(),
      recipientContactMasked: next.recipientContactMasked.trim(),
      ...(isCourier(next.channel)
        ? {
            courierName: next.courierName.trim(),
            trackingRef: next.trackingRef.trim() === '' ? null : next.trackingRef.trim(),
          }
        : {}),
    })

    setDraft(null)
    if (!outcome.ok) {
      setRefusal(outcome.reason)
      return
    }
    setRefusal(null)
    onChanged()
  }

  async function mark(dispatch: PolicyDispatch, state: DeliveryState, returnReason?: string) {
    const outcome = await desk.recordDelivery(dispatch.id, { actorId, state, returnReason })
    if (!outcome.ok) {
      setRefusal(outcome.reason)
      return
    }
    setRefusal(null)
    onChanged()
  }

  const blocked = incompleteReason(draft ?? EMPTY)

  return (
    <div className={styles.panel} data-dispatch-panel="">
      {dispatches.length === 0 ? (
        <p className={styles.quiet} data-empty="dispatches">
          Nothing has been sent to the customer yet.
        </p>
      ) : (
        <ol className={styles.log}>
          {dispatches.map((dispatch) => (
            <li key={dispatch.id} className={styles.entry} data-dispatch={dispatch.id}>
              <div className={styles.entryHead}>
                <span className={styles.channel}>{DISPATCH_CHANNEL_LABEL[dispatch.channel]}</span>
                <StatusPill tone={DELIVERY_TONE[dispatch.state]}>
                  {DELIVERY_LABEL[dispatch.state]}
                </StatusPill>
              </div>
              <p className={styles.meta}>
                To {dispatch.recipientName} at {dispatch.recipientContactMasked}, sent{' '}
                <DateTime value={dispatch.dispatchedAt} mode="date" />
                {dispatch.courierName === null ? null : <> by {dispatch.courierName}</>}
                {dispatch.trackingRef === null ? null : <> ({dispatch.trackingRef})</>}.
              </p>
              {dispatch.returnReason === null ? null : (
                <p className={styles.meta}>Came back: {dispatch.returnReason}</p>
              )}
              {/* Confirmation is recorded separately from delivery, and only a
                  dispatch that is not already confirmed can take one. */}
              {dispatch.state === 'confirmed_by_customer' ? (
                <p className={styles.meta}>
                  The customer confirmed receipt on{' '}
                  <DateTime value={dispatch.confirmedAt ?? dispatch.dispatchedAt} mode="date" />.
                </p>
              ) : disabled ? null : (
                <div className={styles.entryActions}>
                  {dispatch.state === 'pending' || dispatch.state === 'in_transit' ? (
                    <Button variant="quiet" onClick={() => void mark(dispatch, 'delivered')}>
                      Courier says delivered
                    </Button>
                  ) : null}
                  <Button
                    variant="quiet"
                    onClick={() => void mark(dispatch, 'confirmed_by_customer')}
                  >
                    Customer confirmed receipt
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {refusal === null ? null : (
        <p className={styles.refusal} role="alert">
          {refusal}
        </p>
      )}

      {disabled ? (
        <p className={styles.quiet}>
          {disabledReason ?? 'A document can be sent once the policy has been issued.'}
        </p>
      ) : draft === null ? (
        <div className={styles.actions}>
          <Button variant="quiet" onClick={() => setDraft(EMPTY)}>
            Record a dispatch
          </Button>
        </div>
      ) : (
        <div className={styles.form}>
          <Field id="dispatch-channel" label="How it went">
            <Select
              id="dispatch-channel"
              value={draft.channel}
              onChange={(event) =>
                setDraft({ ...draft, channel: event.target.value as DispatchChannel })
              }
              options={Object.entries(DISPATCH_CHANNEL_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Field>

          <Field id="dispatch-recipient" label="Who it went to">
            <Input
              id="dispatch-recipient"
              value={draft.recipientName}
              onChange={(event) => setDraft({ ...draft, recipientName: event.target.value })}
            />
          </Field>

          <Field
            id="dispatch-contact"
            label="Contact, masked"
            hint="Record it the way it may be shown: a dispatch log is read by everyone who can read the policy."
          >
            <Input
              id="dispatch-contact"
              value={draft.recipientContactMasked}
              onChange={(event) =>
                setDraft({ ...draft, recipientContactMasked: event.target.value })
              }
            />
          </Field>

          {isCourier(draft.channel) ? (
            <>
              <Field id="dispatch-courier" label="Courier">
                <Input
                  id="dispatch-courier"
                  value={draft.courierName}
                  onChange={(event) => setDraft({ ...draft, courierName: event.target.value })}
                />
              </Field>
              <Field id="dispatch-tracking" label="Tracking reference">
                <Input
                  id="dispatch-tracking"
                  value={draft.trackingRef}
                  onChange={(event) => setDraft({ ...draft, trackingRef: event.target.value })}
                />
              </Field>
            </>
          ) : null}

          {blocked === null ? (
            <ConfirmGate
              className={styles.gate}
              title="Send the policy document"
              changes={changesOf(draft)}
              confirmLabel="Record the dispatch"
              cancelLabel="Start again"
              receipt="The dispatch is recorded. Delivery is recorded separately, when somebody knows."
              onCancel={() => setDraft(null)}
              onConfirm={() => void send(draft)}
            />
          ) : (
            <p className={styles.refusal} role="status">
              {blocked}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
