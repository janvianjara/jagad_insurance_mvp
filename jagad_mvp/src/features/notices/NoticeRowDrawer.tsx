import { useState } from 'react'
import { ConfirmGate, OcrField, OcrFormProvider, OcrSubmit } from '../../components/guardrails'
import type { OcrFieldState } from '../../components/guardrails'
import type { MutationResult, NoticeMatch, Policy } from '../../data/repo'
import { Button } from '../../ui/Button'
import { Combobox, Field, Textarea } from '../../ui/form'
import { Icon } from '../../ui/Icon'
import { StatusPill } from '../../ui/signal'
import { DateTime, KeyValueList, Money } from '../../ui/type'
import {
  NOTICE_FIELD_LABEL,
  ROW_LABEL,
  ROW_TONE,
  confidenceFor,
  unconfirmedFields,
} from './notice-view'
import styles from './Notices.module.css'

export type NoticeRowDrawerProps = {
  row: NoticeMatch
  policies: readonly Policy[]
  /** False when the person may read the batch but not work it. */
  canEdit: boolean
  onLink: (policyId: string, confirmedFields: readonly string[]) => Promise<MutationResult<NoticeMatch>>
  onReject: (reason: string, confirmedFields: readonly string[]) => Promise<MutationResult<NoticeMatch>>
}

/**
 * One extracted row, and what can still be done to it — canvas 5.4 and 5.5.
 *
 * The manual link is §9's only way out of `unmatched`, and it records who made
 * it. It sits inside an `<OcrFormProvider>` on purpose: the values on this row
 * are the ones the customer's letter will carry, so the form cannot submit while
 * any of them is still an unconfirmed read. Confirming travels with the link
 * itself, on `confirmedFields` — there is no separate "confirm" write, and
 * nothing anywhere marks a value confirmed because a person looked at it.
 *
 * Rejecting is deliberately outside that form. A rejected row is one this agency
 * is not renewing at all, so asking somebody to vouch for figures they are about
 * to discard would be ceremony rather than care. It still records why.
 */
export function NoticeRowDrawer({ row, policies, canEdit, onLink, onReject }: NoticeRowDrawerProps) {
  const [policyId, setPolicyId] = useState<string | null>(row.matchedPolicyId)
  const [confirmed, setConfirmed] = useState<readonly string[]>([])
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const matched = policies.find((policy) => policy.id === row.matchedPolicyId) ?? null
  const waiting = unconfirmedFields(row)
  const extractions = row.ocrFields.filter((field) => !field.confirmed)

  function noteConfirmation(state: OcrFieldState) {
    setConfirmed((held) => {
      const without = held.filter((name) => name !== state.name)
      return state.confirmed ? [...without, state.name] : without
    })
  }

  async function commit(run: () => Promise<MutationResult<NoticeMatch>>) {
    const outcome = await run()
    if (!outcome.ok) {
      setRefusal(outcome.reason)
      return
    }
    setRefusal(null)
    setRejecting(false)
  }

  return (
    <div className={styles.drawer}>
      <KeyValueList
        items={[
          {
            key: 'state',
            label: 'Row status',
            value: <StatusPill tone={ROW_TONE[row.state]}>{ROW_LABEL[row.state]}</StatusPill>,
          },
          { key: 'printed', label: 'Policy number, as printed', value: row.noticePolicyNo },
          { key: 'name', label: 'Insured name, as printed', value: row.noticeCustomerName },
          {
            key: 'expiry',
            label: 'Expiry, as printed',
            value: row.noticeExpiryDate ? (
              <DateTime value={row.noticeExpiryDate} mode="date" />
            ) : null,
          },
          {
            key: 'policy',
            label: 'Policy we hold',
            value: matched ? matched.systemNo : null,
          },
          {
            key: 'linked',
            label: 'Linked by hand',
            value: row.manuallyLinkedBy === null ? null : row.manuallyLinkedBy,
          },
          {
            key: 'reject',
            label: 'Rejected because',
            value: row.rejectReason,
          },
        ]}
      />

      {/*
        §9: "Reminders carry year-wise amounts." Both figures were recorded by
        somebody — one read off the insurer's notice, one typed when the policy
        was entered. Nothing here subtracts them or works out a difference.
      */}
      {matched === null ? null : (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Year-wise amounts</h3>
          <div className={styles.years}>
            <div className={styles.year}>
              <span className={styles.yearLabel}>This year, printed on the notice</span>
              <Money paise={row.noticePremium?.paise ?? null} absentText="not read" />
            </div>
            <div className={styles.year}>
              <span className={styles.yearLabel}>Last year, on the policy we hold</span>
              <Money paise={matched.finalPremium?.paise ?? null} absentText="not recorded" />
            </div>
          </div>
          <p className={styles.prose}>
            Both figures are records. The reminder quotes them side by side; it does not compare
            them, and this platform never produces a renewal premium of its own.
          </p>
        </section>
      )}

      {refusal === null ? null : (
        <div className={styles.blocked} role="alert">
          <Icon name="alert" size="md" />
          <div className={styles.blockedBody}>
            <p className={styles.blockedTitle}>Nothing was changed</p>
            <p className={styles.blockedReason}>{refusal}</p>
          </div>
        </div>
      )}

      {row.state === 'matched' && waiting.length > 0 ? (
        <div className={styles.needsPerson} role="note">
          <Icon name="alert" size="md" />
          <div className={styles.blockedBody}>
            <p className={styles.blockedTitle}>This row is held out of any send</p>
            <p className={styles.blockedReason}>
              It matched a policy, but {waiting.length === 1 ? 'a value on it' : 'values on it'} came
              off the notice and nobody has checked{' '}
              {waiting.length === 1 ? 'it' : 'them'} against the paper. A letter carrying a figure
              nobody has read is exactly what the extraction rule exists to stop, so the row cannot
              be included in a bulk send.
            </p>
          </div>
        </div>
      ) : null}

      {canEdit && row.state === 'unmatched' ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Link this row to a policy</h3>
          <p className={styles.prose}>
            Automatic matching found nothing for this printed number. Linking it by hand is the way
            out of unmatched, and the link is recorded as yours.
          </p>

          <OcrFormProvider
            onSubmit={() => {
              if (policyId === null) return
              void commit(() => onLink(policyId, confirmed))
            }}
          >
            <div className={styles.extractions}>
              {extractions.map((field) => (
                <OcrField
                  key={field.name}
                  name={field.name}
                  label={NOTICE_FIELD_LABEL[field.name] ?? field.name}
                  extraction={{ value: field.value, confidence: confidenceFor(field.name) }}
                  onChange={noteConfirmation}
                />
              ))}
            </div>

            <Field label="Policy this notice belongs to" required>
              <Combobox
                options={policies.map((policy) => ({
                  value: policy.id,
                  label: policy.systemNo,
                  hint: policy.insurerNo ?? '',
                }))}
                value={policyId}
                onValueChange={setPolicyId}
                placeholder="Search our policy numbers"
                emptyText="No policy answers to that number"
              />
            </Field>

            <OcrSubmit disabled={policyId === null}>Confirm and link this row</OcrSubmit>
          </OcrFormProvider>
        </section>
      ) : null}

      {canEdit && row.state === 'unmatched' ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Or reject it</h3>
          <p className={styles.prose}>
            A row that is not ours to renew — another agency’s code, a policy that moved — is
            rejected with the reason on the record, so the count reconciles later.
          </p>
          <Field label="Why this row is being rejected" required>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </Field>
          <div className={styles.rejectRow}>
            <Button
              variant="quiet"
              disabled={reason.trim() === ''}
              onClick={() => setRejecting(true)}
            >
              Reject this row
            </Button>
          </div>
          {rejecting ? (
            <ConfirmGate
              title={`Reject row ${row.rowNumber}`}
              changes={[
                { key: 'state', label: 'Row status', from: ROW_LABEL[row.state], to: 'Rejected' },
                { key: 'reason', label: 'Reason', to: reason.trim() },
              ]}
              confirmLabel="Reject the row"
              receipt="Rejected. The row stays on the batch with the reason against it."
              note="A rejected row goes to nobody. It is kept so the batch still adds up."
              onCancel={() => setRejecting(false)}
              onConfirm={() => void commit(() => onReject(reason.trim(), confirmed))}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
