import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import {
  CLAIM_FOLLOW_UP_STATES,
  COLLECTION_VERIFICATION_STATES,
  KYC_OUTSTANDING_STATES,
  OPS_QUEUES,
  SUB_AGENT_INTAKE_STATES,
} from './queues'
import { opsDesk } from './data/ops-desk'
import { WHO, freshRepositories, renderBackOffice, signIn } from './test-harness'

/**
 * FR-08.1 — "six ops queues in one view".
 *
 * The promise this screen makes is narrower than it looks, and each half of it
 * can break on its own:
 *
 *   - all six queues are present, with the depth each one actually has;
 *   - a tile links to the screen that OWNS the queue, narrowed so the linked
 *     list is the rows the tile counted — the home gathers rather than
 *     re-implementing;
 *   - a queue whose screen is a later phase still reports its depth and says so.
 *
 * Nothing here imports a fixture. Every expected number is read back through the
 * same repository the screen reads, so the test asserts that the home agrees
 * with the book rather than with a hard-coded count that would rot.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

function tileFor(title: string): HTMLElement {
  const list = screen.getByRole('list', { name: 'Operations queues' })
  const item = within(list)
    .getAllByRole('listitem')
    .find((candidate) => within(candidate).queryByText(title) !== null)
  if (!item) throw new Error(`No tile called "${title}" is on the board.`)
  return item
}

describe('FR-08.1 — the six-queue ops home', () => {
  it('shows all six queues in one view', async () => {
    renderBackOffice(repositories)

    await screen.findByRole('heading', { name: 'Back office' })

    const list = screen.getByRole('list', { name: 'Operations queues' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(6)

    for (const queue of OPS_QUEUES) {
      expect(within(list).getByText(queue.title)).toBeInTheDocument()
    }
  })

  it('reports the depth each queue actually has, read the same way the queue reads it', async () => {
    const [drafts, kyc, entry, collections, claims, intake] = await Promise.all([
      repositories.policies.completionQueue({ page: 1, pageSize: 1 }),
      repositories.customers.list({
        page: 1,
        pageSize: 1,
        filters: { kycState: KYC_OUTSTANDING_STATES },
      }),
      repositories.deals.awaitingPolicyEntry({ page: 1, pageSize: 1 }),
      repositories.collections.list({
        page: 1,
        pageSize: 1,
        filters: { state: COLLECTION_VERIFICATION_STATES },
      }),
      repositories.claims.queue({
        page: 1,
        pageSize: 1,
        filters: { state: CLAIM_FOLLOW_UP_STATES },
      }),
      repositories.inquiries.list({
        page: 1,
        pageSize: 1,
        filters: { source: ['sub_agent'], status: SUB_AGENT_INTAKE_STATES },
      }),
    ])

    renderBackOffice(repositories)
    await screen.findByText('Draft completion')

    expect(within(tileFor('Draft completion')).getByText(String(drafts.total))).toBeInTheDocument()
    expect(within(tileFor('KYC completion')).getByText(String(kyc.total))).toBeInTheDocument()
    expect(within(tileFor('Entry')).getByText(String(entry.total))).toBeInTheDocument()
    expect(
      within(tileFor('Collection verification')).getByText(String(collections.total)),
    ).toBeInTheDocument()
    expect(within(tileFor('Claim follow-up')).getByText(String(claims.total))).toBeInTheDocument()
    expect(within(tileFor('Sub-agent intake')).getByText(String(intake.total))).toBeInTheDocument()
  })

  it('links each built queue to the screen that owns it, narrowed to what the tile counted', async () => {
    renderBackOffice(repositories)
    await screen.findByText('Draft completion')

    const href = (title: string) =>
      within(tileFor(title)).getByRole('link').getAttribute('href')

    // The two queues P-14 and P-15 already built keep their own screens; the
    // home points at them rather than repeating them.
    expect(href('KYC completion')).toBe('/back-office/kyc')
    expect(href('Draft completion')).toBe('/back-office/drafts')

    // Entry and intake are narrowings of screens that exist. The filter in the
    // link is the same state set the depth was counted with.
    expect(href('Entry')).toBe('/deals?status=line_items_set')
    expect(href('Sub-agent intake')).toBe(
      `/inquiries?source=sub_agent&status=${SUB_AGENT_INTAKE_STATES.join(',')}`,
    )

    // `/claims` is built. This tile spent a while saying it was not, which is why
    // the assertion is here rather than in the "later phase" test below.
    expect(href('Claim follow-up')).toBe(`/claims?state=${CLAIM_FOLLOW_UP_STATES.join(',')}`)
  })

  it('never tells anyone to wait for a screen that is already built', async () => {
    renderBackOffice(repositories)
    await screen.findByText('Claim follow-up')

    // Every queue whose screen exists must be reachable from the board. The
    // failure this replaces was a tile reading "No screen yet" over a routed,
    // working queue, which reads as "somebody forgot this" and parks real work.
    for (const queue of OPS_QUEUES) {
      const tile = tileFor(queue.title)
      if (queue.href === null) {
        expect(within(tile).queryByRole('link')).toBeNull()
        expect(within(tile).getByText(/No screen yet/)).toBeInTheDocument()
      } else {
        expect(within(tile).getByRole('link')).toHaveAttribute('href', queue.href)
        expect(within(tile).queryByText(/No screen yet/)).toBeNull()
      }
    }
  })

  it('totals the six depths in the header', async () => {
    const board = await opsDesk(repositories).board()

    renderBackOffice(repositories)

    await screen.findByText(
      board.waiting === 1
        ? '1 item waiting across six queues'
        : `${board.waiting} items waiting across six queues`,
    )
  })
})
