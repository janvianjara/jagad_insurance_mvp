/*
 * The prototype boundary, made testable: nothing sends or saves without first
 * showing what it will do, and Cancel writes nothing.
 *
 * Both paths are asserted, because only one of them is interesting. Confirm
 * working is table stakes; Cancel invoking absolutely nothing is the promise —
 * FR-22.4 states it for every Assistant Act, and it holds here for every bulk
 * send, escalation and outward status change too.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmGate } from './ConfirmGate'
import type { ConfirmChange } from './ConfirmGate'

const CHANGES: ConfirmChange[] = [
  { key: 'status', label: 'Status', from: 'Awaiting insurer', to: 'Escalated' },
  { key: 'owner', label: 'Assigned to', from: 'Meera Shah', to: 'Back office pool' },
  { key: 'notify', label: 'Notifies', to: 'HDFC Ergo operations desk' },
]

describe('ConfirmGate — the preview', () => {
  it('shows what is about to change, old value and new', () => {
    render(<ConfirmGate title="Escalate this policy" changes={CHANGES} onConfirm={vi.fn()} />)

    expect(screen.getByText('Escalate this policy')).toBeInTheDocument()

    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Awaiting insurer')).toBeInTheDocument()
    expect(screen.getByText('Escalated')).toBeInTheDocument()

    expect(screen.getByText('Assigned to')).toBeInTheDocument()
    expect(screen.getByText('Back office pool')).toBeInTheDocument()

    expect(screen.getByText('Notifies')).toBeInTheDocument()
    expect(screen.getByText('HDFC Ergo operations desk')).toBeInTheDocument()
  })

  it('refuses to gate nothing: with no changes to show, Confirm is not available', () => {
    render(<ConfirmGate title="Escalate this policy" changes={[]} onConfirm={vi.fn()} />)

    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing to preview/i)
  })
})

describe('ConfirmGate — Cancel writes nothing', () => {
  it('never invokes the mutation', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmGate title="Escalate this policy" changes={CHANGES} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('tells the caller it was cancelled, and shows no receipt', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmGate
        title="Escalate this policy"
        changes={CHANGES}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('leaves the preview standing, so the user can still confirm afterwards', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmGate title="Escalate this policy" changes={CHANGES} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByText('Escalated')).toBeInTheDocument()
  })
})

describe('ConfirmGate — Escape', () => {
  it('cancels without invoking the mutation', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const { container } = render(
      <ConfirmGate
        title="Escalate this policy"
        changes={CHANGES}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    const gate = container.querySelector('[data-confirm-gate]')
    expect(gate).not.toBeNull()
    if (gate !== null) fireEvent.keyDown(gate, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('ConfirmGate — Confirm emits once, then shows a receipt', () => {
  it('emits the mutation exactly once', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmGate title="Escalate this policy" changes={CHANGES} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('replaces the preview with the done-state receipt', async () => {
    const user = userEvent.setup()
    render(
      <ConfirmGate
        title="Escalate this policy"
        changes={CHANGES}
        onConfirm={vi.fn()}
        receipt="Escalation sent to the insurer desk"
      />,
    )

    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Escalation sent to the insurer desk')
    // The receipt still says what was done — a receipt with no detail is not a record.
    expect(screen.getByText('Escalated')).toBeInTheDocument()
  })

  it('cannot be double-fired, and Escape after the fact does not undo anything', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const { container } = render(
      <ConfirmGate
        title="Escalate this policy"
        changes={CHANGES}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    const confirm = screen.getByRole('button', { name: /confirm/i })
    await user.click(confirm)
    fireEvent.click(confirm)

    const gate = container.querySelector('[data-confirm-gate]')
    if (gate !== null) fireEvent.keyDown(gate, { key: 'Escape' })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
