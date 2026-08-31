import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import type { Policy } from '../../data/repo'
import { resolveAccount } from '../../app/store'
import { sumMoney, zero } from '../../domain/money'
import type { Money } from '../../domain/money'
import { financialYearOf, isoDay, reportsDesk } from './data/reports-desk'
import { REPORT_KEYS, REPORTS } from './report-catalogue'
import { WALKTHROUGH_NOW, WHO, freshRepositories, renderReports, signIn } from './test-harness'

/**
 * Reports — plan §5's core dashboard.
 *
 * The one rule worth a test suite of its own: **a report reads.** Every figure
 * is either a count of rows that exist or the sum of amounts somebody typed.
 * Nothing is projected, estimated, annualised or worked out — and the way that
 * breaks is not a crash, it is a helpful-looking column appearing in a diff.
 *
 * So these tests reconstruct each figure from the repository by hand and assert
 * the screen agrees, and they assert the absences too: a policy with no recorded
 * premium contributes nothing rather than zero, the renewal report carries no
 * money at all, and year on year compares counts rather than money.
 *
 * Nothing here imports a fixture.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

async function admin(repositories: MockRepositories) {
  const staff = await repositories.config.users()
  const person = staff.find((candidate) => candidate.id === WHO.vivek)
  if (!person) throw new Error('No admin in the seed set.')
  return resolveAccount(person).user
}

async function everyPolicy(repositories: MockRepositories): Promise<readonly Policy[]> {
  const page = await repositories.policies.list({ page: 1, pageSize: 10_000 })
  return page.rows
}

const PREMIUM_BEARING = ['issued', 'dispatched', 'documents_collected', 'closed', 'locked']

describe('a report reads recorded figures and computes nothing', () => {
  it('totals only the final premiums that were actually recorded', async () => {
    const policies = await everyPolicy(repositories)
    const live = policies.filter((policy) => PREMIUM_BEARING.includes(policy.status))
    const recorded = live
      .map((policy) => policy.finalPremium)
      .filter((amount): amount is Money => amount !== null)
    const expected = recorded.length === 0 ? zero() : sumMoney(recorded)

    const set = await reportsDesk(repositories).read(await admin(repositories), WALKTHROUGH_NOW)

    expect(set.policies.recordedPremium.paise).toBe(expected.paise)
    expect(set.policies.premiumRecordedOn).toBe(recorded.length)
    expect(set.policies.premiumMissingOn).toBe(live.length - recorded.length)
  })

  it('counts a policy with no premium as missing one, never as zero', async () => {
    const policies = await everyPolicy(repositories)
    const missing = policies.filter(
      (policy) => PREMIUM_BEARING.includes(policy.status) && policy.finalPremium === null,
    )

    const set = await reportsDesk(repositories).read(await admin(repositories), WALKTHROUGH_NOW)

    expect(set.policies.premiumMissingOn).toBe(missing.length)
    // The total covers only what it says it covers.
    expect(set.policies.premiumRecordedOn + set.policies.premiumMissingOn).toBe(
      policies.filter((policy) => PREMIUM_BEARING.includes(policy.status)).length,
    )
  })

  it('totals only settlements the insurer has already advised', async () => {
    const page = await repositories.claims.list({ page: 1, pageSize: 10_000 })
    const recorded = page.rows
      .map((claim) => claim.settlement.amount)
      .filter((amount): amount is Money => amount !== null)
    const expected = recorded.length === 0 ? zero() : sumMoney(recorded)

    const set = await reportsDesk(repositories).read(await admin(repositories), WALKTHROUGH_NOW)

    expect(set.claims.recordedSettlement.paise).toBe(expected.paise)
    expect(set.claims.settlementRecordedOn).toBe(recorded.length)
    expect(set.claims.total).toBe(page.rows.length)
    expect(set.claims.open + set.claims.closed).toBe(page.rows.length)
  })

  it('buckets renewals on the recorded expiry date, and carries no money', async () => {
    const today = isoDay(WALKTHROUGH_NOW)
    const policies = await everyPolicy(repositories)
    const renewable = policies.filter(
      (policy) =>
        ['issued', 'dispatched', 'documents_collected'].includes(policy.status) &&
        policy.expiryDate !== null,
    )

    const set = await reportsDesk(repositories).read(await admin(repositories), WALKTHROUGH_NOW)

    const overdue = set.renewals.find((bucket) => bucket.key === 'overdue')
    expect(overdue?.count).toBe(
      renewable.filter((policy) => (policy.expiryDate ?? '') < today).length,
    )

    const thirty = set.renewals.find((bucket) => bucket.key === 'd30')
    expect(thirty).toBeDefined()
    expect(thirty?.count).toBe(
      renewable.filter(
        (policy) =>
          (policy.expiryDate ?? '') >= (thirty?.from ?? '') &&
          (policy.expiryDate ?? '') <= (thirty?.to ?? ''),
      ).length,
    )

    // The rendered report has no currency on it anywhere. A renewal premium is a
    // figure the insurer has not issued yet.
    renderReports(repositories, '/reports/renewals')
    const table = await screen.findByRole('table', { name: 'Renewal buckets' })
    expect(table.textContent ?? '').not.toContain('₹')
  })

  it('compares years on policy count and never on money', async () => {
    const policies = await everyPolicy(repositories)
    const set = await reportsDesk(repositories).read(await admin(repositories), WALKTHROUGH_NOW)

    for (const year of set.years) {
      const written = policies.filter(
        (policy) => policy.startDate !== null && financialYearOf(policy.startDate) === year.year,
      )
      expect(year.policies).toBe(written.length)
    }

    // The first year has nothing before it to compare with; the rest compare
    // counts, and the difference is exactly that subtraction.
    expect(set.years[0].changeInPolicies).toBeNull()
    for (let index = 1; index < set.years.length; index += 1) {
      expect(set.years[index].changeInPolicies).toBe(
        set.years[index].policies - set.years[index - 1].policies,
      )
    }

    renderReports(repositories, '/reports/yoy')
    const table = await screen.findByRole('table', { name: 'Year on year' })
    // No growth rate, no projection, no percentage on money.
    expect(table.textContent ?? '').not.toContain('%')
  })

  it('lists birthdays inside the window, read off the record', async () => {
    const today = isoDay(WALKTHROUGH_NOW)
    const page = await repositories.customers.list({ page: 1, pageSize: 10_000 })

    const set = await reportsDesk(repositories).read(await admin(repositories), WALKTHROUGH_NOW)

    for (const birthday of set.birthdays) {
      const customer = page.rows.find((row) => row.id === birthday.customerId)
      expect(customer?.dateOfBirth).toBe(birthday.dateOfBirth)
      expect(birthday.monthDay).toBe(birthday.dateOfBirth.slice(5, 10))
    }

    // Nobody without a recorded date of birth is invented into the list.
    const withoutDob = page.rows.filter((row) => row.dateOfBirth === null).map((row) => row.id)
    for (const id of withoutDob) {
      expect(set.birthdays.some((birthday) => birthday.customerId === id)).toBe(false)
    }

    expect(set.asOf).toBe(today)
  })
})

describe('the dashboard and the reports agree', () => {
  it('shows the same headline figures the reports behind it carry', async () => {
    const set = await reportsDesk(repositories).read(await admin(repositories), WALKTHROUGH_NOW)

    renderReports(repositories)
    await screen.findByRole('heading', { name: 'Reports' })

    const stats = screen.getByRole('region', { name: 'Headline figures' })
    expect(within(stats).getByText(String(set.policies.total))).toBeInTheDocument()
    expect(within(stats).getByText(String(set.claims.open))).toBeInTheDocument()
  })

  it('indexes all five reports, each saying what it refuses to work out', async () => {
    renderReports(repositories)
    await screen.findByRole('heading', { name: 'Reports' })

    for (const report of REPORTS) {
      const link = await screen.findByRole('link', { name: new RegExp(report.title) })
      expect(link).toHaveAttribute('href', `/reports/${report.key}`)
      expect(link.textContent ?? '').toContain(report.never)
    }
  })

  it('refuses an address that names no report, and says which ones exist', async () => {
    renderReports(repositories, '/reports/profit-forecast')

    await screen.findByRole('heading', { name: 'No such report' })
    expect(await screen.findByText(/There is no report called/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(REPORTS[0].title))).toBeInTheDocument()
  })

  it('prints the promise on the report itself', async () => {
    renderReports(repositories, '/reports/policies')

    await screen.findByRole('heading', { name: 'Policy summary', level: 1 })
    // Looked up by key, not by position. The catalogue is ordered for the
    // reader, so a report added ahead of this one must not silently retarget the
    // assertion at a definition whose text this page never prints.
    const definition = REPORTS.find((report) => report.key === REPORT_KEYS.policies)
    expect(definition).toBeDefined()
    expect(screen.getByText(definition!.reads)).toBeInTheDocument()
    expect(screen.getByText(definition!.never)).toBeInTheDocument()
  })
})

/**
 * The pipeline — FR-06.19, and the number that replaces a vanity metric.
 *
 * Every figure is reconstructed from the repository here, exactly as the other
 * report tests do it, because the way a report breaks is not a crash: it is a
 * plausible-looking column appearing in a diff.
 */
describe('the inquiry pipeline', () => {
  it('counts open inquiries by stage, and reconciles against a direct read', async () => {
    const user = await admin(repositories)
    const desk = reportsDesk(repositories)
    const set = await desk.read(user, WALKTHROUGH_NOW)

    const page = await repositories.inquiries.list({ page: 1, pageSize: 10_000 })
    const stages = await repositories.config.inquiryStages()
    const openByHand = page.rows.filter((inquiry) => {
      if (inquiry.status !== 'accepted') return false
      const stage = stages.find((row) => row.key === inquiry.stageKey)
      return stage === undefined ? true : stage.countsAsOpen
    })

    expect(set.pipeline.open).toBe(openByHand.length)
    expect(set.pipeline.withNextAction).toBe(
      openByHand.filter((inquiry) => inquiry.nextActionAt !== null).length,
    )
    // The two faults are counted apart, and together they account for the rest.
    expect(set.pipeline.unplanned + set.pipeline.withNextAction).toBe(set.pipeline.open)
  })

  it('separates a promise missed from a promise never made', async () => {
    const user = await admin(repositories)
    const set = await reportsDesk(repositories).read(user, WALKTHROUGH_NOW)

    // The cast holds one of each: a lead whose callback went past yesterday, and
    // leads nobody has planned anything for at all.
    expect(set.pipeline.overdue).toBeGreaterThan(0)
    expect(set.pipeline.unplanned).toBeGreaterThan(0)

    const overdueRows = await repositories.inquiries.nextActionOverdue(WALKTHROUGH_NOW)
    expect(set.pipeline.overdue).toBe(overdueRows.rows.length)
  })

  it('counts the accepted inquiries nobody has spoken to at all', async () => {
    const user = await admin(repositories)
    const set = await reportsDesk(repositories).read(user, WALKTHROUGH_NOW)

    const activities = await repositories.activities.list({ page: 1, pageSize: 10_000 })
    const spokenTo = new Set(
      activities.rows
        .filter((activity) => activity.subjectEntity === 'Inquiry')
        .map((activity) => activity.subjectId),
    )
    expect(set.pipeline.neverContacted).toBeLessThanOrEqual(set.pipeline.open)
    expect(set.pipeline.neverContacted).toBe(
      set.pipeline.open -
        (await repositories.inquiries.list({ page: 1, pageSize: 10_000 })).rows.filter(
          (inquiry) =>
            inquiry.status === 'accepted' &&
            spokenTo.has(inquiry.id) &&
            inquiry.stageKey !== 'dormant' &&
            inquiry.stageKey !== 'data_issue',
        ).length,
    )
  })

  it('renders the stage table and the coverage tiles, and forecasts nothing', async () => {
    renderReports(repositories, '/reports/pipeline')

    await screen.findByRole('heading', { name: 'Inquiry pipeline', level: 1 })
    const table = await screen.findByRole('table', { name: 'Inquiry pipeline' })
    expect(within(table).getByText('Follow-up scheduled')).toBeInTheDocument()
    expect(within(table).getByText('Median days here')).toBeInTheDocument()

    expect(screen.getByText('Carrying a next action')).toBeInTheDocument()
    expect(screen.getByText('Nothing booked')).toBeInTheDocument()

    // The absence that matters, checked in the figures rather than on the page:
    // the report's own "never" line names these words in order to disclaim them,
    // so asserting against the whole document would only find the disclaimer.
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent ?? '')
    expect(headers.some((header) => /probability|expected|forecast|conversion/i.test(header))).toBe(
      false,
    )
  })
})
