import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import composerSource from './QuotationComposerScreen.tsx?raw'
import type { MockRepositories } from '../../data/mock'
import { WHO, freshRepositories, renderQuotations, signIn } from './test-harness'

/**
 * Canvas flow 2 — "Quotation composer -> Deal" — one test per row, plus the
 * premium stop the whole flow turns on.
 *
 * These render the real screens against the real mock repositories, so a
 * scenario passing here means the walkthrough works rather than that a helper
 * returned the right object. No test imports a fixture: every record is reached
 * through a repository, exactly as a screen reaches it.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

/** A `<Panel>` is a section titled by its heading; this is how a test scopes to one. */
function panel(title: string | RegExp): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No panel is titled "${String(title)}".`)
  return section
}

function matrix(): HTMLElement {
  const node = document.querySelector('[data-benefit-matrix]')
  if (!node) throw new Error('The benefit matrix is not on screen.')
  return node as HTMLElement
}

/** Walks `/quotations/new`: pick the customer, tick the products, open the composer. */
async function openComposer(
  user: ReturnType<typeof userEvent.setup>,
  products: readonly string[],
  customer = 'Rakesh Patel',
) {
  const combo = await screen.findByRole('combobox', { name: 'Customer' })
  await user.type(combo, customer.split(' ')[0])
  await user.click(await screen.findByRole('option', { name: new RegExp(customer) }))

  for (const product of products) {
    await user.click(screen.getByRole('checkbox', { name: new RegExp(product) }))
  }

  await user.click(screen.getByRole('button', { name: 'Open the composer' }))
  await screen.findByRole('table')
}

/** Presses Confirm inside the gate that is open, never a same-named action behind it. */
async function confirmGate(user: ReturnType<typeof userEvent.setup>, label: string) {
  const gate = document.querySelector('[data-confirm-gate]')
  if (!gate) throw new Error('No confirmation gate is open.')
  await user.click(within(gate as HTMLElement).getByRole('button', { name: label }))
}

/** Types one column's Final Payable Premium, the only way a figure enters. */
async function typePremium(
  user: ReturnType<typeof userEvent.setup>,
  columnLabel: string,
  rupees: string,
) {
  const control = screen.getByLabelText(`Final Payable Premium — ${columnLabel}`)
  await user.clear(control)
  await user.type(control, rupees)
}

const PATEL_COLUMNS = [
  'HDFC Ergo Optima Secure',
  'HDFC Ergo Optima Restore',
  'Bajaj Allianz Health Guard',
] as const

describe('canvas 2 — the quotation composer', () => {
  it('2.1 an agent picks three policies across two companies and the composer opens on one matrix: the union of the mapped benefit rows, a column per company, defaults pre-filled', async () => {
    const user = userEvent.setup()
    renderQuotations(repositories, '/quotations/new')

    await openComposer(user, ['Optima Secure', 'Optima Restore', 'Health Guard'])

    // One matrix, not three sheets.
    expect(document.querySelectorAll('[data-benefit-matrix]')).toHaveLength(1)

    // A column per company and product — three columns over two companies.
    const grid = matrix()
    for (const label of PATEL_COLUMNS) {
      expect(within(grid).getByRole('columnheader', { name: new RegExp(label) })).toBeInTheDocument()
    }
    expect(within(grid).getAllByText(/HDFC Ergo General Insurance/)).toHaveLength(2)
    expect(within(grid).getAllByText(/Bajaj Allianz General Insurance/)).toHaveLength(1)

    // The union of the mapped rows: every health benefit the catalogue carries,
    // and nothing from another line.
    const benefits = await repositories.benefits.list({ page: 1, pageSize: 500 })
    const health = benefits.rows.filter((item) => item.line === 'health')
    for (const item of health) {
      expect(within(grid).getByRole('rowheader', { name: new RegExp(item.label) })).toBeInTheDocument()
    }
    expect(within(grid).queryByRole('rowheader', { name: /Own damage cover/ })).toBeNull()

    // Defaults pre-filled from each product's own map — never borrowed across
    // columns, which is why the two HDFC products read differently.
    expect(screen.getByLabelText('Sum insured — HDFC Ergo Optima Secure')).toHaveValue('5,00,000')
    expect(screen.getByLabelText('Sum insured — HDFC Ergo Optima Restore')).toHaveValue('10,00,000')
    expect(screen.getByLabelText('Room rent limit — HDFC Ergo Optima Secure')).toHaveValue(
      'No capping',
    )
  })

  it('2.2 a benefit the catalogue does not carry is added as an ad-hoc row with a value, appears on this quotation only, and leaves the catalogue untouched', async () => {
    const user = userEvent.setup()
    renderQuotations(repositories, '/quotations/new')
    await openComposer(user, ['Optima Secure', 'Health Guard'])

    const catalogueBefore = await repositories.benefits.list({ page: 1, pageSize: 500 })
    expect(catalogueBefore.rows.some((item) => item.label === 'OPD dental cover')).toBe(false)

    await user.type(
      screen.getByLabelText('Add a benefit for this quotation only'),
      'OPD dental cover',
    )
    await user.click(screen.getByRole('button', { name: 'Add row' }))

    // The row is on the matrix, marked as belonging to this quotation alone.
    const grid = matrix()
    expect(
      within(grid).getByRole('rowheader', { name: /OPD dental cover/ }),
    ).toBeInTheDocument()
    expect(within(grid).getByText('This quotation only')).toBeInTheDocument()

    await user.type(
      screen.getByLabelText('OPD dental cover — HDFC Ergo Optima Secure'),
      '5,000 per year',
    )

    // Generate it so the row is recorded, then read the record back.
    await typePremium(user, 'HDFC Ergo Optima Secure', '24180')
    await typePremium(user, 'Bajaj Allianz Health Guard', '21500')
    await user.click(screen.getByRole('button', { name: 'Generate the quotation' }))
    await user.click(await screen.findByRole('button', { name: 'Generate' }))

    const raised = await repositories.quotations.list({ page: 1, pageSize: 5 })
    const quotation = raised.rows[0]
    const adHoc = quotation.benefitRows.filter((row) => row.adHoc)
    expect(adHoc.map((row) => row.label)).toEqual(['OPD dental cover'])
    expect(adHoc[0].benefitItemId).toBeNull()

    const lines = await repositories.quotations.lines(quotation.id)
    const hdfc = lines.find((line) => line.label === 'HDFC Ergo Optima Secure')
    expect(hdfc?.benefitValues[adHoc[0].key]).toBe('5,000 per year')

    // The catalogue is exactly as it was.
    const catalogueAfter = await repositories.benefits.list({ page: 1, pageSize: 500 })
    expect(catalogueAfter.rows).toEqual(catalogueBefore.rows)
  })

  it('2.3 the matrix is complete and a final premium is entered per company, so the quotation generates as a branded document, side by side, with every figure entered and none computed', async () => {
    const user = userEvent.setup()
    renderQuotations(repositories, '/quotations/new')
    await openComposer(user, ['Optima Secure', 'Optima Restore', 'Health Guard'])

    await typePremium(user, 'HDFC Ergo Optima Secure', '24180')
    await typePremium(user, 'HDFC Ergo Optima Restore', '22940')
    await typePremium(user, 'Bajaj Allianz Health Guard', '21500')

    const generate = screen.getByRole('button', { name: 'Generate the quotation' })
    expect(generate).toBeEnabled()
    await user.click(generate)
    await user.click(await screen.findByRole('button', { name: 'Generate' }))

    // The document, as a letterhead rather than a screen.
    const document_ = await screen.findByRole('heading', { name: 'Quotation' })
    expect(document_).toBeInTheDocument()
    expect(screen.getAllByText('Rakesh Patel').length).toBeGreaterThan(0)

    // Three columns, so it prints side by side; single is a click away.
    expect(document.querySelector('[data-layout="side_by_side"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Side by side/i })).toBeInTheDocument()

    // The figures came off the keyboard, and the record says so.
    const raised = await repositories.quotations.list({ page: 1, pageSize: 5 })
    const lines = await repositories.quotations.lines(raised.rows[0].id)
    expect(lines.map((line) => line.finalPayablePremium?.paise)).toEqual([
      2_418_000, 2_294_000, 2_150_000,
    ])
    expect(lines.every((line) => line.finalPremiumSource === 'typed')).toBe(true)
  })

  it('2.4 auto-share is on, so a quotation the agent generated and a quotation the agent uploaded both reach the customer on the configured channel and both are logged', async () => {
    const user = userEvent.setup()
    const recipe = await repositories.config.recipe('quotation.autoShare')
    expect(recipe?.parameters.autoShare).toBe(true)

    /* ---- origin: generated ---- */
    const generated = renderQuotations(repositories, '/quotations/new')
    await openComposer(user, ['Optima Secure', 'Health Guard'])
    await typePremium(user, 'HDFC Ergo Optima Secure', '24180')
    await typePremium(user, 'Bajaj Allianz Health Guard', '21500')
    await user.click(screen.getByRole('button', { name: 'Generate the quotation' }))
    await user.click(await screen.findByRole('button', { name: 'Generate' }))

    const sentFromGenerate = await screen.findByRole('heading', { name: 'Sent to the customer' })
    const generatedPanel = sentFromGenerate.closest('section') as HTMLElement
    expect(within(generatedPanel).getByText('Generated in the composer')).toBeInTheDocument()
    expect(within(generatedPanel).getByText('whatsapp')).toBeInTheDocument()
    expect(
      within(generatedPanel).getByText('On — sent as soon as the quotation existed'),
    ).toBeInTheDocument()
    expect(generatedPanel.querySelector('[data-event="message.sent"]')).not.toBeNull()

    const forPatel = await repositories.quotations.forCustomer('cus-rakesh-patel')
    const first = forPatel.rows.find((row) => row.status === 'shared')
    expect(first).toBeDefined()
    expect(first?.sharedAt).not.toBeNull()
    generated.unmount()

    /* ---- origin: uploaded, same fork, same outcome ---- */
    renderQuotations(repositories, '/quotations/new')
    await openComposer(user, ['Optima Secure', 'Health Guard'], 'Hitesh Mehta')
    await typePremium(user, 'HDFC Ergo Optima Secure', '14260')
    await typePremium(user, 'Bajaj Allianz Health Guard', '12640')
    await user.type(screen.getByLabelText(/Or record the insurer/), 'hdfc-optima-quote.pdf')
    await user.click(screen.getByRole('button', { name: 'Record an uploaded quotation' }))
    await user.click(await screen.findByRole('button', { name: 'Record it' }))

    const sentFromUpload = await screen.findByRole('heading', { name: 'Sent to the customer' })
    const uploadedPanel = sentFromUpload.closest('section') as HTMLElement
    expect(within(uploadedPanel).getByText('Uploaded from the insurer')).toBeInTheDocument()
    expect(within(uploadedPanel).getByText('whatsapp')).toBeInTheDocument()
    expect(
      within(uploadedPanel).getByText('On — sent as soon as the quotation existed'),
    ).toBeInTheDocument()
    expect(uploadedPanel.querySelector('[data-event="message.sent"]')).not.toBeNull()

    const forMehta = await repositories.quotations.forCustomer('cus-hitesh-mehta')
    const second = forMehta.rows.find((row) => row.id !== 'qtn-0331')
    expect(second?.status).toBe('shared')
    expect(second?.sharedAt).not.toBeNull()
    expect(second?.id).not.toBe(first?.id)
  })

  it('2.5 the customer wants changes, so a revision is created with a compulsory reason, and the version it replaces stays immutable and still viewable', async () => {
    const user = userEvent.setup()
    const view = renderQuotations(repositories, '/quotations/qtn-0331')
    await screen.findByRole('heading', { name: 'The comparison' })

    // The reason is compulsory, and the blocked control says so in the machine's words.
    const revise = screen.getByRole('button', { name: 'Open a revision' })
    expect(revise).toBeDisabled()
    expect(
      screen.getByText('Record why this quotation is being revised before opening a new version.'),
    ).toBeInTheDocument()

    await user.type(
      screen.getByLabelText(/Why is a revision needed/),
      'Customer asked for a higher sum insured.',
    )
    expect(screen.getByRole('button', { name: 'Open a revision' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Open a revision' }))
    await user.click(await screen.findByRole('button', { name: 'Open the revision' }))

    // Version 2 is now being prepared, seeded from what version 1 said.
    await screen.findByRole('heading', { name: 'Generate version 2' })
    const sumInsured = screen.getByLabelText('Sum insured — HDFC Ergo Optima Secure')
    expect(sumInsured).toHaveValue('5,00,000')
    await user.clear(sumInsured)
    await user.type(sumInsured, '10,00,000')
    await typePremium(user, 'HDFC Ergo Optima Secure', '19400')

    await user.click(screen.getByRole('button', { name: 'Generate version 2' }))
    await user.click(await screen.findByRole('button', { name: 'Generate' }))
    await screen.findByRole('link', { name: 'Version 2 — current' })

    // Version 1 was archived, not rewritten.
    const all = await repositories.quotations.allLines('qtn-0331')
    const v1 = all.filter((line) => line.version === 1)
    expect(v1).toHaveLength(3)
    expect(v1.every((line) => line.locked)).toBe(true)
    expect(v1.find((line) => line.label === 'HDFC Ergo Optima Secure')?.benefitValues['sum-insured']).toBe(
      '5,00,000',
    )

    // And it is still viewable, exactly as it was sent.
    view.unmount()
    renderQuotations(repositories, '/quotations/qtn-0331/v/1')
    expect(await screen.findByRole('heading', { name: 'Version 1, as sent' })).toBeInTheDocument()
    expect(
      screen.getByText(/Version 1 is archived\. It reads exactly as the customer received it/),
    ).toBeInTheDocument()
    const archived = matrix()
    expect(archived.getAttribute('data-readonly')).toBe('true')
    expect(within(archived).getAllByText('5,00,000').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Generate version 2' })).toBeNull()
  })

  it('2.6 the customer declines, so the quotation is marked lost only once a reason is recorded, and the reason stays on the record for reporting', async () => {
    const user = userEvent.setup()
    renderQuotations(repositories, '/quotations/qtn-0331')
    await screen.findByRole('heading', { name: 'The comparison' })

    const lost = screen.getByRole('button', { name: 'Mark lost' })
    expect(lost).toBeDisabled()
    expect(
      screen.getByText(
        'Record why this quotation was lost. The mandatory reason is what makes lost-reason reporting worth reading.',
      ),
    ).toBeInTheDocument()

    await user.type(
      screen.getByLabelText(/Why was it lost/),
      'Bought from a bank at a lower premium.',
    )
    await user.click(screen.getByRole('button', { name: 'Mark lost' }))
    await confirmGate(user, 'Mark lost')

    expect(await screen.findByText(/Lost\. Bought from a bank at a lower premium\./)).toBeInTheDocument()

    const quotation = await repositories.quotations.get('qtn-0331')
    expect(quotation?.status).toBe('lost')
    expect(quotation?.lostReason).toBe('Bought from a bank at a lower premium.')
  })

  it('2.7 the customer agrees, so the quotation is marked won and a deal opens with an application number, the accepted line items, and the customer, agent and sub-agent linked', async () => {
    const user = userEvent.setup()
    await signIn(repositories, WHO.kiran)
    renderQuotations(repositories, '/quotations/new')

    await openComposer(user, ['Optima Secure', 'Health Guard'], 'Dipika Shah')
    await typePremium(user, 'HDFC Ergo Optima Secure', '18500')
    await typePremium(user, 'Bajaj Allianz Health Guard', '17250')
    await user.click(screen.getByRole('button', { name: 'Generate the quotation' }))
    await user.click(await screen.findByRole('button', { name: 'Generate' }))

    // Auto-share put it in front of the customer; now they have answered.
    await screen.findByRole('heading', { name: 'The customer’s answer' })
    await user.click(screen.getByRole('checkbox', { name: /HDFC Ergo Optima Secure/ }))
    await user.click(screen.getByRole('button', { name: 'Mark won and open the deal' }))
    await user.click(await screen.findByRole('button', { name: 'Mark won' }))

    // The deal screen, addressed by the new application number.
    expect(await screen.findByRole('heading', { name: 'Dipika Shah' })).toBeInTheDocument()
    expect(screen.getAllByText(/APP-/).length).toBeGreaterThan(0)

    await screen.findByRole('heading', { name: 'Line items' })
    const items = panel('Line items')
    expect(within(items).getByText('HDFC Ergo Optima Secure')).toBeInTheDocument()
    expect(within(items).queryByText('Bajaj Allianz Health Guard')).toBeNull()

    const deals = await repositories.deals.list({ page: 1, pageSize: 5 })
    const deal = deals.rows[0]
    const quotation = await repositories.quotations.get(deal.quotationId)
    const customer = await repositories.customers.get(deal.customerId)
    expect(quotation?.status).toBe('won')
    expect(quotation?.finalPayablePremium?.paise).toBe(1_850_000)
    expect(deal.systemNo).toMatch(/^APP-/)
    expect(deal.lineItems).toHaveLength(1)
    expect(deal.customerId).toBe(customer?.id)
    expect(deal.agentId).toBe(quotation?.agentId)
    expect(deal.agentId).toBe('agt-kiran-solanki')
    expect(deal.subAgentId).toBe('agt-meera-joshi')
  })

  it('2.8 a deal exists so policy entry begins with its line items pre-populated, and a deal with nothing on it is blocked with the machine’s own sentence', async () => {
    const user = userEvent.setup()
    const view = renderQuotations(repositories, '/deals/app-0774')

    await screen.findByRole('heading', { name: 'Line items' })
    const items = panel('Line items')
    expect(within(items).getByText('Tata AIG Travel Guard')).toBeInTheDocument()
    expect(within(items).getByText('Tata AIG MediCare Premier')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Begin policy entry' }))
    expect(await screen.findByRole('heading', { name: 'Policy entry' })).toBeInTheDocument()
    view.unmount()

    // The other half of 2.8: a deal with no line items cannot go forward, and
    // the block is the deal machine's own sentence rather than a greyed button.
    renderQuotations(repositories, '/deals/app-0775')
    const blocked = await screen.findAllByText(
      'This deal has no line items. Add at least one company and product from the won quotation before taking it forward.',
    )
    expect(blocked.length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Begin policy entry' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Set the line items' })).toBeDisabled()
  })
})

describe('the premium stop — the system cannot fill it in', () => {
  it('generate stays blocked, and says why, until a person has typed a Final Payable Premium into every column', async () => {
    const user = userEvent.setup()
    renderQuotations(repositories, '/quotations/new')
    await openComposer(user, ['Optima Secure', 'Optima Restore', 'Health Guard'])

    // A complete matrix — every cell pre-filled — and not one figure.
    expect(matrix().getAttribute('data-ready')).toBe('false')
    expect(document.querySelectorAll('[data-premium-cell][data-recorded="true"]')).toHaveLength(0)

    const generate = screen.getByRole('button', { name: 'Generate the quotation' })
    expect(generate).toBeDisabled()

    // The blocked control carries the machine's sentence, naming every column.
    const stop = document.querySelector('[data-generate-stop]')
    expect(stop?.textContent).toContain(
      'Final Payable Premium is missing for: HDFC Ergo Optima Secure, HDFC Ergo Optima Restore, Bajaj Allianz Health Guard.',
    )
    expect(stop?.textContent).toContain('the platform does not work it out')
    expect(generate).toHaveAttribute('aria-describedby', 'generate-stop')

    // Nothing else on the screen puts a figure in. Every other control is
    // exercised, and the columns are still empty afterwards.
    await user.click(screen.getByRole('radio', { name: 'Monthly' }))
    await user.type(screen.getByLabelText('Add a benefit for this quotation only'), 'Wellness')
    await user.click(screen.getByRole('button', { name: 'Add row' }))
    await user.type(screen.getByLabelText('Sum insured — HDFC Ergo Optima Secure'), '0')
    await user.type(screen.getByLabelText(/Or record the insurer/), 'insurer-quote.pdf')
    expect(document.querySelectorAll('[data-premium-cell][data-recorded="true"]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Generate the quotation' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Record an uploaded quotation' })).toBeDisabled()

    // One column typed is not three: the stop narrows, it does not lift.
    await typePremium(user, 'HDFC Ergo Optima Secure', '24180')
    expect(document.querySelectorAll('[data-premium-cell][data-recorded="true"]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Generate the quotation' })).toBeDisabled()
    expect(document.querySelector('[data-generate-stop]')?.textContent).toContain(
      'Final Payable Premium is missing for: HDFC Ergo Optima Restore, Bajaj Allianz Health Guard.',
    )

    // The last two, and only then does it lift.
    await typePremium(user, 'HDFC Ergo Optima Restore', '22940')
    await typePremium(user, 'Bajaj Allianz Health Guard', '21500')
    expect(matrix().getAttribute('data-ready')).toBe('true')
    expect(screen.getByRole('button', { name: 'Generate the quotation' })).toBeEnabled()
  })

  /**
   * FR-06.16 — the seam §9.2 step 4 sat on.
   *
   * The composer's opening line is "select the customer and the candidate
   * policies", which only works if somebody already knows what the customer
   * needs. Until requirement capture existed the answer came from the agent's
   * memory of a phone call.
   */
  it('opens with what the customer said they need, in the words the form asked', async () => {
    renderQuotations(repositories, '/quotations/new?inquiry=inq-1031')

    const heading = await screen.findByRole('heading', { name: 'What they said they need' })
    const panel = heading.closest('section') as HTMLElement

    // Labels off the pinned schema, never the stored keys.
    expect(within(panel).getByText('Make and model')).toBeInTheDocument()
    expect(within(panel).getByText('Maruti Baleno Zeta')).toBeInTheDocument()
    expect(within(panel).queryByText('makeModel')).not.toBeInTheDocument()

    // A boolean reads as a person would say it, not as `false`.
    const claimed = within(panel).getByText('Claimed on the current policy')
    expect(claimed.nextElementSibling).toHaveTextContent('No')
    expect(within(panel).queryByText('false')).not.toBeInTheDocument()
  })

  it('says nothing about requirements when the inquiry carries none', async () => {
    // No panel rather than an empty one: a heading over nothing reads as a
    // requirement that was captured and came back blank.
    renderQuotations(repositories, '/quotations/new?inquiry=inq-1039')

    await screen.findByRole('heading', { name: 'Customer' })
    expect(
      screen.queryByRole('heading', { name: 'What they said they need' }),
    ).not.toBeInTheDocument()
  })

  it('the composer has no way to put a figure into a column: the only writer is the per-column control, wired to what a person typed', () => {
    // Complements the matrix model's own export-surface proof. The screen
    // renders no amount-entry control of its own, never calls the model's
    // premium setter, and never imports the money constructors — so there is no
    // seam by which a figure the user did not type could reach a column. The
    // names are spelled out in the assertions below and deliberately nowhere
    // else in this test, because the file reads its own subject's source.
    expect(composerSource).not.toContain('RecordOnlyAmount')
    expect(composerSource).not.toContain('setColumnPremium')
    expect(composerSource).not.toMatch(/premiums:\s/)
    expect(composerSource).not.toMatch(/from '\.\.\/\.\.\/domain\/money'/)
    expect(composerSource).not.toMatch(/\bmoney\(/)
  })
})
