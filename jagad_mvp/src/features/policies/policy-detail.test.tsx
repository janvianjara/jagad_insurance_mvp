import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import type { MockRepositories } from '../../data/mock'
import { CAST, WHO, freshRepositories, renderPolicyFile, signIn } from './test-harness'

/**
 * `/policies/:id` — the file, as a composition.
 *
 * The screen itself holds no rules, so these tests do not look for any. What
 * they check is the two things a composition can get wrong and nothing else can
 * catch: that the parts are actually mounted together on one address, and that
 * the record's own figures survive the trip to the page unchanged.
 *
 * The premium assertions are the interesting half. On the entry screen the Final
 * Premium is a control, because somebody is recording it; here it must be text,
 * because the figure now belongs to the insurer and is changed by endorsement
 * rather than by editing a field. A control on this screen would be an edit path
 * around the machine, which is exactly the shape of mistake `<RollUp>` and
 * `<RecordOnlyAmount>` exist to prevent — so "there is no textbox in the premium
 * panel" is a real assertion rather than a cosmetic one.
 *
 * The retention pair is the other. §9 says a closed policy past its retention
 * class locks and is never hard-deleted, and a screen that expressed that by
 * simply having no delete control would teach nobody anything: the person who
 * came looking for one leaves believing the feature is unbuilt. So both
 * sentences are the machine's own, and both are asserted here by their text.
 */

describe('the policy file', () => {
  let repositories: MockRepositories

  beforeEach(async () => {
    repositories = freshRepositories()
    await signIn(repositories, WHO.priya)
  })

  it('puts the record, the premium as recorded, the payment fork and issuance on one address', async () => {
    renderPolicyFile(repositories, CAST.issued)

    // Dual numbering, on the record that has both. §8: the distinction has to be
    // visible, so the insurer's own number is drawn rather than merged.
    const policy = await repositories.policies.get(CAST.issued)
    expect(policy?.insurerNo).toBeTruthy()
    // Both numbers are drawn more than once — the header identifies the record
    // and the issuance panel repeats them beside the move it is offering. That
    // is the point of `<RecordId>`: one rendering, used wherever the record is
    // named, so the two numbers can never drift apart on one screen.
    expect(await screen.findAllByText(policy?.systemNo ?? '')).not.toHaveLength(0)
    expect(screen.getAllByText(policy?.insurerNo ?? '')).not.toHaveLength(0)

    // The three panels the other two workers built, mounted together.
    expect(await screen.findByRole('heading', { name: 'Premium' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Payment' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Issuance' })).toBeInTheDocument()
  })

  it('prints the recorded premium rather than offering a control that could change it', async () => {
    renderPolicyFile(repositories, CAST.issued)

    const premium = (await screen.findByRole('heading', { name: 'Premium' })).closest('section')
    expect(premium).not.toBeNull()

    const panel = within(premium as HTMLElement)
    expect(panel.getByText('Final premium, as recorded')).toBeInTheDocument()

    // No way in. An amount reaches this record through entry or through a
    // confirmed extraction, and both of those are elsewhere.
    expect(panel.queryAllByRole('textbox')).toHaveLength(0)
    expect(panel.queryAllByRole('spinbutton')).toHaveLength(0)

    // The derived rows are still here, still derived, and still marked as such.
    expect(premium?.querySelectorAll('[data-derived]').length).toBeGreaterThan(0)
  })

  it('answers the retention question with the machine sentence instead of hiding the control', async () => {
    renderPolicyFile(repositories, CAST.issued)

    expect(
      await screen.findByText(
        'Policy records are never deleted. Past its retention class a closed policy locks: it stays readable, and nothing can change it.',
      ),
    ).toBeInTheDocument()

    // This policy has not closed, so the clock has not started — and the guard
    // says so in its own words rather than the screen inventing a second phrasing.
    const retention = document.querySelector('[data-retention]')
    expect(retention?.textContent).toBe(
      'The retention clock starts when a policy closes, and this one has no closing date.',
    )

    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('says plainly when no address answers, rather than rendering an empty file', async () => {
    renderPolicyFile(repositories, 'pol-does-not-exist')

    expect(await screen.findByText('No policy answers to that address')).toBeInTheDocument()
  })
})
