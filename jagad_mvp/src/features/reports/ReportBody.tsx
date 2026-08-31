import { Link } from 'react-router'
import { EmptyState } from '../../ui/data'
import { Badge } from '../../ui/signal'
import { DateTime, Money } from '../../ui/type'
import type { ReportSet } from './data/reports-desk'
import { BIRTHDAY_WINDOW_DAYS } from './data/reports-desk'
import { REPORT_KEYS } from './report-catalogue'
import type { ReportKey } from './report-catalogue'
import styles from './Reports.module.css'

/**
 * The five report bodies, in one file.
 *
 * They are together because they are the same shape — a small table of recorded
 * facts under a heading — and splitting them into five files would put four
 * copies of that table in the codebase. Nothing here computes: every number
 * below arrives on `ReportSet` already read, and every amount is rendered
 * through `<Money>` from integer paise at the render edge.
 *
 * Each body is also careful about what it does NOT show. There is no total row
 * on the renewal buckets, no percentage on the year-on-year money, and no
 * "expected" column anywhere. If one appears in a diff, it is the record-only
 * rule breaking.
 */

export type ReportBodyProps = {
  reportKey: ReportKey
  data: ReportSet
}

export function ReportBody({ reportKey, data }: ReportBodyProps) {
  if (reportKey === REPORT_KEYS.policies) return <PolicyReport data={data} />
  if (reportKey === REPORT_KEYS.claims) return <ClaimReport data={data} />
  if (reportKey === REPORT_KEYS.renewals) return <RenewalReport data={data} />
  if (reportKey === REPORT_KEYS.yoy) return <YearReport data={data} />
  if (reportKey === REPORT_KEYS.pipeline) return <PipelineReport data={data} />
  return <BirthdayReport data={data} />
}

/* ------------------------------------------------------------------ counts */

function CountTable({
  label,
  rows,
  headers,
}: {
  label: string
  rows: readonly { key: string; label: string; count: number }[]
  headers: readonly [string, string]
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            <th scope="col">{headers[0]}</th>
            <th scope="col" className={styles.numeric}>
              {headers[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td className={styles.numeric}>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ bodies */

function PolicyReport({ data }: { data: ReportSet }) {
  const { policies } = data

  return (
    <>
      <CountTable
        label="Policies by state"
        rows={policies.byStatus}
        headers={['State', 'Policies']}
      />

      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt>Premium recorded</dt>
          <dd>
            <Money paise={policies.recordedPremium.paise} emphasis="strong" />
          </dd>
        </div>
        <div className={styles.figure}>
          <dt>Policies it covers</dt>
          <dd>{policies.premiumRecordedOn}</dd>
        </div>
        <div className={styles.figure}>
          <dt>Issued with no premium recorded</dt>
          <dd>
            {policies.premiumMissingOn === 0 ? (
              'None'
            ) : (
              <Badge tone="attn">{policies.premiumMissingOn} to type in</Badge>
            )}
          </dd>
        </div>
      </dl>

      <p className={styles.note}>
        The total is the sum of the final premiums already typed from insurers’ documents. The
        policies counted on the last line contribute nothing to it — an unrecorded premium is
        absent, not zero, and this screen will not work one out.
      </p>
    </>
  )
}

function ClaimReport({ data }: { data: ReportSet }) {
  const { claims } = data

  return (
    <>
      <CountTable label="Claims by state" rows={claims.byState} headers={['State', 'Claims']} />

      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt>Open</dt>
          <dd>{claims.open}</dd>
        </div>
        <div className={styles.figure}>
          <dt>Closed</dt>
          <dd>{claims.closed}</dd>
        </div>
        <div className={styles.figure}>
          <dt>Settlement recorded</dt>
          <dd>
            <Money paise={claims.recordedSettlement.paise} emphasis="strong" />
          </dd>
        </div>
        <div className={styles.figure}>
          <dt>Claims it covers</dt>
          <dd>{claims.settlementRecordedOn}</dd>
        </div>
      </dl>

      <p className={styles.note}>
        Every settlement in that total was typed from an insurer’s advice, which is the only source
        the claim machine accepts. Claims still in flight carry no figure and are not estimated.
      </p>
    </>
  )
}

/**
 * The pipeline, and the number that replaces a vanity metric — FR-06.19.
 *
 * §3.2 measures "% of inquiries confirmed within TAT", which can read 100% while
 * nobody has rung a single customer: confirming is a click, and the clock stops
 * on it. Coverage is the leading indicator — of the inquiries somebody accepted
 * and is supposedly working, how many have a next thing with a date on it — and
 * it is stated first here for that reason, with the stage table under it as the
 * detail.
 */
function PipelineReport({ data }: { data: ReportSet }) {
  const { pipeline } = data

  return (
    <>
      <dl className={styles.tiles}>
        <div>
          <dt>Open inquiries</dt>
          <dd>{pipeline.open}</dd>
        </div>
        <div>
          <dt>Carrying a next action</dt>
          <dd>
            {pipeline.withNextAction} of {pipeline.open}
          </dd>
        </div>
        <div>
          <dt>Overdue</dt>
          <dd data-attention={pipeline.overdue > 0 || undefined}>{pipeline.overdue}</dd>
        </div>
        <div>
          <dt>Nothing booked</dt>
          <dd data-attention={pipeline.unplanned > 0 || undefined}>{pipeline.unplanned}</dd>
        </div>
        <div>
          <dt>Never contacted</dt>
          <dd data-attention={pipeline.neverContacted > 0 || undefined}>
            {pipeline.neverContacted}
          </dd>
        </div>
      </dl>

      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Inquiry pipeline">
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col" className={styles.numeric}>
                Inquiries
              </th>
              <th scope="col" className={styles.numeric}>
                Median days here
              </th>
              <th scope="col" className={styles.numeric}>
                With a next action
              </th>
              <th scope="col" className={styles.numeric}>
                Overdue
              </th>
            </tr>
          </thead>
          <tbody>
            {pipeline.rows.map((row) => (
              <tr key={row.stageKey === '' ? 'unstaged' : row.stageKey}>
                <th scope="row">{row.label}</th>
                <td className={styles.numeric}>{row.count}</td>
                <td className={styles.numeric}>
                  {row.medianDaysInStage === null ? '—' : row.medianDaysInStage}
                </td>
                <td className={styles.numeric}>{row.withNextAction}</td>
                <td className={styles.numeric}>{row.overdue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        Counted against <DateTime value={data.asOf} />, from the stage recorded on each accepted
        inquiry. &ldquo;Nothing booked&rdquo; and &ldquo;Overdue&rdquo; are different faults: the
        first is a promise nobody made, the second is one that was missed. There is no conversion
        rate and no forecast here — a stage does not know what it will produce.
      </p>
    </>
  )
}

function RenewalReport({ data }: { data: ReportSet }) {
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Renewal buckets">
          <thead>
            <tr>
              <th scope="col">Bucket</th>
              <th scope="col">Expiry falls</th>
              <th scope="col" className={styles.numeric}>
                Policies
              </th>
            </tr>
          </thead>
          <tbody>
            {data.renewals.map((bucket) => (
              <tr key={bucket.key}>
                <th scope="row">{bucket.label}</th>
                <td className={styles.range}>
                  {bucket.from === null ? 'up to ' : ''}
                  {bucket.from === null ? null : (
                    <>
                      <DateTime value={bucket.from} /> to{' '}
                    </>
                  )}
                  <DateTime value={bucket.to} />
                </td>
                <td className={styles.numeric}>{bucket.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        Counted against <DateTime value={data.asOf} />, on the expiry date recorded on each live
        policy. There is no money on this report: a renewal premium is a figure the insurer has not
        issued yet, and the platform does not carry one forward.
      </p>
    </>
  )
}

function YearReport({ data }: { data: ReportSet }) {
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Year on year">
          <thead>
            <tr>
              <th scope="col">Financial year</th>
              <th scope="col" className={styles.numeric}>
                Policies written
              </th>
              <th scope="col" className={styles.numeric}>
                Change in policies
              </th>
              <th scope="col" className={styles.numeric}>
                Premium recorded
              </th>
              <th scope="col" className={styles.numeric}>
                Recorded on
              </th>
            </tr>
          </thead>
          <tbody>
            {data.years.map((year) => (
              <tr key={year.year}>
                <th scope="row">{year.label}</th>
                <td className={styles.numeric}>{year.policies}</td>
                <td className={styles.numeric}>
                  {year.changeInPolicies === null
                    ? '—'
                    : year.changeInPolicies > 0
                      ? `+${year.changeInPolicies}`
                      : String(year.changeInPolicies)}
                </td>
                <td className={styles.numeric}>
                  <Money paise={year.recordedPremium.paise} symbol={false} />
                </td>
                <td className={styles.numeric}>{year.premiumRecordedOn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        Years run April to March. The only comparison here is the change in the number of policies
        written; the money columns sit side by side and are left for a person to read. A percentage
        change on a premium total would be the platform asserting something nobody typed.
      </p>
    </>
  )
}

function BirthdayReport({ data }: { data: ReportSet }) {
  if (data.birthdays.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="No birthdays in the next thirty days"
        explanation="A customer appears here when the date of birth on their record falls inside the window. A customer with no date of birth recorded never appears — the field is filled in during KYC."
      />
    )
  }

  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Birthdays in the next thirty days">
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Birthday</th>
              <th scope="col">Mobile</th>
            </tr>
          </thead>
          <tbody>
            {data.birthdays.map((birthday) => (
              <tr key={birthday.customerId}>
                <th scope="row">
                  <Link className={styles.rowLink} to={`/customers/${birthday.customerId}`}>
                    {birthday.name}
                  </Link>
                </th>
                <td>
                  <DateTime value={birthday.dateOfBirth} />
                </td>
                <td className={styles.mono}>{birthday.mobile}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        The next {BIRTHDAY_WINDOW_DAYS} days from <DateTime value={data.asOf} />, on day and month
        only. Household members are not included yet: a member’s birthday needs a read this data
        layer has no cross-customer method for, and a short list that says so is better than a short
        list that does not. Nothing is sent from here.
      </p>
    </>
  )
}
