import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import { buildAuditTrail } from './audit-trail'
import { useComplianceStore } from './compliance-store'
import ComplianceScreen from './ComplianceScreen'

/**
 * The three things `/config/compliance` has to be right about.
 *
 * §9: a closed record past its retention class locks and is never hard-deleted —
 * and the sentence the screen shows is the domain's own, so the two cannot drift.
 * The retention period is configuration, so changing it is gated. And the audit
 * trail carries metadata: no consent token, no document content.
 */

let repositories: Repositories

function renderSection(tab?: string) {
  const url = tab === undefined ? '/config/compliance' : `/config/compliance?tab=${tab}`
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <ComplianceScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

function classCard(key: string): HTMLElement {
  const card = document.querySelector(`li[data-retention-class="${key}"]`)
  expect(card).not.toBeNull()
  return card as HTMLElement
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useComplianceStore.getState().reset()
  useConfigStore.getState().reset()
})

describe('retention classes', () => {
  it('states the lock rule in the domain’s own words', async () => {
    renderSection('retention')
    await screen.findByRole('list', { name: 'Retention classes' })

    const rule = document.querySelector('[data-lock-rule]')
    expect(rule).toHaveTextContent(/Policy records are never deleted/)
    expect(rule).toHaveTextContent(/it stays readable, and nothing can change it/)
  })

  it('carries the years from the class rather than a constant', async () => {
    renderSection('retention')
    await screen.findByRole('list', { name: 'Retention classes' })

    const classes = useComplianceStore.getState().retentionClasses
    expect(classes.length).toBeGreaterThan(0)
    for (const entry of classes) {
      expect(within(classCard(entry.key)).getByLabelText('Years')).toHaveValue(entry.years)
    }
  })

  it('changes the period only through the gate, and never deletes anything', async () => {
    const user = userEvent.setup()
    renderSection('retention')
    await screen.findByRole('list', { name: 'Retention classes' })

    const before = useComplianceStore
      .getState()
      .retentionClasses.find((entry) => entry.key === 'health')!

    const card = classCard('health')
    const years = within(card).getByLabelText('Years')
    await user.clear(years)
    await user.type(years, '12')

    expect(
      useComplianceStore.getState().retentionClasses.find((entry) => entry.key === 'health')?.years,
    ).toBe(before.years)

    await user.click(within(card).getByRole('button', { name: 'Save retention' }))
    const dialog = await screen.findByRole('dialog', { name: /Save the "Health contract records"/ })
    expect(dialog).toHaveTextContent(/Shortening a period never deletes anything/)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(
      useComplianceStore.getState().retentionClasses.find((entry) => entry.key === 'health')?.years,
    ).toBe(before.years)

    await user.click(within(classCard('health')).getByRole('button', { name: 'Save retention' }))
    const confirmed = await screen.findByRole('dialog', {
      name: /Save the "Health contract records"/,
    })
    await user.click(within(confirmed).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(
        useComplianceStore
          .getState()
          .retentionClasses.find((entry) => entry.key === 'health')?.years,
      ).toBe(12)
    })

    // The key is what records store, so it never moves.
    expect(
      useComplianceStore.getState().retentionClasses.some((entry) => entry.key === 'health'),
    ).toBe(true)
  })
})

describe('the audit trail', () => {
  it('carries metadata and never a consent token or a document’s contents', async () => {
    renderSection()
    await screen.findByRole('grid', { name: 'Compliance' })

    const state = useComplianceStore.getState()
    const entries = buildAuditTrail({
      customers: state.customers,
      consents: state.consents,
      documents: state.documents,
      messages: state.messages,
      staffNames: {},
    })

    expect(entries.length).toBeGreaterThan(0)

    const written = entries.map((entry) => `${entry.action} ${entry.subject} ${entry.detail} ${entry.actor}`).join(' ')

    for (const consent of state.consents) {
      expect(written).not.toContain(consent.token)
    }
    for (const record of state.documents) {
      if (record.fileName) expect(written).not.toContain(record.fileName)
      if (record.extractedText) expect(written).not.toContain(record.extractedText)
      for (const field of record.ocrFields) {
        expect(written).not.toContain(field.value)
      }
    }
  })

  it('is read newest first, and every entry points at a record that exists', async () => {
    renderSection()
    await screen.findByRole('grid', { name: 'Compliance' })

    const state = useComplianceStore.getState()
    const entries = buildAuditTrail({
      customers: state.customers,
      consents: state.consents,
      documents: state.documents,
      messages: state.messages,
      staffNames: {},
    })

    const stamps = entries.map((entry) => entry.at)
    expect(stamps).toEqual([...stamps].toSorted((a, b) => b.localeCompare(a)))

    const known = new Set([
      ...state.consents.map((record) => record.id),
      ...state.documents.map((record) => record.id),
      ...state.messages.map((record) => record.id),
    ])
    for (const entry of entries) {
      expect(known.has(entry.id.split(':')[0])).toBe(true)
    }
  })
})

describe('consent', () => {
  it('shows where every link has got to, and hands no token out', async () => {
    renderSection('consent')
    const states = await screen.findByRole('list', { name: 'Consent states' })

    const customers = useComplianceStore.getState().customers
    for (const state of ['not_sent', 'link_issued', 'submitted', 'expired']) {
      const row = states.querySelector(`li[data-consent-state="${state}"]`)
      const count = customers.filter((customer) => customer.consentState === state).length
      expect(row).toHaveTextContent(`${count} customers`)
    }

    for (const record of useComplianceStore.getState().consents) {
      expect(document.body.textContent ?? '').not.toContain(record.token)
    }
  })
})
