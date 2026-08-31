import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { landingFor } from '../../app/navigation'
import { resolveAccount, useSessionStore } from '../../app/store'
import type { MockRepositories } from '../../data/mock'
import type { StaffUser } from '../../data/repo'
import { useConfigStore } from '../config/shared/config-store'
import { TWO_FACTOR_LEVELS } from '../config/shared/config-types'
import { demoAccounts, signInFactorFor } from './auth-desk'
import { findAccount, refusalFor, signIn } from './credentials'
import { MAX_ATTEMPTS, verify } from './two-factor'
import { WHO, freshAuth, renderAuth, withBrokenStaffRead } from './test-harness'

/**
 * `/login` and `/login/2fa` — plan §4's entry routes, §11.1, FR-18.
 *
 * Four things can break independently here, and each has its own test:
 *
 *   - a role the configured two-factor matrix asks nothing of signs straight in,
 *     and lands exactly where `landingFor` says that role lands;
 *   - a role the matrix asks a code of does NOT get a session until the code is
 *     accepted — the challenge is a gate, not a screen between two open doors;
 *   - a refused code costs an attempt and the challenge locks when they run out;
 *   - an identifier nobody holds is refused in its own words, and so is an
 *     account somebody has switched off.
 *
 * Nothing here imports a fixture. The expected landing, the expected accounts
 * and the expected policy are all read back through the same repository and the
 * same helpers the screens read, so a test cannot agree with a stale copy.
 */

let repositories: MockRepositories

beforeEach(() => {
  repositories = freshAuth()
})

async function staffById(id: string): Promise<StaffUser> {
  const staff = await repositories.config.users()
  const person = staff.find((entry) => entry.id === id)
  if (!person) throw new Error(`The fixtures no longer hold ${id}.`)
  return person
}

/** Where the product says this account lands, asked of the app's own helper. */
async function landingOf(id: string): Promise<string> {
  return landingFor(resolveAccount(await staffById(id)).user)
}

/** Waits for the account list, because the submit button is disabled until it lands. */
async function readyForm(user: ReturnType<typeof userEvent.setup>, identifier: string) {
  await screen.findByRole('list')
  await user.type(screen.getByLabelText(/email or mobile/i), identifier)
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>, identifier: string) {
  await readyForm(user, identifier)
  await user.type(screen.getByLabelText(/^password/i), 'anything')
}

async function signInAs(id: string) {
  const user = userEvent.setup()
  renderAuth(repositories)
  const person = await staffById(id)
  await fillCredentials(user, person.email)
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
  return { user, person }
}

describe('the sign-in screen', () => {
  it('offers the active staff accounts the repository holds, and nothing else', async () => {
    const staff = await repositories.config.users()
    const active = staff.filter((person) => person.active)

    renderAuth(repositories)

    const list = await screen.findByRole('list')
    expect(within(list).getAllByRole('button')).toHaveLength(active.length)
    for (const person of active) {
      expect(within(list).getByRole('button', { name: new RegExp(person.name) })).toBeInTheDocument()
    }
  })

  it('fills the identifier from the account a person picks', async () => {
    const user = userEvent.setup()
    renderAuth(repositories)
    const kiran = await staffById(WHO.kiran)

    await user.click(await screen.findByRole('button', { name: new RegExp(kiran.name) }))

    expect(screen.getByLabelText(/email or mobile/i)).toHaveValue(kiran.email)
  })

  it('says where each role lands, in the words the navigation model uses', async () => {
    renderAuth(repositories)
    const meera = await staffById(WHO.meera)

    const row = await screen.findByRole('button', { name: new RegExp(meera.name) })
    expect(row).toHaveTextContent(`Lands on ${await landingOf(WHO.meera)}`)
  })

  it('signs a role the policy asks nothing of straight in, and hydrates the session', async () => {
    await signInAs(WHO.kiran)

    const landing = await landingOf(WHO.kiran)
    expect(await screen.findByText(`Landed on ${landing}`)).toBeInTheDocument()

    const session = useSessionStore.getState()
    expect(session.ready).toBe(true)
    expect(session.user?.id).toBe(WHO.kiran)
    // The whole active book is in the session, not only the person who signed
    // in: the rail footer's switcher is that same list.
    const active = (await repositories.config.users()).filter((person) => person.active)
    expect(session.accounts).toHaveLength(active.length)
  })

  it('refuses an identifier nobody holds, in its own words, with the focus on the message', async () => {
    const user = userEvent.setup()
    renderAuth(repositories)

    await fillCredentials(user, 'nobody@jagadinsurance.example')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/No Jagad Insurance account uses nobody@jagadinsurance.example/i)
    await waitFor(() => expect(alert).toHaveFocus())
    expect(useSessionStore.getState().user).toBeNull()
  })

  it('asks for a password before it asks the book anything', async () => {
    const user = userEvent.setup()
    renderAuth(repositories)
    const kiran = await staffById(WHO.kiran)

    await readyForm(user, kiran.email)
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a password/i)
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('aria-invalid', 'true')
    expect(useSessionStore.getState().user).toBeNull()
  })

  it('renders the error state, not an empty list, when the accounts cannot be read', async () => {
    renderAuth(withBrokenStaffRead(repositories, 'The configuration service is unreachable.'))

    expect(await screen.findByText('The staff accounts could not be read')).toBeInTheDocument()
    expect(screen.getByText('The configuration service is unreachable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('the two-factor challenge', () => {
  it('is where a template the matrix requires a code of goes, and no session is issued on the way', async () => {
    await signInAs(WHO.vivek)

    expect(await screen.findByRole('heading', { name: /enter your code/i })).toBeInTheDocument()
    expect(useSessionStore.getState().user).toBeNull()
    expect(useSessionStore.getState().ready).toBe(false)
  })

  it('states whose sign-in it is and what the configuration asks of their template', async () => {
    const { person } = await signInAs(WHO.vivek)
    const factor = signInFactorFor(person.templateKey)

    expect(await screen.findByText(person.name)).toBeInTheDocument()
    expect(screen.getByText(person.roleLabel)).toBeInTheDocument()
    // Read off the matrix, not off a literal: change the policy and this changes.
    expect(
      screen.getByText(`Second factor: ${factor.levelLabel} at ${factor.eventLabel.toLowerCase()}`),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        `The ${person.templateKey} template asks for ${factor.factorLabel}. Recorded in Configuration, Users.`,
      ),
    ).toBeInTheDocument()
  })

  it('accepts a six-digit code, hydrates the session and lands where the role lands', async () => {
    const { user } = await signInAs(WHO.vivek)

    const boxes = await screen.findAllByRole('textbox', { name: /digit/i })
    await user.click(boxes[0])
    await user.paste('204815')
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }))

    expect(await screen.findByText(`Landed on ${await landingOf(WHO.vivek)}`)).toBeInTheDocument()
    expect(useSessionStore.getState().user?.id).toBe(WHO.vivek)
  })

  it('refuses a code that is not six digits, counts it, and locks when the attempts run out', async () => {
    const { user } = await signInAs(WHO.vivek)

    const boxes = await screen.findAllByRole('textbox', { name: /digit/i })
    await user.click(boxes[0])
    await user.paste('12')

    const verifyButton = screen.getByRole('button', { name: /verify and sign in/i })
    await user.click(verifyButton)

    expect(await screen.findByText(/that code was not accepted/i)).toBeInTheDocument()
    expect(screen.getByText(/2 attempts left/i)).toBeInTheDocument()
    expect(useSessionStore.getState().user).toBeNull()

    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await user.click(screen.getAllByRole('textbox', { name: /digit/i })[0])
      await user.paste('12')
      await user.click(screen.getByRole('button', { name: /verify and sign in/i }))
    }

    expect(await screen.findByText(/this challenge is locked/i)).toBeInTheDocument()
    expect(screen.getAllByRole('textbox', { name: /digit/i })[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: /verify and sign in/i })).toBeDisabled()
    expect(useSessionStore.getState().user).toBeNull()
  })

  it('is honest that nothing is sent when a new code is asked for', async () => {
    const { user } = await signInAs(WHO.vivek)

    await user.click(await screen.findByRole('button', { name: /send a new code/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/nothing was sent/i)
  })

  it('says so, rather than verifying nobody, when it is opened without a sign-in behind it', async () => {
    renderAuth(repositories, '/login/2fa')

    expect(await screen.findByText('No sign-in is waiting for a code')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /digit/i })).not.toBeInTheDocument()
  })
})

describe('the configured policy, rather than a branch in a component', () => {
  it('is what decides whether a challenge happens at all', async () => {
    const staff = await repositories.config.users()
    demoAccounts(staff) // seeds the shipped defaults into the matrix, once

    expect(signInFactorFor('admin').challenges).toBe(true)
    expect(signInFactorFor('agent').challenges).toBe(false)

    // An admin turning the policy off in /config/users turns the challenge off.
    useConfigStore.getState().setTwoFactor('admin', 'signIn', TWO_FACTOR_LEVELS.off)
    expect(signInFactorFor('admin').challenges).toBe(false)

    await signInAs(WHO.vivek)
    expect(await screen.findByText(`Landed on ${await landingOf(WHO.vivek)}`)).toBeInTheDocument()
  })

  it('leaves a policy an admin has already recorded exactly as it is', async () => {
    useConfigStore.getState().setTwoFactor('agent', 'signIn', TWO_FACTOR_LEVELS.required)

    const staff = await repositories.config.users()
    demoAccounts(staff)

    expect(signInFactorFor('agent').level).toBe(TWO_FACTOR_LEVELS.required)
  })
})

describe('who an identifier names', () => {
  const person: StaffUser = {
    id: 'usr-test-only',
    name: 'Test Only',
    email: 'Test.Only@jagadinsurance.example',
    mobile: '98250 10099',
    templateKey: 'agent',
    teamId: null,
    agentId: null,
    parentAgentId: null,
    categoryIds: [],
    roleLabel: 'Agent, own customers only',
    active: true,
  }

  it('matches an address whatever the capitals, and a mobile however it is typed', () => {
    expect(findAccount([person], 'test.only@jagadinsurance.example')?.id).toBe(person.id)
    expect(findAccount([person], '+91 98250 10099')?.id).toBe(person.id)
    expect(findAccount([person], '09825010099')?.id).toBe(person.id)
    expect(findAccount([person], '9825010098')).toBeUndefined()
  })

  it('refuses a deactivated account by name, not with the message for a stranger', () => {
    const off = { ...person, active: false }

    const refused = signIn([off], off.email)
    expect(refused.kind).toBe('inactive')
    expect(refusalFor(refused, off.email)).toContain('Test Only')
    expect(refusalFor(refused, off.email)).toMatch(/deactivated/i)

    const stranger = signIn([off], 'someone@else.example')
    expect(refusalFor(stranger, 'someone@else.example')).not.toMatch(/deactivated/i)
  })
})

describe('the attempt allowance', () => {
  it('spends one attempt per refusal and refuses everything once it is spent', () => {
    expect(verify('123456', 0).result).toBe('accepted')
    expect(verify('12', 0)).toMatchObject({ result: 'refused', attemptsUsed: 1 })
    expect(verify('12', MAX_ATTEMPTS - 1)).toMatchObject({ result: 'locked', attemptsLeft: 0 })
    expect(verify('123456', MAX_ATTEMPTS).result).toBe('locked')
  })
})
