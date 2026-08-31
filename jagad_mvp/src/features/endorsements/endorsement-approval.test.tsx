import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { ENDORSEMENT, WHO, freshRepositories, renderEndorsements, signIn } from './test-harness'

/**
 * §9's last edge: "approved → policy_versioned (immutable, both endorsement
 * nos., new PDF)".
 *
 * The walk below is the whole path from a correction sitting on the
 * non-financial branch to the version it produces, driven through the screen
 * rather than the repository, so what is asserted is what a person can actually
 * do. Two properties are the point:
 *
 *   - the version carries our endorsement number and the insurer's, side by
 *     side, because both get read aloud on the phone;
 *   - version 1 is still there afterwards, saying exactly what it said when it
 *     was issued. An approved endorsement writes a version; it never edits one.
 */

let repositories: MockRepositories

const INSURER_NO = '2825 1049 7731 02'
const VERSION_NOTE = 'Nominee name corrected to Nita. Version 1 stays exactly as issued.'

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

async function step(user: ReturnType<typeof userEvent.setup>, trigger: string, confirm: string) {
  await user.click(await screen.findByRole('button', { name: trigger }))
  await user.click(await screen.findByRole('button', { name: confirm }))
}

describe('§9 — approval writes an immutable policy version', () => {
  it('carries both endorsement numbers and leaves the earlier version alone', async () => {
    const user = userEvent.setup()
    const before = await repositories.policies.versions('pol-4388')

    renderEndorsements(repositories, `/endorsements/${ENDORSEMENT.correction}`)
    await screen.findByRole('heading', { name: 'No money on this endorsement' })

    await step(user, 'Submit to the insurer desk', 'Submit the endorsement')
    await waitFor(async () =>
      expect((await repositories.endorsements.get(ENDORSEMENT.correction))?.state).toBe('submitted'),
    )

    await step(user, 'Approve', 'Approve the endorsement')
    await waitFor(async () =>
      expect((await repositories.endorsements.get(ENDORSEMENT.correction))?.state).toBe('approved'),
    )

    await user.click(await screen.findByRole('button', { name: 'Write the policy version' }))

    // The gate refuses to confirm until both numbers and the effective date are
    // on the form: an empty preview is not confirmable.
    expect(screen.getByRole('button', { name: 'Write the version' })).toBeDisabled()

    await user.type(screen.getByLabelText('Insurer endorsement number'), INSURER_NO)
    await user.type(screen.getByLabelText('Effective from'), '2026-09-01')
    await user.type(screen.getByLabelText('What this version records'), VERSION_NOTE)

    await user.click(screen.getByRole('button', { name: 'Write the version' }))

    await waitFor(async () => {
      const held = await repositories.endorsements.get(ENDORSEMENT.correction)
      expect(held?.state).toBe('policy_versioned')
      expect(held?.insurerEndorsementNo).toBe(INSURER_NO)
    })

    const after = await repositories.policies.versions('pol-4388')
    expect(after).toHaveLength(before.length + 1)

    const written = after.find((version) => version.insurerEndorsementNo === INSURER_NO)
    expect(written).toBeDefined()
    expect(written?.endorsementNo).toBe('END-0031')
    expect(written?.note).toBe(VERSION_NOTE)

    // Untouched, and still saying what it said when the policy was issued.
    const first = after.find((version) => version.version === 1)
    expect(first?.note).toBe(before.find((version) => version.version === 1)?.note)
    expect(first?.endorsementNo).toBeNull()
  })

  it('shows both numbers on the versions panel afterwards', async () => {
    await repositories.endorsements.submit(ENDORSEMENT.correction, { actorId: WHO.vivek })
    await repositories.endorsements.approve(ENDORSEMENT.correction, { actorId: WHO.vivek })
    await repositories.endorsements.versionPolicy(ENDORSEMENT.correction, {
      actorId: WHO.vivek,
      insurerEndorsementNo: INSURER_NO,
      effectiveFrom: '2026-09-01',
      note: VERSION_NOTE,
    })

    renderEndorsements(repositories, `/endorsements/${ENDORSEMENT.correction}`)

    const panel = (await screen.findByRole('heading', { name: 'Policy versions' })).closest(
      'section',
    ) as HTMLElement
    await waitFor(() => expect(within(panel).getByText(`insurer ${INSURER_NO}`)).toBeInTheDocument())
    expect(within(panel).getByText('ours END-0031')).toBeInTheDocument()
  })
})
