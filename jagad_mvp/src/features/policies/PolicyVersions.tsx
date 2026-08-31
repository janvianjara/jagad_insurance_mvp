import { Link } from 'react-router'
import type { Endorsement } from '../../data/repo'
import { Badge, StatusPill } from '../../ui/signal'
import { EmptyState } from '../../ui/data'
import { Icon } from '../../ui/Icon'
import { Panel } from '../../ui/surface'
import { DateTime, KeyValueList, Money, RecordId } from '../../ui/type'
import { ENDORSEMENT_LABEL, ENDORSEMENT_TONE, ENDORSEMENT_TYPE_LABEL } from '../endorsements/endorsement-view'
import { CHANGE_NOT_ATTRIBUTED, PRIOR_VALUES_NOT_KEPT } from './version-diff'
import type { VersionEntry } from './version-diff'
import styles from './PolicyVersions.module.css'

export type PolicyVersionsProps = {
  /** Newest version first, each paired with the endorsement that caused it. */
  entries: readonly VersionEntry[]
  /** Endorsements raised against this policy that have not written a version yet. */
  inFlight: readonly Endorsement[]
  staffName: (userId: string | null) => string
}

/**
 * `/policies/:id/versions` — the policy's version history, FR-10 and D-A.
 *
 * An endorsement versions a policy, and this is the audit trail of that act: when
 * each version took effect, which endorsement caused it, who approved it, and
 * what it changed. The field-level list against the previous version is what
 * makes the screen worth opening — a list of dates and notes would say a change
 * happened without saying what it was.
 *
 * Three properties are held on purpose.
 *
 * **Immutability is drawn, not implied.** §9 says an approved endorsement writes
 * a new version and never edits the one already issued, so there is no edit
 * control anywhere on this tab, and the panel says so in words rather than
 * leaving a person to notice the absence and assume the feature is unbuilt.
 *
 * **The current version is unmistakable.** It carries a pill, a marked row and
 * its own heading position at the top; every older version is dimmed and
 * labelled superseded.
 *
 * **The diff says only what the record holds.** `changedFields` names fields, not
 * values, and no per-version snapshot is stored anywhere in §8 — so this screen
 * prints `PRIOR_VALUES_NOT_KEPT` where a before-and-after column would go, and
 * for a floater membership change it prints `CHANGE_NOT_ATTRIBUTED` rather than
 * naming a member the platform never wrote down.
 */
export function PolicyVersions({ entries, inFlight, staffName }: PolicyVersionsProps) {
  return (
    <div className={styles.tab} data-policy-versions="">
      <Panel
        title="Version history"
        description="A version is written, never edited. Every line below is the record as it stood from that date, and nothing on this tab can change one."
      >
        {entries.length === 0 ? (
          <EmptyState
            title="This policy has never been versioned"
            explanation="A version is written when an approved endorsement is applied to the policy, carrying both endorsement numbers and the date it takes effect from. Until one is approved, the record as issued is the whole history."
          />
        ) : (
          <>
            <p className={styles.rule} role="note">
              <Icon name="lock" size="sm" />
              {PRIOR_VALUES_NOT_KEPT}
            </p>

            <ol className={styles.versions} aria-label="Policy versions">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className={styles.version}
                  data-version={entry.version}
                  data-current={entry.current ? '' : undefined}
                >
                  <div className={styles.head}>
                    <span className={styles.number}>{`Version ${entry.version}`}</span>
                    {entry.current ? (
                      <StatusPill tone="ok">In force</StatusPill>
                    ) : (
                      <StatusPill tone="idle">Superseded</StatusPill>
                    )}
                    {entry.typeLabel === null ? (
                      <Badge caps>As issued</Badge>
                    ) : (
                      <Badge caps>{entry.typeLabel}</Badge>
                    )}
                    <RecordId
                      systemNo={entry.endorsementNo ?? `v${entry.version}`}
                      insurerNo={entry.insurerEndorsementNo}
                    />
                  </div>

                  <KeyValueList
                    dense
                    columns={2}
                    items={[
                      {
                        key: 'effective',
                        label: 'Effective from',
                        value: <DateTime value={entry.effectiveFrom} mode="date" />,
                      },
                      {
                        key: 'written',
                        label: 'Written',
                        value: <DateTime value={entry.createdAt} mode="datetime" />,
                      },
                      {
                        key: 'approved',
                        label: 'Approved by',
                        value:
                          entry.approvedBy === null ? null : (
                            <>
                              {staffName(entry.approvedBy)}
                              {entry.approvedAt === null ? null : (
                                <>
                                  {' on '}
                                  <DateTime value={entry.approvedAt} mode="date" />
                                </>
                              )}
                            </>
                          ),
                      },
                      {
                        key: 'document',
                        label: 'Endorsement document',
                        value: entry.documentId === null ? null : 'On file',
                      },
                    ]}
                  />

                  <p className={styles.note}>{entry.note}</p>

                  {entry.endorsement === null ? null : (
                    <p className={styles.reason}>
                      <span className={styles.reasonLabel}>Why</span>
                      {entry.endorsement.reason}
                    </p>
                  )}

                  {entry.changes.length === 0 ? (
                    <p className={styles.quiet}>
                      {entry.version === 1
                        ? 'The version the policy was issued at. There is nothing before it to differ from.'
                        : 'No changed field is recorded against this version.'}
                    </p>
                  ) : (
                    <div className={styles.changes}>
                      <h4 className={styles.changesTitle}>
                        {`What changed against version ${entry.version - 1}`}
                      </h4>
                      <ul className={styles.changeList} aria-label={`Changes in version ${entry.version}`}>
                        {entry.changes.map((change) => (
                          <li
                            key={change.key}
                            className={styles.change}
                            data-change={change.key}
                            data-attributed={change.attributable ? '' : undefined}
                          >
                            <span className={styles.changeLabel}>{change.label}</span>
                            {change.attributable ? null : (
                              <span className={styles.unattributed}>{CHANGE_NOT_ATTRIBUTED}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {entry.figure === null ? null : (
                    <dl className={styles.figure}>
                      <dt className={styles.figureLabel}>
                        {`${entry.figure.label}, as typed from the insurer`}
                      </dt>
                      <dd className={styles.figureValue}>
                        {entry.figure.figure.amount === null ? (
                          'Not recorded'
                        ) : (
                          <Money paise={entry.figure.figure.amount.paise} />
                        )}
                      </dd>
                      {entry.figure.figure.insurerReference === null ? null : (
                        <>
                          <dt className={styles.figureLabel}>Read off</dt>
                          <dd className={styles.figureRef}>
                            {entry.figure.figure.insurerReference}
                          </dd>
                        </>
                      )}
                    </dl>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </Panel>

      <Panel
        title="Endorsements still in flight"
        level={3}
        description="Raised against this policy and not yet applied. Nothing here has changed the record, which is why it is not in the history above."
      >
        {inFlight.length === 0 ? (
          <p className={styles.quiet}>
            No endorsement is open against this policy. Every one that has been raised has been
            applied, and each wrote the version it caused.
          </p>
        ) : (
          <ul className={styles.pending} aria-label="Endorsements in flight">
            {inFlight.map((endorsement) => (
              <li key={endorsement.id} className={styles.pendingRow} data-endorsement={endorsement.id}>
                <div className={styles.head}>
                  <RecordId
                    systemNo={endorsement.systemNo}
                    insurerNo={endorsement.insurerEndorsementNo}
                  />
                  <StatusPill tone={ENDORSEMENT_TONE[endorsement.state]}>
                    {ENDORSEMENT_LABEL[endorsement.state]}
                  </StatusPill>
                  <Badge caps>{ENDORSEMENT_TYPE_LABEL[endorsement.type]}</Badge>
                </div>
                <p className={styles.reason}>{endorsement.reason}</p>
                <Link className={styles.link} to={`/endorsements/${endorsement.id}`}>
                  Open the endorsement
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
