import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { uploadDesk } from './data/upload-desk'
import UploadTokenScreen from './UploadTokenScreen'

/**
 * `/upload/:token` as the customer meets it — FR-11.1, FR-16.8, D21.
 *
 * The page is rendered with no session hydrated at all, which is the point: if
 * anything on it reached the session store these tests would be the first to
 * fail, before the module-graph walk in `upload-isolation.test.ts` ever ran.
 */

const NOW = new Date('2026-08-30T09:00:00.000Z')
const TOKEN = 'z'.repeat(32)
const CLAIM = 'clm-0412'

let repositories: MockRepositories

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
})

function renderUpload(token: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <MemoryRouter initialEntries={[`/upload/${token}`]}>
        <Routes>
          <Route path="/upload/:token" element={<UploadTokenScreen />} />
        </Routes>
      </MemoryRouter>
    </RepositoriesProvider>,
  )
}

async function issue(token = TOKEN) {
  await uploadDesk(repositories).issue({
    actorId: 'usr-amit-rana',
    claimId: CLAIM,
    token,
    now: NOW,
  })
}

/** A file the picker can be handed. Only name, type and size are ever read. */
function aFile(name = 'discharge.pdf') {
  return new File(['not read'], name, { type: 'application/pdf' })
}

describe('a live link', () => {
  it('names the claim and what it will take, without naming the customer', async () => {
    await issue()
    renderUpload(TOKEN)

    expect(await screen.findByText(/claim CLM-0412/)).toBeInTheDocument()
    expect(screen.getByText('Discharge summary')).toBeInTheDocument()
    // The page cannot verify who is holding it, so it says nothing about them.
    expect(screen.queryByText(/Rakesh/)).not.toBeInTheDocument()
  })

  it('says on the page that it asks for no identity document', async () => {
    await issue()
    renderUpload(TOKEN)

    expect(await screen.findByText(/do not ask for your Aadhaar/i)).toBeInTheDocument()
  })

  it('takes a document only after the gate is confirmed, and records presence', async () => {
    const user = userEvent.setup()
    await issue()
    renderUpload(TOKEN)

    const picker = await screen.findByLabelText(/Discharge summary/i)
    await user.upload(picker, aFile())

    // Nothing is sent yet: `<ConfirmGate>` stands between the choice and the write.
    expect(await screen.findByRole('button', { name: 'Yes, send it' })).toBeInTheDocument()
    expect(await uploadDesk(repositories).presentDocTypes(CLAIM)).not.toContain('discharge_summary')

    await user.click(screen.getByRole('button', { name: 'Yes, send it' }))

    expect(await screen.findByText('discharge.pdf')).toBeInTheDocument()
    expect(await uploadDesk(repositories).presentDocTypes(CLAIM)).toContain('discharge_summary')
  })

  it('writes nothing when the gate is cancelled', async () => {
    const user = userEvent.setup()
    await issue()
    renderUpload(TOKEN)

    const picker = await screen.findByLabelText(/Discharge summary/i)
    await user.upload(picker, aFile())
    await user.click(await screen.findByRole('button', { name: /Go back/ }))

    expect(await uploadDesk(repositories).presentDocTypes(CLAIM)).not.toContain('discharge_summary')
  })
})

describe('a link that is not open', () => {
  it('says so without saying which kind of closed it is', async () => {
    renderUpload('q'.repeat(32))

    expect(await screen.findByText('This link is not open')).toBeInTheDocument()
    // "Expired" would tell a guesser their token exists. It never appears.
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/withdrawn/i)).not.toBeInTheDocument()
  })

  it('renders a withdrawn link exactly as it renders an unknown one', async () => {
    await issue()
    await uploadDesk(repositories).revoke(TOKEN, NOW)

    renderUpload(TOKEN)
    expect(await screen.findByText('This link is not open')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument()
  })

  it('offers no picker at all, so there is nothing to send through a closed door', async () => {
    renderUpload('q'.repeat(32))

    await screen.findByText('This link is not open')
    expect(screen.queryByLabelText(/Discharge summary/i)).not.toBeInTheDocument()
  })
})
