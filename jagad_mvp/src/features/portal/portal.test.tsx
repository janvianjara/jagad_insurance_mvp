import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { MASK_CHAR } from '../../ui/type'
import { portalDesk } from './data/portal-desk'
import { NUMBERS, WHO, freshRepositories, portalPath, renderPortal } from './test-harness'

/**
 * The customer portal — plan §4's five `/portal` rows, §11.1, decision D-I,
 * user story 4.1 and §12's grievance channel.
 *
 * The promises worth a test are the ones that fail quietly:
 *
 *   1. the portal opens against ONE customer, and every page reads that
 *      customer's records through a repository rather than filtering a list;
 *   2. an identity number is never rendered in full — not the PAN this customer
 *      actually has on record, and never more than four digits of an Aadhaar;
 *   3. a claim's state reaches the customer in the customer's words. No machine
 *      state and no operator vocabulary appears on the page;
 *   4. raising a claim is gated. Cancel writes nothing, and a claim on a policy
 *      that is not in force is refused by §9's machine with its own sentence,
 *      not by a disabled button;
 *   5. §12's grievance channel is reachable from every page and gives back a
 *      reference.
 *
 * Nothing here imports a fixture. Every expectation is read back through the
 * same repository the screens read.
 */

let repositories: MockRepositories

beforeEach(() => {
  repositories = freshRepositories()
})

describe('the front door', () => {
  it('asks who is looking before it shows anybody anything', async () => {
    renderPortal(repositories, '/portal')

    expect(await screen.findByRole('heading', { name: /your insurance, in one place/i })).toBeInTheDocument()
    // The demo identity is named as one rather than dressed up as a login.
    expect(screen.getByText(/no customer sign-in yet/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('opens that person’s portal when they are chosen', async () => {
    const user = userEvent.setup()
    renderPortal(repositories, '/portal')

    const choice = await screen.findByRole('button', { name: /Rakesh Patel/ })
    await user.click(choice)

    expect(await screen.findByRole('heading', { name: /hello, rakesh/i })).toBeInTheDocument()
    expect(screen.getByText(/this identity was chosen, not signed in to/i)).toBeInTheDocument()
  })
})

describe('the overview', () => {
  it('answers "am I covered, and does anything need me" from the repositories', async () => {
    renderPortal(repositories, portalPath('/portal', WHO.rakesh))

    expect(await screen.findByRole('heading', { name: /hello, rakesh/i })).toBeInTheDocument()

    const glance = screen.getByRole('region', { name: /your cover at a glance/i })
    const held = await repositories.policies.forCustomer(WHO.rakesh)
    const onFile = within(glance).getByText(/policies on file/i).parentElement
    expect(onFile?.textContent).toContain(String(held.length))

    // One prominent next thing, and it is one of the things actually waiting.
    const next = screen.getByRole('region', { name: /the next thing to do/i })
    expect(within(next).getByText(/next thing to do/i)).toBeInTheDocument()
  })

  it('names what renews next off the policy that expires first', async () => {
    renderPortal(repositories, portalPath('/portal', WHO.rakesh))

    const renews = await screen.findByRole('region', { name: /what renews next/i })
    const held = await repositories.policies.forCustomer(WHO.rakesh)
    const soonest = [...held]
      .filter((policy) => policy.expiryDate !== null && policy.status === 'issued')
      .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))[0]

    expect(soonest).toBeDefined()
    expect(within(renews).getByText(soonest?.systemNo ?? 'missing')).toBeInTheDocument()
  })
})

describe('my policies', () => {
  it('renders a card per policy with both numbers, and opens the detail in place', async () => {
    const user = userEvent.setup()
    renderPortal(repositories, portalPath('/portal/policies', WHO.rakesh))

    expect(await screen.findByRole('heading', { name: /my policies/i })).toBeInTheDocument()

    const held = await repositories.policies.forCustomer(WHO.rakesh)
    for (const policy of held) {
      expect(screen.getByText(policy.systemNo)).toBeInTheDocument()
    }

    const openers = screen.getAllByRole('button', { name: /see the details/i })
    expect(openers[0]?.getAttribute('aria-expanded')).toBe('false')
    await user.click(openers[0] as HTMLElement)

    expect(await screen.findByText(/who looks after this/i)).toBeInTheDocument()
    expect(screen.getByText(/what is covered/i)).toBeInTheDocument()
  })
})

describe('my documents', () => {
  it('shows the customer’s own papers and never a full identity number', async () => {
    renderPortal(repositories, portalPath('/portal/documents', WHO.rakesh))

    expect(await screen.findByRole('heading', { name: /my documents/i })).toBeInTheDocument()

    const customer = await repositories.customers.get(WHO.rakesh)
    expect(customer?.panNumber).toBeTruthy()

    const page = document.body.textContent ?? ''
    // The PAN this customer actually holds must not be readable in full.
    expect(page).not.toContain(customer?.panNumber ?? 'no-pan-on-record')
    expect(page).toContain(MASK_CHAR)
    // Four is the ceiling, and the tail is what is shown.
    expect(page).toContain(`${MASK_CHAR}${MASK_CHAR}${MASK_CHAR}${MASK_CHAR} ${customer?.aadhaarLast4}`)
  })

  it('says plainly when there is no file to download rather than offering a dead button', async () => {
    renderPortal(repositories, portalPath('/portal/documents', WHO.rakesh))

    expect(await screen.findByRole('heading', { name: /my documents/i })).toBeInTheDocument()
    expect(screen.getAllByText(/does not hold a copy you can download/i).length).toBeGreaterThan(0)
  })
})

describe('my claims', () => {
  it('speaks the customer’s language, never the machine’s', async () => {
    renderPortal(repositories, portalPath('/portal/claims', WHO.rakesh))

    expect(await screen.findByRole('heading', { name: /my claims/i })).toBeInTheDocument()

    const held = await repositories.claims.forCustomer(WHO.rakesh)
    expect(held.length).toBeGreaterThan(0)
    for (const claim of held) {
      expect(screen.getByText(claim.systemNo)).toBeInTheDocument()
    }

    const page = (document.body.textContent ?? '').toLowerCase()
    for (const jargon of [
      'upload_link_sent',
      'checklist_raised',
      'picked_up',
      'picked up',
      'docs collected',
      'filed with insurer',
      'intimated',
    ]) {
      expect(page, `${jargon} is operator vocabulary`).not.toContain(jargon)
    }
  })

  it('draws the progress spine and marks the step that is waiting on the customer', async () => {
    renderPortal(repositories, portalPath('/portal/claims', WHO.rakesh))

    const spines = await screen.findAllByRole('list', { name: /progress/i })
    expect(spines.length).toBeGreaterThan(0)
    expect(screen.getAllByText(/you are here/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/needs you/i).length).toBeGreaterThan(0)
  })
})

describe('raising a claim', () => {
  it('writes nothing when the confirm gate is cancelled', async () => {
    const user = userEvent.setup()
    // Read through the same desk the screen writes through: a claim raised in
    // this session lives beside the seeded ones, and `repositories.claims` alone
    // would show neither the write nor its absence.
    const desk = portalDesk(repositories)
    const before = await desk.claims(WHO.rakesh)
    renderPortal(repositories, portalPath('/portal/claims/new', WHO.rakesh))

    await fillTheForm(user, /POL-/)
    await user.click(screen.getByRole('button', { name: /review and send/i }))

    expect(await screen.findByText(/raise a claim on/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /go back and change something/i }))

    const after = await desk.claims(WHO.rakesh)
    expect(after.length).toBe(before.length)
    expect(screen.queryByText(/quote this number when you call us/i)).not.toBeInTheDocument()
  })

  it('raises a real claim on confirm and hands back a number to quote', async () => {
    const user = userEvent.setup()
    const desk = portalDesk(repositories)
    const before = await desk.claims(WHO.rakesh)
    renderPortal(repositories, portalPath('/portal/claims/new', WHO.rakesh))

    await fillTheForm(user, /POL-/)
    await user.click(screen.getByRole('button', { name: /review and send/i }))
    await user.click(screen.getByRole('button', { name: /yes, raise it/i }))

    expect(await screen.findByText(/quote this number when you call us/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /your claim is registered/i })).toBeInTheDocument()

    // The record is real: read back through the repository, scoped to them.
    const after = await desk.claims(WHO.rakesh)
    expect(after.length).toBe(before.length + 1)
    const raised = after.find((card) => !before.some((old) => old.claim.id === card.claim.id))
    expect(raised?.claim.customerId).toBe(WHO.rakesh)
    expect(screen.getByText(raised?.claim.systemNo ?? 'no claim was raised')).toBeInTheDocument()
    // The customer's own account of the incident is kept beside the claim.
    expect(raised?.told?.description).toContain('Admitted to hospital')
  })

  it('records an attached document against the claim, by name and nothing else', async () => {
    const user = userEvent.setup()
    const desk = portalDesk(repositories)
    renderPortal(repositories, portalPath('/portal/claims/new', WHO.rakesh))

    await fillTheForm(user, /POL-/)
    await user.upload(
      screen.getByLabelText(/hospital discharge summary/i),
      new File(['x'], 'discharge.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /review and send/i }))
    await user.click(screen.getByRole('button', { name: /yes, raise it/i }))

    expect(await screen.findByText(/we have recorded discharge\.pdf/i)).toBeInTheDocument()

    // Presence, never content: the document is on the claim and carries no text.
    const cards = await desk.claims(WHO.rakesh)
    const raised = cards.find((card) => card.told !== null)
    expect(raised).toBeDefined()
    const filed = await desk.documents(WHO.rakesh)
    const attached = filed.find(
      (entry) =>
        entry.record.subjectId === raised?.claim.id && entry.record.fileName === 'discharge.pdf',
    )
    expect(attached?.record.isPresent).toBe(true)
    expect(attached?.record.extractedText).toBeNull()
  })

  it('refuses in the machine’s words when the cover is not in force', async () => {
    const user = userEvent.setup()
    renderPortal(repositories, portalPath('/portal/claims/new', WHO.falguni))

    // Falguni holds a lapsed policy, and it IS offered: canvas 4.2 is precisely
    // the case where somebody tries and has to be told why not.
    await fillTheForm(user, new RegExp(`${NUMBERS.falguniLapsedPolicy}`))
    await user.click(screen.getByRole('button', { name: /review and send/i }))
    await user.click(screen.getByRole('button', { name: /yes, raise it/i }))

    expect(
      await screen.findByRole('heading', { name: /we could not register this claim/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/nothing has been sent to the insurer/i)).toBeInTheDocument()
  })
})

describe('the grievance channel', () => {
  it('is reachable from a portal page and gives back a reference', async () => {
    const user = userEvent.setup()
    renderPortal(repositories, portalPath('/portal', WHO.rakesh))

    await user.click(await screen.findByRole('button', { name: /raise a grievance/i }))
    await user.type(
      screen.getByRole('textbox', { name: /what happened/i }),
      'Nobody rang me back about my renewal.',
    )
    await user.click(screen.getByRole('button', { name: /review and send/i }))
    await user.click(screen.getByRole('button', { name: /yes, send it/i }))

    expect(await screen.findByText(/^GRV-\d{4}$/)).toBeInTheDocument()
    expect(screen.getByText(/data protection board/i)).toBeInTheDocument()
  })
})

/** Fills the four questions on `/portal/claims/new`, choosing a matching policy. */
async function fillTheForm(
  user: ReturnType<typeof userEvent.setup>,
  policyPattern: RegExp,
): Promise<void> {
  const select = (await screen.findByLabelText(/which cover is this about/i)) as HTMLSelectElement
  const option = [...select.options].find((candidate) => policyPattern.test(candidate.text))
  if (!option) throw new Error(`No policy option matched ${policyPattern}`)
  await user.selectOptions(select, option.value)

  const when = screen.getByLabelText(/when did it happen/i)
  await user.type(when, '2026-08-20')

  await user.type(
    screen.getByRole('textbox', { name: /what happened/i }),
    'Admitted to hospital for two nights.',
  )
}
