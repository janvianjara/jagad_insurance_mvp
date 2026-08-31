import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import { useComplianceStore } from './compliance-store'
import ComplianceScreen from './ComplianceScreen'

/**
 * The register at `/config/compliance` — the page written for the client to
 * read, answering "did anybody ask to be forgotten, and what were they told".
 */

let repositories: Repositories

function renderRegister() {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/config/compliance?tab=erasure']}>
          <ComplianceScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useComplianceStore.getState().reset()
  useConfigStore.getState().reset()
})

describe('the erasure register', () => {
  it('teaches where a request comes from when none has been raised', async () => {
    renderRegister()
    expect(await screen.findByText('Nobody has asked to be forgotten yet')).toBeInTheDocument()
  })

  it('carries the decision, the obligation and what was suppressed instead', async () => {
    const raised = await repositories.eraseRequests.request({
      actorId: 'usr-priya-desai',
      subjectEntity: 'Customer',
      subjectId: 'cus-rakesh-patel',
      requestedBy: 'data_principal',
    })
    expect(raised.ok).toBe(true)

    renderRegister()

    expect(await screen.findByText('Retained by legal obligation')).toBeInTheDocument()
    expect(screen.getByText(/A live insurance contract is held in this name/)).toBeInTheDocument()
    expect(screen.getByText(/Marketing use and Automated reminders/)).toBeInTheDocument()
    // Named by the person it is about, not by an id nobody can read.
    expect(screen.getByRole('heading', { name: 'Rakesh Patel' })).toBeInTheDocument()
  })
})
