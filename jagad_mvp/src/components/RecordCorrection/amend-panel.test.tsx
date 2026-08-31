import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { amendableFields } from '../../domain/amend'
import type { AmendCommand } from '../../domain/amend'
import { fromPaise } from '../../domain/money'
import { committed, rejected } from '../../data/repo'
import type { MutationResult } from '../../data/repo'
import { AmendPanel } from './AmendPanel'

/**
 * The correction form, on its own.
 *
 * These are the promises the panel makes, and each is a rule from
 * `src/domain/amend.ts` rather than a preference: only allow-listed fields are
 * offered, a field this record's own state has put out of reach is not offered
 * at all, the reason is compulsory, the gate shows the real before and after,
 * Cancel writes nothing, an amount is never echoed, and a refusal is printed in
 * the machine's own words.
 */

const INQUIRY = {
  id: 'inq-1031',
  systemNo: 'INQ-1031',
  status: 'accepted',
  contactName: 'Bhavesh Trivedi',
  contactMobile: '9825110004',
  contactEmail: null,
  notes: 'Walked in about the car.',
  agentId: null,
  subAgentId: null,
}

const DRAFT_POLICY = {
  id: 'pol-draft-0219',
  systemNo: 'POL-0219',
  status: 'draft',
  insurerNo: null,
  startDate: '2026-09-01',
  expiryDate: '2027-08-31',
  sumInsured: fromPaise(50_000_00),
  netPremium: fromPaise(12_000_00),
  gstAmount: fromPaise(2_160_00),
  finalPremium: fromPaise(14_160_00),
  agentId: null,
  subAgentId: null,
}

const ISSUED_POLICY = { ...DRAFT_POLICY, status: 'issued', insurerNo: 'HDFC/2026/44812' }

type Amender = (command: AmendCommand) => Promise<MutationResult<typeof INQUIRY>>

function renderInquiryPanel(
  onAmend = vi.fn<Amender>(async () => committed(INQUIRY, [])),
) {
  const onAmended = vi.fn()
  const view = render(
    <AmendPanel
      entity="Inquiry"
      record={INQUIRY}
      subject="INQ-1031"
      actorId="usr-vivek-jagad"
      onAmend={onAmend}
      onAmended={onAmended}
    />,
  )
  return { ...view, onAmend, onAmended }
}

describe('the correction form offers exactly what the allow-list permits', () => {
  it('renders every amendable field on the entity and nothing else', () => {
    const { container } = renderInquiryPanel()

    // One labelled control per allow-listed field, plus the reason. The count is
    // read off the domain rather than written down here, so adding a field to
    // `AMEND_POLICIES.Inquiry` makes this test demand it on the form.
    expect(container.querySelectorAll('label')).toHaveLength(
      amendableFields('Inquiry').length + 1,
    )

    expect(screen.getByLabelText('Mobile')).toBeInTheDocument()
    expect(screen.getByLabelText('Name taken down')).toBeInTheDocument()
    expect(screen.getByLabelText('Note')).toBeInTheDocument()

    // The lifecycle field is not offered — not as a disabled box, not at all.
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(
      screen.getByText('A status changes through the workflow, not through a correction.'),
    ).toBeInTheDocument()
  })

  it('offers a draft policy its figures, and takes them away once the insurer has issued', () => {
    const { unmount } = render(
      <AmendPanel
        entity="Policy"
        record={DRAFT_POLICY}
        subject="POL-0219"
        actorId="usr-vivek-jagad"
        onAmend={vi.fn(async () => committed(DRAFT_POLICY, []))}
        onAmended={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Net premium')).toBeInTheDocument()
    unmount()

    render(
      <AmendPanel
        entity="Policy"
        record={ISSUED_POLICY}
        subject="POL-0219"
        actorId="usr-vivek-jagad"
        issued
        onAmend={vi.fn(async () => committed(ISSUED_POLICY, []))}
        onAmended={vi.fn()}
      />,
    )

    // Not disabled — absent, with one line saying where a premium does change.
    expect(screen.queryByLabelText('Net premium')).not.toBeInTheDocument()
    expect(screen.getByText(/changes through an endorsement/)).toBeInTheDocument()
    // And the insurer's own number is not ours to correct once it is on the record.
    expect(screen.queryByLabelText("Insurer's number")).not.toBeInTheDocument()
    expect(screen.getByText(/came from the insurer/)).toBeInTheDocument()
  })
})

describe('an identifier is never reachable from a correction', () => {
  it('offers no Aadhaar field and prints no Aadhaar value, in full or masked', () => {
    const customer = {
      id: 'cus-rakesh-patel',
      systemNo: 'CUS-0001',
      status: 'active',
      fullName: 'Rakesh Patel',
      mobile: '9825010011',
      altMobile: null,
      email: 'rakesh@example.com',
      addressLine: '12 Shanti Bungalows',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380015',
      dateOfBirth: '1979-04-11',
      agentId: null,
      subAgentId: null,
      aadhaarNumber: '123412341234',
      aadhaarLast4: '1234',
    }

    const { container } = render(
      <AmendPanel
        entity="Customer"
        record={customer}
        subject="CUS-0001"
        actorId="usr-vivek-jagad"
        onAmend={vi.fn(async () => committed(customer, []))}
        onAmended={vi.fn()}
      />,
    )

    // `state` here is Gujarat, not a lifecycle — the allow-list says so, and the
    // form offers it for exactly that reason.
    expect(screen.getByLabelText('State')).toHaveValue('Gujarat')

    expect(container.textContent).not.toContain('123412341234')
    expect(container.textContent).not.toContain('1234')
    expect(screen.queryByLabelText(/aadhaar/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/An Aadhaar number is captured once through KYC/),
    ).toBeInTheDocument()
  })
})

describe('a correction cannot be recorded without a reason', () => {
  it('refuses in the domain’s own words until one is given', async () => {
    const user = userEvent.setup()
    renderInquiryPanel()

    const mobile = screen.getByLabelText('Mobile')
    await user.clear(mobile)
    await user.type(mobile, '9825110099')

    const review = screen.getByRole('button', { name: 'Review this correction' })
    expect(review).toBeDisabled()
    expect(screen.getByText(/A correction has to say why it is being made\./)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Why is this being corrected'), 'Digit transposed.')
    expect(screen.getByRole('button', { name: 'Review this correction' })).toBeEnabled()
  })

  it('refuses a correction that changes nothing, with the guard’s sentence', async () => {
    const user = userEvent.setup()
    renderInquiryPanel()

    await user.type(screen.getByLabelText('Why is this being corrected'), 'Tidying up.')

    expect(screen.getByRole('button', { name: 'Review this correction' })).toBeDisabled()
    expect(
      screen.getByText('A correction has to name at least one field to correct.'),
    ).toBeInTheDocument()
  })
})

describe('the gate shows the real before and after, and Cancel writes nothing', () => {
  it('previews exactly the fields being changed', async () => {
    const user = userEvent.setup()
    const { container } = renderInquiryPanel()

    const mobile = screen.getByLabelText('Mobile')
    await user.clear(mobile)
    await user.type(mobile, '9825110099')
    await user.type(screen.getByLabelText('Why is this being corrected'), 'Digit transposed.')
    await user.click(screen.getByRole('button', { name: 'Review this correction' }))

    const row = container.querySelector('[data-change="contactMobile"]')
    expect(row).not.toBeNull()
    expect(row).toHaveTextContent('9825110004')
    expect(row).toHaveTextContent('9825110099')

    // Only the field that changed. The name was left alone, so it is not here.
    expect(container.querySelector('[data-change="contactName"]')).toBeNull()
  })

  it('calls nothing when the person backs out', async () => {
    const user = userEvent.setup()
    const { onAmend } = renderInquiryPanel()

    const mobile = screen.getByLabelText('Mobile')
    await user.clear(mobile)
    await user.type(mobile, '9825110099')
    await user.type(screen.getByLabelText('Why is this being corrected'), 'Digit transposed.')
    await user.click(screen.getByRole('button', { name: 'Review this correction' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onAmend).not.toHaveBeenCalled()
  })

  it('names an amount in the preview and never prints the figure', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AmendPanel
        entity="Policy"
        record={DRAFT_POLICY}
        subject="POL-0219"
        actorId="usr-vivek-jagad"
        onAmend={vi.fn(async () => committed(DRAFT_POLICY, []))}
        onAmended={vi.fn()}
      />,
    )

    const premium = screen.getByLabelText('Net premium')
    await user.clear(premium)
    await user.type(premium, '12500')
    await user.type(screen.getByLabelText('Why is this being corrected'), 'Typed from the schedule.')
    await user.click(screen.getByRole('button', { name: 'Review this correction' }))

    const row = container.querySelector('[data-change="netPremium"]')
    expect(row).not.toBeNull()
    expect(row).toHaveTextContent('Net premium')
    expect(row?.textContent).not.toContain('12500')
    expect(row?.textContent).not.toContain('12,000')
  })
})

describe('a refusal from the repository is rendered as written', () => {
  it('prints the machine’s sentence and leaves no receipt behind', async () => {
    const user = userEvent.setup()
    const sentence =
      'contactMobile is not a correctable field on an Inquiry today, because the record is locked.'
    const { onAmended } = renderInquiryPanel(vi.fn<Amender>(async () => rejected(sentence)))

    const mobile = screen.getByLabelText('Mobile')
    await user.clear(mobile)
    await user.type(mobile, '9825110099')
    await user.type(screen.getByLabelText('Why is this being corrected'), 'Digit transposed.')
    await user.click(screen.getByRole('button', { name: 'Review this correction' }))
    await user.click(screen.getByRole('button', { name: 'Record the correction' }))

    expect(await screen.findByText(sentence)).toBeInTheDocument()
    expect(onAmended).not.toHaveBeenCalled()
    // No receipt over a write that did not happen.
    expect(screen.queryByText(/Corrected\./)).not.toBeInTheDocument()
  })
})
