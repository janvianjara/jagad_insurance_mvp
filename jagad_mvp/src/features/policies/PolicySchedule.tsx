import { Link } from 'react-router'
import type { CollectionRecord } from '../../data/repo'
import type { PremiumMode } from '../../domain/workflows'
import { Icon } from '../../ui/Icon'
import { EmptyState } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { Panel } from '../../ui/surface'
import { DateTime, KeyValueList, Money } from '../../ui/type'
import {
  COLLECTION_LABEL,
  COLLECTION_TONE,
  INSTRUMENT_LABEL,
  ROUTE_LABEL,
} from '../collections/collection-view'
import { CONTINUITY_AT_RISK } from '../renewals/renewal-view'
import type { SchedulePacket } from './data/policy-facets'
import {
  INSTALMENT_LABEL,
  INSTALMENT_TONE,
  MANDATE_KIND_LABEL,
  MANDATE_NEXT_STEP,
  MODE_LABEL,
  NO_MANDATE_NOTE,
  instalmentTally,
  nextDue,
  readMandate,
} from './schedule-view'
import styles from './PolicySchedule.module.css'

export type PolicyScheduleProps = {
  packet: SchedulePacket
  /** Every collection recorded against this policy. The money that actually arrived. */
  collections: readonly CollectionRecord[]
  /** The policy's own premium mode, for the case where no schedule exists at all. */
  premiumMode: PremiumMode
  now: Date
  staffName: (userId: string | null) => string
}

/**
 * `/policies/:id/schedule` — premium schedule, mandate and debit history. FR-10,
 * decision D-A.
 *
 * Three things on one tab, in the order a person needs them: what is due next,
 * the mandate that is supposed to pay it, and the history of what has actually
 * been debited and collected. The mandate sits second rather than last because a
 * failed mandate is the thing on this screen that needs a person — every other
 * panel is a record, and that one is work.
 *
 * The screen is consistent with `/renewals/instalments` by construction, not by
 * coincidence: the labels, the tones, the grace arithmetic and the pattern window
 * all come from `schedule-view`, which imports them from the renewals module.
 * The same instalment reads the same way whichever surface it is met on, and
 * `CONTINUITY_AT_RISK` is the same sentence in both places.
 *
 * Record-only money, D3. Every figure here is `instalment.amount`, which was
 * copied from `schedule.instalmentAmount`, which somebody typed off the
 * insurer's schedule. Nothing on this tab divides an annual premium, totals an
 * arrear or suggests a figure — the only counting done is of rows, which are not
 * money. There is no control that can produce an amount, which is why there is
 * no `<RecordOnlyAmount>` here: nothing on this tab records one.
 */
export function PolicySchedule({
  packet,
  collections,
  premiumMode,
  now,
  staffName,
}: PolicyScheduleProps) {
  const { schedule, instalments, mandate, mandateEvents } = packet
  const due = nextDue(instalments, schedule)
  const reading = mandate === null ? null : readMandate(mandate, mandateEvents, now)
  const tally = instalmentTally(instalments)

  return (
    <div className={styles.tab} data-policy-schedule="">
      <Panel
        title="Due next"
        description="The earliest instalment this policy has not settled. The figure was typed from the insurer's own schedule; nothing here divides an annual premium."
      >
        {schedule === null ? (
          <EmptyState
            title="This policy carries no instalment schedule"
            explanation={`It is recorded on a ${MODE_LABEL[premiumMode].toLowerCase()} premium mode, so the premium is collected in one act rather than on a schedule. A schedule appears here when one is recorded against the policy.`}
          />
        ) : due === null ? (
          <p className={styles.settled}>
            <Icon name="check" size="sm" />
            Every instalment on this schedule is settled. The next one appears here when the
            insurer's schedule carries it.
          </p>
        ) : (
          <div className={styles.due} data-due-state={due.instalment.state}>
            <div className={styles.dueHead}>
              <span className={styles.dueAmount}>
                <Money paise={due.instalment.amount.paise} emphasis="strong" />
              </span>
              <StatusPill tone={INSTALMENT_TONE[due.instalment.state]}>
                {INSTALMENT_LABEL[due.instalment.state]}
              </StatusPill>
              {due.needsAPerson ? <Badge tone="attn" caps>Needs a person</Badge> : null}
            </div>
            <KeyValueList
              columns={2}
              items={[
                {
                  key: 'sequence',
                  label: 'Instalment',
                  value: `${due.instalment.sequence} of ${schedule.instalmentCount}`,
                },
                {
                  key: 'due',
                  label: 'Falls due',
                  value: <DateTime value={due.instalment.dueDate} mode="date" />,
                },
                {
                  key: 'grace',
                  label: `Grace, from this schedule's mode`,
                  value: (
                    <>
                      {`${schedule.graceDays} days, to `}
                      <DateTime value={due.graceEndsOn} mode="date" />
                    </>
                  ),
                },
                {
                  key: 'mode',
                  label: 'Mode',
                  value: `${MODE_LABEL[schedule.mode]}, debited on day ${schedule.debitDay}`,
                },
              ]}
            />
            <p className={styles.continuity}>
              An instalment falling due is not a renewal: this term is still running and the policy
              is in force. {CONTINUITY_AT_RISK}
            </p>
          </div>
        )}
      </Panel>

      <Panel
        title="The mandate behind it"
        description="Registered through the insurer's own link. This platform records that a mandate exists and what the bank reported about it; it holds no bank credential and never presents a debit."
      >
        {mandate === null || reading === null ? (
          <p className={styles.quiet}>{NO_MANDATE_NOTE}</p>
        ) : (
          <div className={styles.mandate} data-mandate-state={reading.state}>
            <div className={styles.dueHead}>
              <StatusPill tone={reading.tone}>{reading.label}</StatusPill>
              <Badge caps>{MANDATE_KIND_LABEL[mandate.kind]}</Badge>
              {reading.pattern ? (
                <Badge tone="bad" caps>
                  Pattern — tell the agent
                </Badge>
              ) : null}
            </div>

            <KeyValueList
              columns={2}
              items={[
                { key: 'reference', label: 'Reference', value: mandate.reference },
                { key: 'bank', label: 'Bank', value: mandate.bankName },
                { key: 'day', label: 'Debit day', value: String(mandate.debitDay) },
                {
                  key: 'valid',
                  label: 'Valid',
                  value: (
                    <>
                      <DateTime value={mandate.validFrom} mode="date" /> to{' '}
                      <DateTime value={mandate.validUntil} mode="date" />
                    </>
                  ),
                },
                {
                  key: 'registered',
                  label: 'Registered',
                  value: (
                    <>
                      <DateTime value={mandate.registeredAt} mode="date" /> by{' '}
                      {staffName(mandate.registeredBy)}
                    </>
                  ),
                },
                {
                  key: 'lastFailure',
                  label: 'Last failure',
                  value:
                    reading.lastFailureAt === null ? null : (
                      <DateTime value={reading.lastFailureAt} mode="date" />
                    ),
                },
              ]}
            />

            {reading.failing ? (
              <p className={styles.alert} role="note" data-mandate-failing="">
                <Icon name="alert" size="md" />
                <span>
                  <span className={styles.alertTitle}>The mandate is not paying.</span>{' '}
                  {MANDATE_NEXT_STEP}
                </span>
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel
        title="Debits and collections"
        description="What the bank reported against the mandate, and what the agency recorded arriving. Two different records of the same money, kept apart on purpose."
      >
        <h3 className={styles.subhead}>Presentations reported by the bank</h3>
        {mandateEvents.length === 0 ? (
          <p className={styles.quiet}>
            No presentation has been reported against this policy. A line appears here when the
            bank or the insurer tells us what happened to a debit.
          </p>
        ) : (
          <ul className={styles.rows} aria-label="Mandate presentations">
            {[...mandateEvents]
              .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
              .map((event) => (
                <li key={event.id} className={styles.row} data-mandate-event={event.outcome}>
                  <div className={styles.rowHead}>
                    <StatusPill tone={event.outcome === 'failure' ? 'bad' : 'ok'}>
                      {event.outcome === 'failure' ? 'Debit failed' : 'Debit succeeded'}
                    </StatusPill>
                    <span className={styles.mono}>{event.reference}</span>
                    <DateTime value={event.occurredAt} mode="date" />
                  </div>
                  {event.failureReason === null ? null : (
                    <p className={styles.quiet}>{event.failureReason}</p>
                  )}
                </li>
              ))}
          </ul>
        )}

        <h3 className={styles.subhead}>Collections recorded by the agency</h3>
        {collections.length === 0 ? (
          <p className={styles.quiet}>
            Nothing has been recorded as collected against this policy. A payment made direct to
            the company appears as a reference rather than as money on the agency's books.
          </p>
        ) : (
          <ul className={styles.rows} aria-label="Collections against this policy">
            {collections.map((entry) => (
              <li key={entry.id} className={styles.row} data-collection={entry.id}>
                <div className={styles.rowHead}>
                  <StatusPill tone={COLLECTION_TONE[entry.state]}>
                    {COLLECTION_LABEL[entry.state]}
                  </StatusPill>
                  <Badge caps>{INSTRUMENT_LABEL[entry.instrument]}</Badge>
                  <span className={styles.mono}>
                    <Money paise={entry.amount?.paise ?? null} />
                  </span>
                </div>
                <KeyValueList
                  dense
                  columns={2}
                  items={[
                    { key: 'route', label: 'Route', value: ROUTE_LABEL[entry.route] },
                    { key: 'reference', label: 'Reference', value: entry.reference },
                    {
                      key: 'collected',
                      label: 'Collected',
                      value: entry.collectedAt ? (
                        <>
                          <DateTime value={entry.collectedAt} mode="date" /> by{' '}
                          {staffName(entry.collectedBy)}
                        </>
                      ) : null,
                    },
                    {
                      key: 'instalment',
                      label: 'Against instalment',
                      value:
                        entry.instalmentId === null
                          ? null
                          : (instalments.find((row) => row.id === entry.instalmentId)?.sequence.toString() ??
                            entry.instalmentId),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {schedule === null ? null : (
        <Panel
          title="The whole schedule"
          description="Every instalment the insurer's schedule carries, in sequence. The amount on each row is the figure that was typed, repeated — not an annual premium apportioned."
          actions={
            <Link className={styles.link} to={`/renewals/instalments?policy=${schedule.policyId}`}>
              See it beside the rest of the book
            </Link>
          }
        >
          <ul className={styles.tally} aria-label="Instalments by state">
            {tally.map((entry) => (
              <li key={entry.state} className={styles.tallyItem} data-tally={entry.state}>
                <StatusPill tone={INSTALMENT_TONE[entry.state]} size="sm">
                  {INSTALMENT_LABEL[entry.state]}
                </StatusPill>
                <span className={styles.mono}>{entry.count}</span>
              </li>
            ))}
          </ul>

          <ol className={styles.instalments} aria-label="Premium schedule">
            {[...instalments]
              .sort((a, b) => a.sequence - b.sequence)
              .map((instalment) => (
                <li
                  key={instalment.id}
                  className={styles.instalment}
                  data-instalment={instalment.id}
                  data-state={instalment.state}
                >
                  <span className={styles.mono}>{instalment.sequence}</span>
                  <DateTime value={instalment.dueDate} mode="date" />
                  <span className={styles.mono}>
                    <Money paise={instalment.amount.paise} />
                  </span>
                  <StatusPill tone={INSTALMENT_TONE[instalment.state]} size="sm">
                    {INSTALMENT_LABEL[instalment.state]}
                  </StatusPill>
                  <span className={styles.paid}>
                    {instalment.paidAt === null ? (
                      ''
                    ) : (
                      <>
                        settled <DateTime value={instalment.paidAt} mode="date" />
                      </>
                    )}
                  </span>
                </li>
              ))}
          </ol>
        </Panel>
      )}
    </div>
  )
}
