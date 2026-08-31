import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { resolveAccount, useSessionStore } from '../../../app/store'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { MockRepositories } from '../../../data/mock'
import { ToastProvider } from '../../../ui/surface'
import TemplatesScreen from './TemplatesScreen'

/**
 * Flow 6's promise, and the rule that makes it safe to keep.
 *
 * "The whole system is configuration, not code" is only worth anything if an
 * admin can change the words a customer receives without a deployment. It is
 * only *safe* because an edit publishes the next version rather than rewriting
 * the wording that already went out: last Monday's message still says what it
 * said, and the log that quotes it still agrees with itself.
 *
 * The key is the other half. Recipes name it to fire a template and every
 * message log carries it, so it is shown and never editable — renaming it would
 * orphan both, silently.
 */

let repositories: MockRepositories

const REMINDER = 'tpl-renewal-reminder'
const EMAIL_NOTICE = 'tpl-renewal-notice'
const NEW_WORDING = 'Policy {{systemNo}} expires on {{expiryDate}}. Please call us to renew.'

async function signIn(userId: string) {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

function renderScreen(path: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <TemplatesScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

beforeEach(async () => {
  useSessionStore.getState().reset()
  repositories = createMockRepositories({ latency: NO_LATENCY })
  await signIn('usr-vivek-jagad')
})

describe('saving a template', () => {
  it('publishes the next version, and says so before it writes', async () => {
    const user = userEvent.setup()
    const live = (await repositories.templates.get(REMINDER))?.version ?? 0
    renderScreen(`/config/templates?record=${REMINDER}`)

    const drawer = await screen.findByRole('dialog', { name: 'Renewal reminder' })
    const body = within(drawer).getByLabelText('Body')

    await user.clear(body)
    await user.type(body, NEW_WORDING)
    await user.click(within(drawer).getByRole('button', { name: 'Save template' }))

    const gate = await screen.findByRole('dialog', {
      name: `Publish renewal.reminder as v${live + 1}`,
    })
    expect(gate).toHaveTextContent(`v${live}`)
    expect(gate).toHaveTextContent(`v${live + 1}`)
    expect(gate).toHaveTextContent(/Messages already sent keep the wording they were sent with/)

    await user.click(within(gate).getByRole('button', { name: 'Publish the new version' }))

    await waitFor(async () => {
      const saved = await repositories.templates.get(REMINDER)
      expect(saved?.version).toBe(live + 1)
      expect(saved?.body).toContain('Please call us to renew.')
      // The key is what recipes and logs point at. It does not move.
      expect(saved?.key).toBe('renewal.reminder')
    })
  })

  it('writes nothing on Cancel', async () => {
    const user = userEvent.setup()
    const live = (await repositories.templates.get(REMINDER))?.version ?? 0
    renderScreen(`/config/templates?record=${REMINDER}`)

    const drawer = await screen.findByRole('dialog', { name: 'Renewal reminder' })
    await user.type(within(drawer).getByLabelText('Body'), ' Please call us.')
    await user.click(within(drawer).getByRole('button', { name: 'Save template' }))

    const gate = await screen.findByRole('dialog', {
      name: `Publish renewal.reminder as v${live + 1}`,
    })
    await user.click(within(gate).getByRole('button', { name: 'Cancel' }))

    const held = await repositories.templates.get(REMINDER)
    expect(held?.version).toBe(live)
    expect(held?.body).not.toContain('Please call us.')
  })

  it('offers nothing to confirm while the wording is untouched', async () => {
    renderScreen(`/config/templates?record=${REMINDER}`)

    const drawer = await screen.findByRole('dialog', { name: 'Renewal reminder' })
    expect(within(drawer).getByRole('button', { name: 'Save template' })).toBeDisabled()
  })
})

describe('the subject line', () => {
  it('exists on email and is absent on WhatsApp, rather than disabled', async () => {
    const user = userEvent.setup()
    renderScreen(`/config/templates?record=${EMAIL_NOTICE}`)

    const drawer = await screen.findByRole('dialog', { name: 'Renewal notice from the insurer' })
    expect(within(drawer).getByLabelText('Subject')).toHaveValue(
      'Renewal notice for policy {{policyNo}}',
    )

    await user.selectOptions(within(drawer).getByLabelText('Channel'), 'whatsapp')
    expect(within(drawer).queryByLabelText('Subject')).toBeNull()
  })

  it('drops the subject it was holding when the channel stops carrying one', async () => {
    const user = userEvent.setup()
    renderScreen(`/config/templates?record=${EMAIL_NOTICE}`)

    const drawer = await screen.findByRole('dialog', { name: 'Renewal notice from the insurer' })
    await user.selectOptions(within(drawer).getByLabelText('Channel'), 'sms')
    await user.click(within(drawer).getByRole('button', { name: 'Save template' }))

    const gate = await screen.findByRole('dialog', { name: 'Publish renewal.notice as v2' })
    expect(gate).toHaveTextContent(/this channel carries no subject/)

    await user.click(within(gate).getByRole('button', { name: 'Publish the new version' }))

    await waitFor(async () => {
      const saved = await repositories.templates.get(EMAIL_NOTICE)
      expect(saved?.channel).toBe('sms')
      expect(saved?.subject).toBeNull()
    })
  })
})

describe('the templates queue', () => {
  it('shows which version is live and what fires each template', async () => {
    renderScreen('/config/templates')

    const grid = await screen.findByRole('grid', { name: 'Message templates' })
    // findByRole resolves as soon as the TABLE exists, which is while it is still
    // aria-busy and empty - so the rows have to be awaited separately or the
    // synchronous query below runs against nothing.
    expect((await within(grid).findAllByText(/^v\d+$/)).length).toBeGreaterThan(0)
    // The insurer notice is released row by row from a batch, so nothing fires it.
    expect(await within(grid).findByText('sent by hand')).toBeInTheDocument()
  })
})
