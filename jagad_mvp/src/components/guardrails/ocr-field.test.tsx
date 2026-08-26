/*
 * FR-16 / charter U10, made testable: extraction never silent-commits.
 *
 * An OCR read is a machine's opinion. It may be shown, it may be pre-filled into
 * the control, and it may not become a fact until a person says so. The submit
 * block below is a hard block, not a nudge: these tests fire the form's submit
 * event directly as well as clicking the button, because a warning that can be
 * walked past is not a guardrail.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OcrField } from './OcrField'
import { OcrFormProvider, OcrSubmit } from './OcrFormProvider'

const POLICY_NO = { value: 'P/181/2291', confidence: 0.94 }
const INSURED = { value: 'Rakesh Patel', confidence: 0.71 }

function field(container: HTMLElement, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-ocr-field="${name}"]`)
  if (node === null) throw new Error(`No OcrField named ${name} was rendered`)
  return node
}

function TwoFieldForm({ onSubmit }: { onSubmit: () => void }) {
  return (
    <OcrFormProvider onSubmit={onSubmit}>
      <OcrField name="policyNo" label="Policy number" extraction={POLICY_NO} />
      <OcrField name="insured" label="Insured name" extraction={INSURED} />
      <OcrSubmit>Save the policy</OcrSubmit>
    </OcrFormProvider>
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('OcrField — the three states', () => {
  it('extracted: the value is present, unconfirmed, flagged for a person, with its confidence', () => {
    const { container } = render(
      <OcrField name="policyNo" label="Policy number" extraction={POLICY_NO} />,
    )

    const row = field(container, 'policyNo')
    expect(row).toHaveAttribute('data-state', 'extracted')
    expect(row).toHaveAttribute('data-confirmed', 'false')
    // Lime is the charter's "needs a person" colour, and this needs a person.
    expect(row).toHaveAttribute('data-tone', 'attn')

    expect(screen.getByLabelText(/Policy number/)).toHaveValue('P/181/2291')
    expect(within(row).getByText(/94%/)).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /confirm/i })).toBeInTheDocument()
  })

  it('confirmed: a person confirmed it, and the flag comes down', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <OcrField name="policyNo" label="Policy number" extraction={POLICY_NO} />,
    )

    await user.click(within(field(container, 'policyNo')).getByRole('button', { name: /confirm/i }))

    const row = field(container, 'policyNo')
    expect(row).toHaveAttribute('data-state', 'confirmed')
    expect(row).toHaveAttribute('data-confirmed', 'true')
    expect(row).toHaveAttribute('data-tone', 'ok')
    expect(within(row).queryByRole('button', { name: /^confirm$/i })).not.toBeInTheDocument()
  })

  it('edited: the person overrides the read, and what the OCR said survives for audit', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <OcrField name="policyNo" label="Policy number" extraction={POLICY_NO} />,
    )

    const input = screen.getByLabelText(/Policy number/)
    await user.clear(input)
    await user.type(input, 'P/181/2219')

    const row = field(container, 'policyNo')
    expect(row).toHaveAttribute('data-state', 'edited')
    expect(input).toHaveValue('P/181/2219')
    // The original read is kept and shown, not overwritten.
    expect(within(row).getByText('P/181/2291')).toBeInTheDocument()
    expect(row).toHaveAttribute('data-extracted', 'P/181/2291')
  })

  it('an edited value still needs confirming — editing is not confirming', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <OcrField name="policyNo" label="Policy number" extraction={POLICY_NO} />,
    )

    await user.type(screen.getByLabelText(/Policy number/), 'X')
    expect(field(container, 'policyNo')).toHaveAttribute('data-confirmed', 'false')
  })
})

describe('OcrField — confirming is an explicit human act', () => {
  it('does not confirm on mount', () => {
    const { container } = render(
      <OcrField name="policyNo" label="Policy number" extraction={POLICY_NO} />,
    )
    expect(field(container, 'policyNo')).toHaveAttribute('data-confirmed', 'false')
  })

  it('does not confirm on blur', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <>
        <OcrField name="policyNo" label="Policy number" extraction={POLICY_NO} />
        <button type="button">Somewhere else</button>
      </>,
    )

    await user.click(screen.getByLabelText(/Policy number/))
    await user.click(screen.getByRole('button', { name: 'Somewhere else' }))

    expect(field(container, 'policyNo')).toHaveAttribute('data-confirmed', 'false')
  })

  it('does not confirm on a timer, however long it is left alone', async () => {
    vi.useFakeTimers()
    const { container } = render(
      <OcrField name="policyNo" label="Policy number" extraction={POLICY_NO} />,
    )

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

    expect(field(container, 'policyNo')).toHaveAttribute('data-confirmed', 'false')
    expect(field(container, 'policyNo')).toHaveAttribute('data-state', 'extracted')
  })

  it('reports the confirmation upward once, with the original read attached', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <OcrField
        name="policyNo"
        label="Policy number"
        extraction={POLICY_NO}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'policyNo',
      state: 'confirmed',
      value: 'P/181/2291',
      extracted: 'P/181/2291',
      confidence: 0.94,
      confirmed: true,
    })
  })
})

describe('OcrFormProvider — a form with an unconfirmed extraction cannot submit', () => {
  it('blocks the submit button and says how many values are waiting', () => {
    const onSubmit = vi.fn()
    render(<TwoFieldForm onSubmit={onSubmit} />)

    expect(screen.getByRole('button', { name: /Save the policy/ })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/2 extracted values need confirming/i)
  })

  it('does not run the mutation when the form is submitted around the button', () => {
    const onSubmit = vi.fn()
    const { container } = render(<TwoFieldForm onSubmit={onSubmit} />)

    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    if (form !== null) fireEvent.submit(form)

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('still blocks when only some of the fields are confirmed', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { container } = render(<TwoFieldForm onSubmit={onSubmit} />)

    await user.click(within(field(container, 'policyNo')).getByRole('button', { name: /confirm/i }))

    expect(screen.getByRole('button', { name: /Save the policy/ })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/1 extracted value needs confirming/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('lifts the block once every extracted value has been confirmed', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { container } = render(<TwoFieldForm onSubmit={onSubmit} />)

    await user.click(within(field(container, 'policyNo')).getByRole('button', { name: /confirm/i }))
    await user.click(within(field(container, 'insured')).getByRole('button', { name: /confirm/i }))

    const submit = screen.getByRole('button', { name: /Save the policy/ })
    expect(submit).toBeEnabled()

    await user.click(submit)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('lets a form with no extraction in it submit normally', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <OcrFormProvider onSubmit={onSubmit}>
        <OcrSubmit>Save</OcrSubmit>
      </OcrFormProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
