import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { customerDesk } from '../customers/data/customer-desk'
import {
  RAKESH,
  WALKTHROUGH_NOW,
  WHO,
  freshRepositories,
  renderCustomers,
  signIn,
} from '../customers/test-harness'

/**
 * `/consent/:token` — plan §11.1, §9's "tokenised, expiring, login-free".
 *
 * The expiry is the half that usually gets built as an error page, and §11.1 is
 * clear that it must not be: a customer standing in a hospital corridor with a
 * dead link needs to be told what to do, not shown a failure. So an expired
 * token has a page of its own, with no form on it and no stack trace in it.
 */

const DAY_MS = 86_400_000
const AFTER_EXPIRY = new Date(WALKTHROUGH_NOW.getTime() + 30 * DAY_MS)

let repositories: MockRepositories
let token: string

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
  const consent = await repositories.customers.consent(RAKESH)
  if (!consent) throw new Error('Rakesh has no consent link.')
  token = consent.token
})

describe('the tokenised consent link', () => {
  it('opens the form while the link is live, and says when it closes', async () => {
    renderCustomers(repositories, `/consent/${token}`)

    expect(await screen.findByRole('heading', { name: 'Namaste Rakesh' })).toBeInTheDocument()
    expect(screen.getByText(/it closes on/i)).toBeInTheDocument()

    // The configured KYC schema, rendered: the stages are the stages an admin
    // published, not a form this page invented.
    const stages = screen.getByRole('list', { name: 'Stages' })
    expect(stages).toHaveTextContent('Identity')
    expect(stages).toHaveTextContent('Consent')
  })

  it('gives an expired token its own page rather than an error', async () => {
    renderCustomers(repositories, `/consent/${token}`, AFTER_EXPIRY)

    expect(await screen.findByText('This link has expired')).toBeInTheDocument()
    expect(
      screen.getByText(/Reply to the message it came in and Jagad Insurance will send you a fresh one/),
    ).toBeInTheDocument()

    // A page, not a failure: nothing is announced as an error.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not recognise a token that matches nothing, and says nothing about anybody', async () => {
    renderCustomers(repositories, '/consent/cns-not-a-real-token-at-all')

    expect(await screen.findByText('This link is not one we recognise')).toBeInTheDocument()
    expect(screen.queryByText(/Rakesh/)).toBeNull()
  })

  it('thanks a customer who has already used their link instead of offering it twice', async () => {
    // Jayesh's link came back filled three hundred days ago.
    const consent = await repositories.customers.consent('cus-jayesh-kapadia')
    if (!consent) throw new Error('Jayesh has no consent record.')

    renderCustomers(repositories, `/consent/${consent.token}`)

    expect(await screen.findByText('Thank you, Jayesh')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Stages' })).toBeNull()

    // His link's window closed long ago, and saying so would be true and
    // useless: he already filled it in.
    expect(screen.queryByText('This link has expired')).toBeNull()
  })

  it('refuses a submission made after the window closed, and records the lapse', async () => {
    const desk = customerDesk(repositories)

    const outcome = await desk.submitConsent(
      token,
      { schemaId: 'frm-kyc-capture-v1', schemaVersion: 1, values: {}, supplied: [] },
      { now: AFTER_EXPIRY, kycCommand: () => { throw new Error('KYC must not be attempted on an expired link.') } },
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('unreachable')
    expect(outcome.expired).toBe(true)

    // Through the machine, so the back office sees a state rather than a link
    // that quietly stopped working.
    const customer = await repositories.customers.get(RAKESH)
    expect(customer?.consentState).toBe('expired')
    expect(repositories.store.events().map((event) => event.name)).toContain('consent.expired')
  })

  it('carries no session: nothing on the page assumes a signed-in user', async () => {
    // Rendered with no account hydrated at all. A page that read the session
    // store would render nothing, or throw.
    const anonymous = freshRepositories()
    const consent = await anonymous.customers.consent(RAKESH)
    if (!consent) throw new Error('Rakesh has no consent link.')

    renderCustomers(anonymous, `/consent/${consent.token}`)

    expect(await screen.findByRole('heading', { name: 'Namaste Rakesh' })).toBeInTheDocument()
    // No shell: no navigation, no rail, no account switcher — the page is one
    // `<main>` and nothing else.
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})
