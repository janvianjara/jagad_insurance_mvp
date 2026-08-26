/*
 * The four promises P-12 makes, exercised through the rendered form.
 *
 * Branching, draft safety across a session timeout, reserved fields that cannot
 * be removed, and a record that renders under the version it was captured with.
 * Every one of them is a promise to a person: the form asks what it should ask,
 * their typing outlives the session, the renewal task still knows when the
 * policy ends, and a two-year-old record still says what it said.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchemaForm } from './SchemaForm'
import {
  HEALTH_POLICY_ENTRY_V1,
  HEALTH_POLICY_ENTRY_V2,
  INQUIRY_CAPTURE_V1,
} from '../../domain/forms'
import type { FormSchema } from '../../domain/forms'

const MASTERS = {
  'mst-inquiry-source': [
    { value: 'walk_in', label: 'Walk in' },
    { value: 'referral', label: 'Referral' },
    { value: 'whatsapp', label: 'WhatsApp' },
  ],
  'mst-city': [
    { value: 'surat', label: 'Surat' },
    { value: 'navsari', label: 'Navsari' },
  ],
  'mst-occupation': [{ value: 'business', label: 'Business' }],
  'mst-relationship': [
    { value: 'self', label: 'Self' },
    { value: 'spouse', label: 'Spouse' },
  ],
}

function renderInquiry(entityId = 'INQ-1044', onSubmit = vi.fn()) {
  return {
    onSubmit,
    ...render(
      <SchemaForm
        schema={INQUIRY_CAPTURE_V1}
        entityId={entityId}
        masterOptions={MASTERS}
        onSubmit={onSubmit}
      />,
    ),
  }
}

/**
 * Jump straight to a stage through the stepper.
 *
 * Scoped to the stepper on purpose: the missing-field summary is a list of
 * buttons too, and "the way back to a field" and "the way to a stage" are
 * deliberately both there.
 */
async function goToStage(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  const stages = within(screen.getByRole('list', { name: 'Stages' }))
  await user.click(stages.getByRole('button', { name: label }))
}

/** The contact stage, filled the way the front desk would fill it. */
async function fillContact(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Name/), 'Rakesh Patel')
  await user.type(screen.getByLabelText(/^Mobile/), '9825012345')
  await user.selectOptions(screen.getByLabelText(/^Source/), 'walk_in')
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('branching — the form asks what the answers call for', () => {
  it('shows a line s own questions, and drops them when the line changes', async () => {
    const user = userEvent.setup()
    renderInquiry()

    await fillContact(user)
    await user.click(screen.getByRole('button', { name: /Next/ }))

    // Nothing line-specific until a line is chosen.
    expect(screen.queryByLabelText(/Registration number/)).toBeNull()
    expect(screen.queryByLabelText(/Cover for/)).toBeNull()

    await user.selectOptions(screen.getByLabelText(/Line of business/), 'motor')
    expect(screen.getByLabelText(/Registration number/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Cover for/)).toBeNull()

    await user.selectOptions(screen.getByLabelText(/Line of business/), 'health')
    expect(screen.queryByLabelText(/Registration number/)).toBeNull()
    expect(screen.getByLabelText(/Cover for/)).toBeInTheDocument()
  })

  it('never blocks on a question that has branched away', async () => {
    const user = userEvent.setup()
    renderInquiry()

    await fillContact(user)
    await user.click(screen.getByRole('button', { name: /Next/ }))
    await user.selectOptions(screen.getByLabelText(/Line of business/), 'life')

    const summary = within(screen.getByRole('region', { name: 'Still to record' }))
    expect(summary.getByText(/What the cover is for/)).toBeInTheDocument()
    expect(summary.queryByText(/Registration number/)).toBeNull()
  })
})

describe('keyboard first', () => {
  it('moves to the next stage on Enter, and never submits on it', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderInquiry()

    await fillContact(user)
    await user.click(screen.getByLabelText(/^Name/))
    await user.keyboard('{Enter}')

    expect(screen.getByLabelText(/Line of business/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('holds the stage when something required on it is still missing', async () => {
    const user = userEvent.setup()
    renderInquiry()

    await user.type(screen.getByLabelText(/^Name/), 'Rakesh Patel')
    await user.keyboard('{Enter}')

    expect(screen.getByLabelText(/^Mobile/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Line of business/)).toBeNull()
  })
})

describe('draft safety — a session timeout costs nobody their typing', () => {
  it('restores what was typed when the form is opened again', async () => {
    const user = userEvent.setup()
    const first = renderInquiry('INQ-1044')

    await user.type(screen.getByLabelText(/^Name/), 'Rakesh Patel')
    await user.type(screen.getByLabelText(/^Mobile/), '9825012345')

    // The session ends: the tab is closed, the token expires, the tree goes.
    first.unmount()

    renderInquiry('INQ-1044')
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Rakesh Patel')
    expect(screen.getByLabelText(/^Mobile/)).toHaveValue('9825012345')
    expect(screen.getByText(/Draft restored/)).toBeInTheDocument()
  })

  it('keeps one draft per record — two inquiries never bleed into each other', async () => {
    const user = userEvent.setup()
    const first = renderInquiry('INQ-1044')
    await user.type(screen.getByLabelText(/^Name/), 'Rakesh Patel')
    first.unmount()

    renderInquiry('INQ-1041')
    expect(screen.getByLabelText(/^Name/)).toHaveValue('')
  })

  it('still says what is left after the draft comes back', async () => {
    const user = userEvent.setup()
    const first = renderInquiry('INQ-1044')
    await user.type(screen.getByLabelText(/^Name/), 'Rakesh Patel')
    first.unmount()

    renderInquiry('INQ-1044')
    const summary = within(screen.getByRole('region', { name: 'Still to record' }))
    expect(summary.getByText(/Contact — Mobile/)).toBeInTheDocument()
    expect(summary.queryByText(/Contact — Name/)).toBeNull()
  })

  it('clears the draft once the record is saved — a saved form has nothing to recover', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderInquiry('INQ-1044', onSubmit)

    await fillContact(user)
    await user.click(screen.getByRole('button', { name: /Next/ }))
    await user.selectOptions(screen.getByLabelText(/Line of business/), 'health')
    await user.selectOptions(screen.getByLabelText(/Cover for/), 'floater')
    await user.click(screen.getByRole('button', { name: /Next/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].schemaId).toBe(INQUIRY_CAPTURE_V1.id)
    expect(onSubmit.mock.calls[0][0].schemaVersion).toBe(1)
    expect(window.localStorage.getItem('jagad.form-draft:inquiry:INQ-1044')).toBeNull()
  })
})

describe('the missing-field summary is a way back, not just a list', () => {
  it('sends somebody to the stage and the control that is still empty', async () => {
    const user = userEvent.setup()
    renderInquiry()

    await fillContact(user)
    await user.click(screen.getByRole('button', { name: /Next/ }))
    await user.selectOptions(screen.getByLabelText(/Line of business/), 'motor')

    const summary = within(screen.getByRole('region', { name: 'Still to record' }))
    await user.click(summary.getByRole('button', { name: /Registration number/ }))

    expect(screen.getByLabelText(/Registration number/)).toHaveFocus()
  })

  it('crosses stages to get there', async () => {
    const user = userEvent.setup()
    renderInquiry()

    await user.type(screen.getByLabelText(/^Name/), 'Rakesh Patel')
    await goToStage(user, /Interest/)
    expect(screen.getByLabelText(/Line of business/)).toBeInTheDocument()

    // The source was never chosen, two stages back.
    const summary = within(screen.getByRole('region', { name: 'Still to record' }))
    await user.click(summary.getByRole('button', { name: /Contact — Source/ }))

    expect(screen.getByLabelText(/^Source/)).toHaveFocus()
  })
})

describe('version pinning — a record renders the schema it was captured with', () => {
  it('renders the pinned version s stages, not today s', () => {
    render(
      <SchemaForm
        schema={HEALTH_POLICY_ENTRY_V1}
        entityId="POL-4388"
        pinnedVersion={1}
        masterOptions={MASTERS}
        onSubmit={vi.fn()}
      />,
    )

    const stages = within(screen.getByRole('list', { name: 'Stages' }))
    expect(stages.getByText('Premium')).toBeInTheDocument()
    expect(stages.queryByText('Nominee')).toBeNull()
  })

  it('refuses to render a record under a version it was not captured with', () => {
    render(
      <SchemaForm
        schema={HEALTH_POLICY_ENTRY_V2}
        entityId="POL-4388"
        pinnedVersion={1}
        masterOptions={MASTERS}
        onSubmit={vi.fn()}
      />,
    )

    const refusal = screen.getByRole('alert')
    expect(refusal).toHaveAttribute('data-refusal', 'version')
    expect(refusal).toHaveTextContent(/pinned to version 1/)
    expect(screen.queryByLabelText(/Proposer name/)).toBeNull()
  })

  it('renders today s schema for a new record, which pins nothing', () => {
    render(
      <SchemaForm
        schema={HEALTH_POLICY_ENTRY_V2}
        entityId="POL-DRAFT-0219"
        masterOptions={MASTERS}
        onSubmit={vi.fn()}
      />,
    )

    const stages = within(screen.getByRole('list', { name: 'Stages' }))
    expect(stages.getByText('Nominee')).toBeInTheDocument()
  })
})

describe('a schema that removed a reserved field is not rendered at all', () => {
  it('refuses, and says which field and why it mattered', () => {
    const withoutExpiry: FormSchema = {
      ...HEALTH_POLICY_ENTRY_V2,
      stages: HEALTH_POLICY_ENTRY_V2.stages.map((stage) => ({
        ...stage,
        fields: stage.fields.filter((field) => field.key !== 'expiryDate'),
      })),
    }

    render(
      <SchemaForm
        schema={withoutExpiry}
        entityId="POL-DRAFT-0219"
        masterOptions={MASTERS}
        onSubmit={vi.fn()}
      />,
    )

    const refusal = screen.getByRole('alert')
    expect(refusal).toHaveAttribute('data-refusal', 'schema')
    expect(refusal).toHaveTextContent(/expiryDate/)
    expect(refusal).toHaveTextContent(/renewal/i)
    expect(screen.queryByLabelText(/Proposer name/)).toBeNull()
  })
})

describe('money on a schema form', () => {
  it('takes amounts through the record-only control and derives nothing into an input', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <SchemaForm
        schema={HEALTH_POLICY_ENTRY_V2}
        entityId="POL-DRAFT-0219"
        masterOptions={MASTERS}
        onSubmit={vi.fn()}
      />,
    )

    await goToStage(user, /Premium/)

    // The typed figures are inputs; the derived ones are not.
    expect(screen.getByLabelText(/Base premium/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Base premium/)).toHaveAttribute(
      'placeholder',
      'Type the figure',
    )
    expect(screen.queryByRole('textbox', { name: /Final premium/ })).toBeNull()

    await user.type(screen.getByLabelText(/Base premium/), '12000')
    await user.type(screen.getByLabelText(/^Loading/), '485')

    const net = container.querySelector('[data-rollup="net"]')
    expect(net?.textContent).toContain('12,485')

    // Final stays unrecorded until GST is typed: Net plus nothing is not a total.
    const final = container.querySelector('[data-rollup="final"]')
    expect(final?.textContent).not.toContain('12,485')

    await user.type(screen.getByLabelText(/^GST/), '2247.30')
    expect(container.querySelector('[data-rollup="final"]')?.textContent).toContain('14,732.30')
  })

  it('never counts a derived figure as something a person still has to record', async () => {
    const user = userEvent.setup()
    render(
      <SchemaForm
        schema={HEALTH_POLICY_ENTRY_V2}
        entityId="POL-DRAFT-0219"
        masterOptions={MASTERS}
        onSubmit={vi.fn()}
      />,
    )

    await goToStage(user, /Premium/)
    const summary = within(screen.getByRole('region', { name: 'Still to record' }))

    expect(summary.getByText(/Base premium/)).toBeInTheDocument()
    expect(summary.queryByText(/Final premium/)).toBeNull()
  })
})

describe('repeating groups', () => {
  it('adds and removes rows, and asks each row for what that row needs', async () => {
    const user = userEvent.setup()
    render(
      <SchemaForm
        schema={HEALTH_POLICY_ENTRY_V2}
        entityId="POL-DRAFT-0219"
        masterOptions={MASTERS}
        onSubmit={vi.fn()}
      />,
    )

    await goToStage(user, /Cover/)
    // The member table is behind the floater branch.
    expect(screen.queryByRole('button', { name: /Add a member/ })).toBeNull()

    await user.click(screen.getByLabelText(/Family floater/))
    await user.click(screen.getByRole('button', { name: /Add a member/ }))
    // Ids are the react-hook-form paths, which is what lets the missing-field
    // summary send somebody back to one row of one group.
    expect(document.getElementById('members.0.memberName')).not.toBeNull()

    // A row's own branch: the declaration note appears for that row only.
    expect(document.getElementById('members.0.declarationNote')).toBeNull()
    await user.click(screen.getByLabelText(/Declaration made on the proposal/))
    expect(document.getElementById('members.0.declarationNote')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: /Remove Member 1/ }))
    expect(document.getElementById('members.0.memberName')).toBeNull()
  })
})
