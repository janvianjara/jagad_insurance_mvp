import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { uploadDesk } from '../upload'
import { WHO, freshRepositories, renderClaims, signIn } from './test-harness'

/**
 * The cashless arm of flow 4, where the upload link meets the claim — FR-11.1,
 * FR-16.8, D21, and the guard that gives `summary_received` its meaning.
 *
 * CLM-0412 is the prototype's cashless claim, seeded at `upload_link_sent` with
 * its discharge summary recorded as not present. That is exactly the state this
 * step had to stop lying about: before it, an operator could mark the summary
 * received while the link was still empty.
 */

const NOW = new Date('2026-08-30T09:00:00.000Z')
const TOKEN = 'z'.repeat(32)
const CLAIM = 'clm-0412'

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.amit)
})

async function upload() {
  const desk = uploadDesk(repositories)
  await desk.issue({ actorId: WHO.amit, claimId: CLAIM, token: TOKEN, now: NOW })
  await desk.accept({
    token: TOKEN,
    docType: 'discharge_summary',
    fileName: 'discharge.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 240_000,
    now: NOW,
  })
}

describe('the discharge summary is read off the file, not asserted by the desk', () => {
  it('refuses to record the summary while the upload link is still empty', async () => {
    renderClaims(repositories, `/claims/${CLAIM}`)

    const action = await screen.findByRole('button', { name: 'Record the discharge summary' })
    expect(action).toBeDisabled()
    expect(
      await screen.findByText(/The discharge summary has not arrived yet/),
    ).toBeInTheDocument()
  })

  it('offers the move once the document is actually present', async () => {
    await upload()
    renderClaims(repositories, `/claims/${CLAIM}`)

    // The wait is for the upload ledger read. The control is drawn disabled until
    // the file it depends on has actually been looked at, which is the honest
    // order: no button claims a document is there before anyone has checked.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Record the discharge summary' })).toBeEnabled(),
    )
    expect(screen.queryByText(/has not arrived yet/)).not.toBeInTheDocument()
  })
})

describe('the link the desk sent', () => {
  it('is not shown when no link has been issued', async () => {
    renderClaims(repositories, `/claims/${CLAIM}`)

    await screen.findByRole('button', { name: 'Record the discharge summary' })
    expect(screen.queryByRole('heading', { name: 'The upload link' })).not.toBeInTheDocument()
  })

  it('shows where it points, when it closes and how much it has taken', async () => {
    await upload()
    renderClaims(repositories, `/claims/${CLAIM}`)

    expect(await screen.findByRole('heading', { name: 'The upload link' })).toBeInTheDocument()
    expect(screen.getByText(`/upload/${TOKEN}`)).toBeInTheDocument()
    expect(screen.getByText('1 of 10')).toBeInTheDocument()
  })

  it('says presence is all that is recorded, which is the DPDP promise in one line', async () => {
    await upload()
    renderClaims(repositories, `/claims/${CLAIM}`)

    expect(
      await screen.findByText(/Presence is recorded, never the document itself/),
    ).toBeInTheDocument()
  })
})
