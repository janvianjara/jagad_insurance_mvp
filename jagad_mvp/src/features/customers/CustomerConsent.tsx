import { useState } from 'react'
import type { MessageChannel, MessageTemplate } from '../../data/repo'
import { MESSAGE_CHANNELS } from '../../data/repo'
import { ConsentBadge } from '../../components/ConsentBadge'
import { MaskedField } from '../../components/MaskedField'
import { ConfirmGate } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState } from '../../ui/data'
import { Checkbox, Field, Textarea } from '../../ui/form'
import { Badge, StatusPill } from '../../ui/signal'
import { Panel, useToaster } from '../../ui/surface'
import { DateTime, KeyValueList } from '../../ui/type'
import type { CustomerDesk, CustomerDossier } from './data/customer-desk'
import {
  CHANNEL_LABEL,
  SKIPS_NOT_LOGGED,
  WITHDRAWAL_NOT_ON_THE_MACHINE,
  WITHDRAWAL_RIGHT,
  channelStandings,
  consentLedger,
  suppressedChannels,
} from './consent-view'
import styles from './CustomerConsent.module.css'

export type CustomerConsentProps = {
  dossier: CustomerDossier
  /** Active templates, so the page can say what a withdrawal would actually stop. */
  templates: readonly MessageTemplate[]
  now: Date
  /** Who is recording. Empty where nobody is signed in, which disables the gate. */
  actorId: string
  canAct: boolean
  desk: CustomerDesk
  onChanged: () => void
}

const ALL_CHANNELS: readonly MessageChannel[] = Object.values(MESSAGE_CHANNELS)

/**
 * `/customers/:id/consent` — this one customer's consent ledger. FR-20.1.
 *
 * The agency-wide ledger at `/config/compliance` counts states across the book;
 * this is the same ledger scoped to one person, and it deliberately reuses that
 * screen's vocabulary — `<ConsentBadge>` and `readConsent` decide what a state
 * means in both places, so the compliance screen and the customer's file cannot
 * describe one consent two different ways.
 *
 * What is here that is not there is everything that only makes sense per person:
 * the acts in order, the channels the consent covers, what has actually been
 * sent, and the withdrawal.
 *
 * **The withdrawal is the honest part.** FR-17.3 asks that a withdrawal be
 * honoured and that skipped sends be logged, and the gap analysis records that
 * neither exists. Half of it is now real: a member of staff records the
 * withdrawal behind a `<ConfirmGate>`, it is kept against the customer, it is
 * listed in the ledger and it visibly suppresses the channels it names. The
 * other half is stated rather than faked — `ConsentState` has no `withdrawn`
 * member, so nothing here moves the consent pill, and no skip log exists yet, so
 * the page says which sends are suppressed and does not pretend to itemise them.
 *
 * **Aadhaar is four digits, and only through `<MaskedField>`.** The identity
 * block is here because a consent record is about a person and a person has to be
 * identifiable on the page; it renders the same way it renders on every other
 * screen in this feature, which slices before it builds a node.
 *
 * No token is printed. The link is tokenised and login-free by design (§11.1,
 * D21), and a page that showed its token would be handing it out — the same rule
 * the agency-wide ledger keeps.
 */
export function CustomerConsent({
  dossier,
  templates,
  now,
  actorId,
  canAct,
  desk,
  onChanged,
}: CustomerConsentProps) {
  const toaster = useToaster()
  const { customer, consent, messages, withdrawals, credentials } = dossier

  const [armed, setArmed] = useState(false)
  const [reason, setReason] = useState('')
  const [channels, setChannels] = useState<readonly MessageChannel[]>(ALL_CHANNELS)

  const ledger = consentLedger(customer, consent, withdrawals, now)
  const standings = channelStandings(consent, messages, templates, withdrawals)
  const stopped = suppressedChannels(withdrawals)
  const latest = withdrawals.at(-1) ?? null

  const reasonGiven = reason.trim().length > 0
  const mayWithdraw = canAct && actorId !== '' && channels.length > 0 && reasonGiven

  function toggle(channel: MessageChannel) {
    setChannels((held) =>
      held.includes(channel)
        ? held.filter((entry) => entry !== channel)
        : [...held, channel].sort(
            (a, b) => ALL_CHANNELS.indexOf(a) - ALL_CHANNELS.indexOf(b),
          ),
    )
  }

  function withdraw() {
    desk.recordConsentWithdrawal(customer.id, {
      customerId: customer.id,
      withdrawnAt: now.toISOString(),
      actorId,
      channels,
      reason: reason.trim(),
    })
    setArmed(false)
    setReason('')
    onChanged()
    toaster.notify({
      title: 'Withdrawal recorded',
      detail: 'It is on the customer’s file and the channels it names are marked suppressed.',
      tone: 'ok',
    })
  }

  return (
    <div className={styles.tab} data-customer-consent={customer.id}>
      <Panel
        title="Where consent stands"
        description="The consent link is tokenised, expiring, login-free and session-free. Its token is never shown on a staff screen, here or anywhere else."
      >
        <div className={styles.standing}>
          <ConsentBadge
            state={customer.consentState}
            now={now}
            expiresAt={consent?.expiresAt ?? null}
            submittedAt={consent?.submittedAt ?? null}
            showNote
          />
          {stopped.length === 0 ? null : (
            <Badge tone="bad" caps>
              Withdrawn
            </Badge>
          )}
        </div>

        <KeyValueList
          columns={2}
          items={[
            {
              key: 'channel',
              label: 'Link delivered on',
              value: consent === null ? null : CHANNEL_LABEL[consent.channel],
            },
            {
              key: 'issued',
              label: 'Issued',
              value: consent === null ? null : <DateTime value={consent.issuedAt} mode="datetime" />,
            },
            {
              key: 'expires',
              label: 'Window closes',
              value: consent === null ? null : <DateTime value={consent.expiresAt} mode="datetime" />,
            },
            {
              key: 'submitted',
              label: 'Consent given',
              value:
                consent?.submittedAt == null ? null : (
                  <DateTime value={consent.submittedAt} mode="datetime" />
                ),
            },
            {
              key: 'chases',
              label: 'Chases sent',
              value: String(customer.consentChaseCount),
            },
            {
              key: 'credentials',
              label: 'Portal credentials issued',
              value: credentials.length === 0 ? null : String(credentials.length),
            },
          ]}
        />

        <div className={styles.identity}>
          <MaskedField
            label="Aadhaar"
            last4={customer.aadhaarLast4}
            note="The last four digits are the whole record. The full number is never stored, shown or exported."
          />
          <MaskedField label="PAN" value={customer.panNumber} kind="pan" />
        </div>
      </Panel>

      <Panel
        title="What this consent covers"
      >
        <ul className={styles.channels} aria-label="Consent by channel">
          {standings.map((standing) => (
            <li
              key={standing.channel}
              className={styles.channel}
              data-channel={standing.channel}
              data-suppressed={standing.suppressed ? '' : undefined}
            >
              <div className={styles.channelHead}>
                <span className={styles.channelName}>{standing.label}</span>
                {standing.suppressed ? (
                  <StatusPill tone="bad">Suppressed by withdrawal</StatusPill>
                ) : standing.consentedOn ? (
                  <StatusPill tone="ok">The link went out here</StatusPill>
                ) : (
                  <StatusPill tone="idle">Not the consent channel</StatusPill>
                )}
              </div>
              <p className={styles.quiet}>
                {standing.templates.length === 0
                  ? 'No active template sends on this channel, so nothing automated would reach the customer here.'
                  : `${standing.templates.length} active ${standing.templates.length === 1 ? 'template sends' : 'templates send'} on this channel: ${standing.templates.join(', ')}.`}
              </p>
              <p className={styles.quiet}>
                {standing.sent === 0
                  ? 'Nothing has been sent to this customer on it.'
                  : `${standing.sent} ${standing.sent === 1 ? 'message has' : 'messages have'} been sent to this customer on it.`}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Withdrawal"
        description={WITHDRAWAL_RIGHT}
        actions={
          canAct && !armed ? (
            <Button variant="quiet" icon="lock" onClick={() => setArmed(true)}>
              Record a withdrawal
            </Button>
          ) : null
        }
      >
        {latest === null ? (
          <p className={styles.quiet}>
            No withdrawal has been recorded against this customer. Every channel above is as the
            record leaves it.
          </p>
        ) : (
          <div className={styles.withdrawn} data-withdrawal="">
            <div className={styles.channelHead}>
              <StatusPill tone="bad">Consent withdrawn</StatusPill>
              <DateTime value={latest.withdrawnAt} mode="datetime" />
            </div>
            <p className={styles.reason}>{latest.reason}</p>
            <p className={styles.quiet}>
              {`Suppresses ${latest.channels.map((channel) => CHANNEL_LABEL[channel]).join(', ')}.`}
            </p>
            <p className={styles.honest} role="note">
              <Icon name="alert" size="sm" />
              <span>
                {WITHDRAWAL_NOT_ON_THE_MACHINE} {SKIPS_NOT_LOGGED}
              </span>
            </p>
          </div>
        )}

        {armed ? (
          <div className={styles.form}>
            <Field
              label="Which channels the customer asked us to stop using"
              control="group"
              hint="At least one. A withdrawal that named nothing would suppress nothing."
            >
              <div className={styles.checks}>
                {ALL_CHANNELS.map((channel) => (
                  <Checkbox
                    key={channel}
                    label={CHANNEL_LABEL[channel]}
                    checked={channels.includes(channel)}
                    onChange={() => toggle(channel)}
                  />
                ))}
              </div>
            </Field>

            <Field
              label="What the customer said"
              hint="In their words, or yours if you took it on the phone. It is what the ledger will carry."
              required
            >
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Asked on the phone to stop all marketing messages."
              />
            </Field>

            <div className={styles.formActions}>
              {/* Distinct wording from the gate's own Cancel below, so the two
                  ways out of a half-filled form are never confused: this one
                  puts the form away, that one declines the write. Neither
                  records anything. */}
              <Button variant="quiet" onClick={() => setArmed(false)}>
                Put this away
              </Button>
            </div>

            {mayWithdraw ? (
              <ConfirmGate
                title="Record this withdrawal"
                changes={[
                  {
                    key: 'channels',
                    label: 'Channels suppressed',
                    from: 'None',
                    to: channels.map((channel) => CHANNEL_LABEL[channel]).join(', '),
                  },
                  { key: 'reason', label: 'Recorded as', to: reason.trim() },
                  {
                    key: 'state',
                    label: 'Consent state',
                    from: customer.consentState,
                    to: `${customer.consentState} — unchanged, because the consent machine has no withdrawn state`,
                  },
                ]}
                note="Nothing is sent to the customer by this. It records what they asked for against their file and marks the named channels suppressed. Cancel writes nothing."
                confirmLabel="Record the withdrawal"
                receipt="Recorded. The named channels are marked suppressed on this file."
                onCancel={() => setArmed(false)}
                onConfirm={withdraw}
              />
            ) : (
              <p className={styles.blocked}>
                {canAct
                  ? 'Name at least one channel and say what the customer asked for. Both are what makes the record worth keeping.'
                  : 'Your role can read this ledger but not record against it.'}
              </p>
            )}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="The ledger"
        description="Every consent act against this customer, newest first. A line is here because a record carries a timestamp for it — nothing on this page is reconstructed from anything else."
      >
        {ledger.length === 0 ? (
          <EmptyState
            title="Nothing has happened to this customer's consent"
            explanation="No link has been sent, so there is nothing to record. A link is issued from the KYC tab, where the machine that issues one lives, and the first line appears here the moment it goes out."
          />
        ) : (
          <ol className={styles.ledger} aria-label="Consent ledger">
            {ledger.map((entry) => (
              <li key={entry.id} className={styles.entry} data-consent-act={entry.act}>
                <div className={styles.channelHead}>
                  <StatusPill tone={entry.tone}>{entry.label}</StatusPill>
                  <DateTime value={entry.at} mode="datetime" />
                </div>
                <p className={styles.quiet}>{entry.detail}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
