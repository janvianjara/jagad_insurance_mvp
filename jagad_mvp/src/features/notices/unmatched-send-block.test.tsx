import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { unmatchedRowCannotBeIncludedInBulkSend } from '../../domain/workflows'
import type { MockRepositories } from '../../data/mock'
import { rowsBlockingSend, sendBlockNote } from './notice-view'
import { BATCH, ROW, WHO, freshRepositories, renderNotices, signIn } from './test-harness'

/**
 * §9: "An unmatched row cannot be included in a bulk send. Hard block, not a
 * warning."
 *
 * A warning is a sentence beside a live button. A block is a button that cannot
 * be pressed, and this is asserted at all three levels it is held at:
 *
 *   - the predicate the screen asks, which names every row that cannot go out
 *     and why;
 *   - the gate itself, whose Confirm is dead because there is no preview to
 *     confirm — an unmatched row leaves the send with nothing to show;
 *   - the repository, which refuses the same send with the machine's own
 *     sentence if it is ever reached another way, and writes nothing.
 *
 * The last one matters most. A block that lives only in a screen is a block one
 * bug away from being a warning again.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

describe('the predicate the screen asks', () => {
  it('names an unmatched row and says why it cannot go out', async () => {
    const page = await repositories.noticeBatches.rows(BATCH, { page: 1, pageSize: 50 })
    const blockers = rowsBlockingSend(page.rows)

    const unmatched = blockers.find((blocker) => blocker.row.id === ROW.unmatched)
    expect(unmatched?.reason).toBe('not matched to any policy this agency holds')

    // The row that matched but whose reads nobody checked is blocked too: a
    // letter carrying a figure nobody has read is the other half of the rule.
    const unchecked = blockers.find((blocker) => blocker.row.id === ROW.unchecked)
    expect(unchecked?.reason).toBe('still holding an extracted value nobody has confirmed')

    expect(sendBlockNote(blockers)).toContain('Unmatched rows cannot go out in a bulk send')
  })

  it('lets a matched, checked row through on its own', async () => {
    const clean = await repositories.noticeBatches.row(ROW.clean)
    expect(clean).not.toBeNull()
    expect(rowsBlockingSend([clean!])).toEqual([])
  })
})

describe('§9 — the gate refuses to send an unmatched row', () => {
  it('has nothing to confirm, and says which rows and why', async () => {
    const user = userEvent.setup()
    // The URL owns the selection, so the scenario is a linkable address: one
    // clean row and the unmatched one, ticked.
    renderNotices(repositories, `/renewals/notices/${BATCH}?sel=${ROW.clean},${ROW.unmatched}`)

    await user.click(await screen.findByRole('button', { name: 'Send renewal notices' }))

    const dialog = await screen.findByRole('dialog', { name: /Send 2 renewal notices/ })
    const confirm = within(dialog).getByRole('button', { name: 'Send the notices' })

    expect(confirm).toBeDisabled()
    expect(dialog).toHaveTextContent(/TA-HLT-0114552 — not matched to any policy this agency holds/)
    expect(dialog).toHaveTextContent(/Unmatched rows cannot go out in a bulk send/)
    expect(dialog).toHaveTextContent(/nothing to confirm/i)

    // And nothing was written on the way to finding that out.
    const batch = await repositories.noticeBatches.get(BATCH)
    expect(batch?.state).toBe('review')
    expect(batch?.sentAt).toBeNull()
  })

  it('offers the send at all only while the batch is in review', async () => {
    renderNotices(repositories, '/renewals/notices/ntb-0002?sel=ntm-0002-1')

    await screen.findByText(/This batch has gone out/)
    expect(screen.queryByRole('button', { name: 'Send renewal notices' })).toBeNull()
  })
})

describe('§9 — the repository refuses the same send independently', () => {
  it('blocks a send holding an unmatched row, and writes nothing', async () => {
    const outcome = await repositories.noticeBatches.send(BATCH, {
      actorId: WHO.vivek,
      sentBy: WHO.vivek,
      selectedRowIds: [ROW.clean, ROW.unmatched],
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    // TA-HLT-0114552 matched nothing and nobody has checked its reads either;
    // whichever refusal fires first, the send does not happen and the batch is
    // exactly where it was.
    expect(outcome.reason).toContain('TA-HLT-0114552')

    const batch = await repositories.noticeBatches.get(BATCH)
    expect(batch?.state).toBe('review')
    expect(batch?.sentAt).toBeNull()
  })

  it('is the machine’s rule, not the screen’s: the guard refuses on its own', async () => {
    const page = await repositories.noticeBatches.rows(BATCH, { page: 1, pageSize: 50 })
    const unmatched = page.rows.find((row) => row.id === ROW.unmatched)
    const clean = page.rows.find((row) => row.id === ROW.clean)
    expect(unmatched).toBeDefined()
    expect(clean).toBeDefined()

    const verdict = unmatchedRowCannotBeIncludedInBulkSend({
      rows: [clean!, unmatched!].map((row) => ({
        id: row.id,
        state: row.state,
        noticePolicyNo: row.noticePolicyNo,
        ...(row.matchedPolicyId === null ? {} : { matchedPolicyId: row.matchedPolicyId }),
      })),
    })

    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toContain('Unmatched rows cannot go out in a bulk send')
  })

  it('blocks a row still holding an unconfirmed read, naming it', async () => {
    const outcome = await repositories.noticeBatches.send(BATCH, {
      actorId: WHO.vivek,
      sentBy: WHO.vivek,
      selectedRowIds: [ROW.clean, ROW.unchecked],
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toContain('nobody has confirmed')
    expect(outcome.reason).toContain('TA-TRV-0331808')
  })

  it('sends the rows that are clean, once they are the only ones ticked', async () => {
    const user = userEvent.setup()
    renderNotices(repositories, `/renewals/notices/${BATCH}?sel=${ROW.clean}`)

    await user.click(await screen.findByRole('button', { name: 'Send renewal notices' }))

    const dialog = await screen.findByRole('dialog', { name: /Send 1 renewal notice/ })
    expect(within(dialog).getByText('TA-HLT-0092214')).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: 'Send the notices' })
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    await waitFor(async () => {
      const batch = await repositories.noticeBatches.get(BATCH)
      expect(batch?.state).toBe('sent')
      expect(batch?.sentAt).not.toBeNull()
    })
  })
})
