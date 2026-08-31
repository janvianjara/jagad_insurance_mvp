import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { resolveAccount, useSessionStore } from '../../../app/store'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { MockRepositories } from '../../../data/mock'
import { secretLikeSettingKeys } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import IntegrationsScreen from './IntegrationsScreen'
import { forbiddenIn } from './settings-draft'

/**
 * The posture `Mandate` set, transplanted to the outward channels: the platform
 * records that an integration exists and holds no credential of any kind.
 *
 * It is said on screen because a person looking at an integrations page expects
 * a password field and needs to be told, in that place, why there is not one.
 * It is true underneath because the record has nowhere to put a credential, and
 * because a setting key that reads like one is refused three times over — by the
 * screen before Save is reachable, by the repository if a save arrives anyway,
 * and by the fixture schema so a credential cannot enter as data either.
 */

let repositories: MockRepositories

const SMTP = 'itg-smtp-office'
/** The key an admin sees, which is not the row id. */
const SMTP_KEY = 'smtp.office'

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
          <IntegrationsScreen />
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

describe('the posture, said where a password field would be', () => {
  it('stands above the list', async () => {
    renderScreen('/config/integrations')

    const notes = await screen.findAllByText('This platform stores no credentials')
    expect(notes.length).toBeGreaterThan(0)
    expect(notes[0].closest('[role="note"]')).toHaveTextContent(
      /Those live in the provider’s own console/,
    )
  })

  it('is repeated on the record itself, naming the provider', async () => {
    renderScreen(`/config/integrations?record=${SMTP}`)

    const drawer = await screen.findByRole('dialog', { name: 'Outbound email' })
    expect(within(drawer).getByText('This platform stores no credentials')).toBeInTheDocument()
    expect(drawer).toHaveTextContent(/Amazon SES/)
  })
})

describe('a setting that reads like a credential', () => {
  it('is refused by the screen, with Save left dead', async () => {
    const user = userEvent.setup()
    renderScreen(`/config/integrations?record=${SMTP}`)

    const drawer = await screen.findByRole('dialog', { name: 'Outbound email' })
    await user.click(within(drawer).getByRole('button', { name: 'Add a setting' }))

    const names = within(drawer).getAllByLabelText('Setting')
    const values = within(drawer).getAllByLabelText('Value')
    await user.type(names[names.length - 1], 'apiKey')
    await user.type(values[values.length - 1], 'sk-live-not-going-in-here')

    const refusal = await within(drawer).findByRole('alert')
    expect(refusal).toHaveTextContent(/cannot be stored here: apiKey/)
    expect(refusal).toHaveTextContent(/stays in the provider’s own console/)
    expect(within(drawer).getByRole('button', { name: 'Save integration' })).toBeDisabled()

    // And the record is untouched.
    const held = await repositories.integrations.get(SMTP)
    expect(secretLikeSettingKeys(held?.settings ?? {})).toEqual([])
  })

  it('is refused by the repository too, so the rule is not the screen’s alone', async () => {
    const outcome = await repositories.integrations.save(SMTP, {
      actorId: 'usr-vivek-jagad',
      settings: { host: 'smtp.example', smtpPassword: 'hunter2' },
      updatedBy: 'usr-vivek-jagad',
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toContain('smtpPassword')
    expect(outcome.reason).toContain('provider')

    const held = await repositories.integrations.get(SMTP)
    expect(held?.settings.host).toBe('email-smtp.ap-south-1.amazonaws.com')
  })

  it('catches the same names the repository catches', () => {
    const rows = [
      { id: '1', name: 'senderId', value: 'JAGADI', kind: 'string' as const },
      { id: '2', name: 'apiToken', value: 'x', kind: 'string' as const },
      { id: '3', name: 'clientSecret', value: 'y', kind: 'string' as const },
    ]
    expect(forbiddenIn(rows)).toEqual(['apiToken', 'clientSecret'])
  })
})

describe('what is actually stored', () => {
  it('holds no credential on any configured integration', async () => {
    const page = await repositories.integrations.list({ page: 1, pageSize: 100 })
    for (const integration of page.rows) {
      expect(secretLikeSettingKeys(integration.settings)).toEqual([])
    }
  })

  it('saves a non-secret setting, keeping the type it had', async () => {
    const user = userEvent.setup()
    renderScreen(`/config/integrations?record=${SMTP}`)

    const drawer = await screen.findByRole('dialog', { name: 'Outbound email' })
    const values = within(drawer).getAllByLabelText('Value')
    const port = values.find((input) => (input as HTMLInputElement).value === '587')
    expect(port).toBeDefined()

    await user.clear(port!)
    await user.type(port!, '2587')
    await user.click(within(drawer).getByRole('button', { name: 'Save integration' }))

    const gate = await screen.findByRole('dialog', { name: `Save ${SMTP_KEY}` })
    await user.click(within(gate).getByRole('button', { name: 'Save the settings' }))

    await waitFor(async () => {
      const held = await repositories.integrations.get(SMTP)
      // A number stayed a number: a port that came back as "2587" would be a
      // change nobody made, and the fixture schema would refuse it.
      expect(held?.settings.port).toBe(2587)
    })
  })
})

describe('switching an outward channel', () => {
  it('is gated, and Cancel writes nothing', async () => {
    const user = userEvent.setup()
    renderScreen(`/config/integrations?record=${SMTP}`)

    const drawer = await screen.findByRole('dialog', { name: 'Outbound email' })
    await user.click(within(drawer).getByRole('button', { name: 'Switch off' }))

    const gate = await screen.findByRole('dialog', { name: `Switch off ${SMTP_KEY}` })
    expect(gate).toHaveTextContent(/stops everything that goes out through it/)

    await user.click(within(gate).getByRole('button', { name: 'Cancel' }))
    expect((await repositories.integrations.get(SMTP))?.enabled).toBe(true)

    await user.click(within(drawer).getByRole('button', { name: 'Switch off' }))
    const again = await screen.findByRole('dialog', { name: `Switch off ${SMTP_KEY}` })
    await user.click(within(again).getByRole('button', { name: 'Switch off' }))

    await waitFor(async () => {
      expect((await repositories.integrations.get(SMTP))?.enabled).toBe(false)
    })
  })
})

describe('recording a check', () => {
  it('writes down what the provider said, and switches nothing on or off', async () => {
    const user = userEvent.setup()
    renderScreen(`/config/integrations?record=${SMTP}`)

    const drawer = await screen.findByRole('dialog', { name: 'Outbound email' })
    await user.selectOptions(within(drawer).getByLabelText('What happened'), 'ok')
    await user.type(
      within(drawer).getByLabelText('The provider’s own words'),
      'Sending domain verified.',
    )
    await user.click(within(drawer).getByRole('button', { name: 'Record the check' }))

    const gate = await screen.findByRole('dialog', { name: `Record a check on ${SMTP_KEY}` })
    await user.click(within(gate).getByRole('button', { name: 'Record the check' }))

    await waitFor(async () => {
      const held = await repositories.integrations.get(SMTP)
      expect(held?.lastCheckOutcome).toBe('ok')
      expect(held?.lastCheckNote).toBe('Sending domain verified.')
      // A record, not a test: nothing turned itself on or off.
      expect(held?.enabled).toBe(true)
    })
  })
})
