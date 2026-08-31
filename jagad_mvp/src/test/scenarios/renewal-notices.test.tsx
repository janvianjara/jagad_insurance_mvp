import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { WHO, freshRepositories, renderScenario, signIn } from './harness'

/**
 * Canvas 5.3 — "Month's notices arrive → Bulk upload → each read by its
 * company's template; rows to review".
 *
 * This row is the one place in flow 5 where the platform's own documentation
 * and its behaviour had drifted apart, so it is walked here rather than left as
 * a sentence. Two halves, and the seam between them is the honest part:
 *
 *   - the upload names the extraction template configured for the insurer who
 *     sent the file, and reads nothing off it. A screen that both uploads and
 *     extracts is a screen where nobody looks at what was extracted, so the read
 *     is a second, deliberate move on the batch;
 *   - a batch that has been read comes back as a review queue: the rows the
 *     extraction produced, the template they were read with, and the count of
 *     values still waiting for a person.
 *
 * What is deliberately NOT asserted here is a batch going the whole way in one
 * walk, because it cannot: nothing in the product completes an extraction, so a
 * batch a person uploads today stops at `ocr_running` and the rows below belong
 * to a batch the fixtures seeded. That is why the registry keeps 5.3 pending
 * with these two as `partly` rather than calling the row finished.
 */

let repositories: MockRepositories

/** The insurer whose template neither seeded batch was read with. */
const INSURER = 'HDFC Ergo General Insurance'
const TEMPLATE = 'HDFC Ergo renewal notice v1'
/** The Tata AIG batch the fixtures seeded in review, canvas n32-n36. */
const REVIEWED = 'ntb-0001'

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

/** The gate open on screen, so a Confirm is never taken from the control behind it. */
function gate(): HTMLElement {
  const node = document.querySelector('[data-confirm-gate]')
  if (!node) throw new Error('No confirmation gate is open.')
  return node as HTMLElement
}

describe('canvas 5.3 — a month of renewal notices arrives as one file', () => {
  it('5.3 a month of notices is uploaded against the template configured for that insurer, and nothing is read off it until a person starts the extraction', async () => {
    const user = userEvent.setup()
    renderScenario(repositories, '/renewals/notices')

    const companies = await repositories.companies.list({ page: 1, pageSize: 200 })
    const hdfc = companies.rows.find((row) => row.name === INSURER)
    expect(hdfc).toBeDefined()

    await user.click(await screen.findByRole('button', { name: 'Upload notices' }))
    const dialog = await screen.findByRole('dialog', {
      name: /Upload a month of renewal notices/,
    })

    await user.selectOptions(within(dialog).getByRole('combobox'), hdfc?.id as string)
    await user.type(
      within(dialog).getByLabelText('File'),
      'hdfc-ergo-renewal-notices-2026-10.pdf',
    )
    await user.type(within(dialog).getByLabelText('Expiry month'), '2026-10')

    // The insurer decides the template, and the gate says which one before the
    // record exists. Every company lays its notice out differently, so a batch
    // read with the wrong template is a batch of wrong letters.
    expect(within(dialog).getByText(TEMPLATE)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Record the batch' }))

    // The batch screen, addressed by the batch the upload created.
    expect(await screen.findByText(`read with ${TEMPLATE}`)).toBeInTheDocument()
    expect(
      await screen.findByText(/nothing has been read off it yet/),
    ).toBeInTheDocument()

    const queue = await repositories.noticeBatches.queue({ page: 1, pageSize: 50 })
    const uploaded = queue.rows.find(
      (row) => row.fileName === 'hdfc-ergo-renewal-notices-2026-10.pdf',
    )
    expect(uploaded).toBeDefined()
    expect(uploaded?.state).toBe('uploaded')
    expect(uploaded?.companyId).toBe(hdfc?.id)
    expect(uploaded?.ocrTemplateId).toBe('ocr-hdfc-ergo-renewal')
    // Nothing was read: the upload recorded that a file arrived, and no more.
    expect(uploaded?.ocrStartedAt).toBeNull()
    expect(uploaded?.rowCount).toBe(0)

    // The read is the second move, and it is its own gate.
    await user.click(screen.getByRole('button', { name: 'Start extraction' }))
    expect(within(gate()).getByText(TEMPLATE)).toBeInTheDocument()
    await user.click(within(gate()).getByRole('button', { name: 'Start extraction' }))

    expect(
      await screen.findByText(/Extraction is running against this insurer/),
    ).toBeInTheDocument()
    const after = await repositories.noticeBatches.get(uploaded?.id as string)
    expect(after?.state).toBe('ocr_running')
    expect(after?.ocrStartedAt).not.toBeNull()
  })

  it('5.3 the rows an extraction produced come back as a review queue, with the template they were read with named on the batch', async () => {
    renderScenario(repositories, `/renewals/notices/${REVIEWED}`)

    expect(await screen.findByText('read with Tata AIG renewal notice v3')).toBeInTheDocument()

    // Every row the read produced, as printed on the insurer's paper.
    const rows = await repositories.noticeBatches.rows(REVIEWED, { page: 1, pageSize: 50 })
    expect(rows.rows.length).toBeGreaterThan(0)
    for (const row of rows.rows) {
      expect(await screen.findByText(row.noticePolicyNo)).toBeInTheDocument()
    }

    // And the counts a person works the batch from, including the two that hold
    // the review open: what matched nothing, and what nobody has checked.
    const summary = await repositories.noticeBatches.summary(REVIEWED)
    expect(summary?.unmatched).toBeGreaterThan(0)
    expect(summary?.unconfirmedExtractions).toBeGreaterThan(0)
    expect(
      screen.getByText(
        summary?.unmatched === 1
          ? '1 row matched nothing this agency holds'
          : `${summary?.unmatched} rows matched nothing this agency holds`,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Awaiting a person')).toBeInTheDocument()
  })
})
