import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CascadeSelect } from './CascadeSelect'
import type { CascadeNode } from './CascadeSelect'
import { Checkbox } from './Checkbox'
import { Combobox } from './Combobox'
import { DatePicker } from './DatePicker'
import { Field } from './Field'
import { FileDrop } from './FileDrop'
import { Input } from './Input'
import { NumberInput } from './NumberInput'
import { RadioGroup } from './RadioGroup'
import { QuickAdd, QuickAddForm } from './QuickAdd'
import { Select } from './Select'
import { Textarea } from './Textarea'
import { Toggle } from './Toggle'

const INSURERS = [
  { value: 'hdfc-ergo', label: 'HDFC Ergo', hint: 'General' },
  { value: 'niva-bupa', label: 'Niva Bupa', hint: 'Health' },
  { value: 'bajaj-allianz', label: 'Bajaj Allianz', hint: 'General' },
]

const CATALOGUE: CascadeNode[] = [
  {
    value: 'hdfc-ergo',
    label: 'HDFC Ergo',
    children: [
      { value: 'optima-secure', label: 'Optima Secure' },
      { value: 'motor-private', label: 'Private Car OD' },
    ],
  },
  {
    value: 'niva-bupa',
    label: 'Niva Bupa',
    children: [{ value: 'reassure', label: 'ReAssure 2.0' }],
  },
]

describe('Field wiring', () => {
  it('labels the control it wraps', () => {
    render(
      <Field label="Customer name">
        <Input />
      </Field>,
    )
    expect(screen.getByLabelText('Customer name')).toBeInTheDocument()
  })

  it('marks the control required and invalid, and announces the message', () => {
    render(
      <Field label="Email" required error="Enter an address the customer will read" hint="Work address">
        <Input />
      </Field>,
    )

    const input = screen.getByLabelText(/Email/)
    expect(input).toBeRequired()
    expect(input).toBeInvalid()

    const message = screen.getByRole('alert')
    expect(message).toHaveTextContent('Enter an address the customer will read')
    expect(input.getAttribute('aria-describedby')).toContain(message.id)
  })

  it('renders no error node at all when the field is clean', () => {
    render(
      <Field label="Email">
        <Input />
      </Field>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Input', () => {
  it('accepts typed text', async () => {
    const user = userEvent.setup()
    render(
      <Field label="Customer name">
        <Input />
      </Field>,
    )

    const input = screen.getByLabelText('Customer name')
    await user.type(input, 'Rakesh Patel')
    expect(input).toHaveValue('Rakesh Patel')
  })
})

describe('Textarea', () => {
  it('accepts typed text', async () => {
    const user = userEvent.setup()
    render(
      <Field label="Call notes">
        <Textarea />
      </Field>,
    )

    const box = screen.getByLabelText('Call notes')
    await user.type(box, 'Wants two options')
    expect(box).toHaveValue('Wants two options')
  })
})

describe('NumberInput', () => {
  it('reports the parsed number', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <Field label="Members covered">
        <NumberInput onValueChange={onValueChange} />
      </Field>,
    )

    await user.type(screen.getByLabelText('Members covered'), '4')
    expect(onValueChange).toHaveBeenLastCalledWith(4)
  })

  it('reports an emptied control as null, not as zero', () => {
    const onValueChange = vi.fn()
    render(
      <Field label="Members covered">
        <NumberInput value={3} onValueChange={onValueChange} />
      </Field>,
    )

    fireEvent.change(screen.getByLabelText('Members covered'), { target: { value: '' } })
    expect(onValueChange).toHaveBeenLastCalledWith(null)
  })
})

describe('Select', () => {
  it('offers the placeholder plus every option and reports the choice', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Field label="Source channel">
        <Select
          placeholder="Not stated"
          options={[
            { value: 'walk-in', label: 'Walk-in' },
            { value: 'referral', label: 'Referral' },
          ]}
          onChange={onChange}
        />
      </Field>,
    )

    const select = screen.getByLabelText('Source channel')
    expect(within(select).getAllByRole('option')).toHaveLength(3)

    await user.selectOptions(select, 'referral')
    expect(select).toHaveValue('referral')
    expect(onChange).toHaveBeenCalled()
  })
})

describe('QuickAdd', () => {
  function Harness({ onEscape }: { onEscape?: () => void }) {
    const [options, setOptions] = useState([{ value: 'kiran', label: 'Kiran Solanki' }])
    const [value, setValue] = useState('')
    const [draft, setDraft] = useState('')

    return (
      <div onKeyDown={() => onEscape?.()}>
        <Field label="Agent">
          <QuickAdd
            label="New agent"
            form={(close) => (
              <QuickAddForm
                onCancel={close}
                onSubmit={() => {
                  setOptions((current) => [...current, { value: 'meera', label: draft }])
                  setValue('meera')
                  close()
                }}
              >
                <Field label="Name">
                  <Input value={draft} onChange={(event) => setDraft(event.target.value)} />
                </Field>
              </QuickAddForm>
            )}
          >
            <Select
              placeholder="No agent"
              options={options}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </QuickAdd>
        </Field>
      </div>
    )
  }

  it('adds the missing option and selects it without unmounting the control', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const select = screen.getByLabelText('Agent')
    expect(within(select).getAllByRole('option')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'New agent' }))
    await user.type(screen.getByLabelText('Name'), 'Meera Joshi')
    // The control the plus belongs to is still on screen while the row is open.
    expect(screen.getByLabelText('Agent')).toBe(select)

    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(within(select).getAllByRole('option')).toHaveLength(3)
    expect(select).toHaveValue('meera')
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('closes on Escape, keeps the key to itself and puts focus back on the plus', async () => {
    const user = userEvent.setup()
    const onEscape = vi.fn()
    render(<Harness onEscape={onEscape} />)

    const trigger = screen.getByRole('button', { name: 'New agent' })
    await user.click(trigger)
    await user.type(screen.getByLabelText('Name'), '{Escape}')

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    // A dialog or drawer around this must not also be dismissed by that Escape.
    expect(onEscape).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })
})

describe('Combobox', () => {
  it('filters as the person types and selects with the keyboard', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Combobox aria-label="Insurer" options={INSURERS} onValueChange={onValueChange} />)

    const input = screen.getByRole('combobox', { name: 'Insurer' })
    expect(input).toHaveAttribute('aria-expanded', 'false')

    await user.type(input, 'niva')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('option')).toHaveLength(1)

    await user.keyboard('{Enter}')
    expect(onValueChange).toHaveBeenCalledWith('niva-bupa')
  })

  it('moves the active option with the arrow keys', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Combobox aria-label="Insurer" options={INSURERS} onValueChange={onValueChange} />)

    const input = screen.getByRole('combobox', { name: 'Insurer' })
    await user.click(input)
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onValueChange).toHaveBeenCalledWith('niva-bupa')
  })

  it('selects with the pointer', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Combobox aria-label="Insurer" options={INSURERS} onValueChange={onValueChange} />)

    await user.click(screen.getByRole('combobox', { name: 'Insurer' }))
    await user.keyboard('{ArrowDown}')
    await user.click(screen.getByRole('option', { name: /Bajaj Allianz/ }))
    expect(onValueChange).toHaveBeenCalledWith('bajaj-allianz')
  })

  it('closes on Escape without choosing anything', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Combobox aria-label="Insurer" options={INSURERS} onValueChange={onValueChange} />)

    const input = screen.getByRole('combobox', { name: 'Insurer' })
    await user.type(input, 'hdfc')
    await user.keyboard('{Escape}')

    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('says so when nothing matches', async () => {
    const user = userEvent.setup()
    render(<Combobox aria-label="Insurer" options={INSURERS} emptyText="No match" />)

    await user.type(screen.getByRole('combobox', { name: 'Insurer' }), 'zzz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('No match')).toBeInTheDocument()
  })
})

function CascadeHarness() {
  const [path, setPath] = useState<string[]>([])
  return (
    <Field label="Catalogue" control="group">
      <CascadeSelect
        nodes={CATALOGUE}
        levels={['Company', 'Product']}
        value={path}
        onValueChange={setPath}
      />
    </Field>
  )
}

describe('CascadeSelect', () => {
  it('unlocks the next level only once its parent is chosen', async () => {
    const user = userEvent.setup()
    render(<CascadeHarness />)

    const company = screen.getByLabelText('Company')
    const product = screen.getByLabelText('Product')
    expect(product).toBeDisabled()

    await user.selectOptions(company, 'hdfc-ergo')
    expect(screen.getByLabelText('Product')).toBeEnabled()
    expect(within(screen.getByLabelText('Product')).getByRole('option', { name: 'Optima Secure' })).toBeInTheDocument()
  })

  it('drops the deeper choice when the level above it changes', async () => {
    const user = userEvent.setup()
    render(<CascadeHarness />)

    await user.selectOptions(screen.getByLabelText('Company'), 'hdfc-ergo')
    await user.selectOptions(screen.getByLabelText('Product'), 'optima-secure')
    expect(screen.getByLabelText('Product')).toHaveValue('optima-secure')

    await user.selectOptions(screen.getByLabelText('Company'), 'niva-bupa')
    expect(screen.getByLabelText('Product')).toHaveValue('')
  })
})

describe('DatePicker', () => {
  it('takes an ISO date and reports the change', () => {
    const onChange = vi.fn()
    render(
      <Field label="Risk start date">
        <DatePicker onChange={onChange} />
      </Field>,
    )

    const input = screen.getByLabelText('Risk start date')
    expect(input).toHaveAttribute('type', 'date')

    fireEvent.change(input, { target: { value: '2026-09-01' } })
    expect(input).toHaveValue('2026-09-01')
    expect(onChange).toHaveBeenCalled()
  })
})

describe('Checkbox', () => {
  it('toggles on click and stays keyboard operable', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox label="Consent recorded" onChange={onChange} />)

    const box = screen.getByRole('checkbox', { name: /Consent recorded/ })
    await user.click(box)
    expect(box).toBeChecked()

    await user.keyboard('{ }')
    expect(box).not.toBeChecked()
  })

  it('carries the indeterminate DOM property, which has no attribute', () => {
    render(<Checkbox label="Select all in queue" indeterminate />)
    const box = screen.getByRole('checkbox', { name: /Select all/ }) as HTMLInputElement
    expect(box.indeterminate).toBe(true)
  })
})

describe('RadioGroup', () => {
  it('is a named group and reports the chosen value', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <RadioGroup
        label="Priority"
        name="priority"
        onValueChange={onValueChange}
        options={[
          { value: 'standard', label: 'Standard' },
          { value: 'urgent', label: 'Urgent' },
        ]}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: 'Priority' })
    expect(within(group).getAllByRole('radio')).toHaveLength(2)

    await user.click(screen.getByRole('radio', { name: 'Urgent' }))
    expect(onValueChange).toHaveBeenCalledWith('urgent')
  })

  it('takes its name from the field around it', () => {
    render(
      <Field label="Payout route" control="group">
        <RadioGroup name="payout" options={[{ value: 'neft', label: 'NEFT' }]} />
      </Field>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Payout route' })).toBeInTheDocument()
  })
})

function ToggleHarness() {
  const [on, setOn] = useState(false)
  return <Toggle checked={on} onCheckedChange={setOn} label="Send renewal reminders" />
}

describe('Toggle', () => {
  it('flips on click', async () => {
    const user = userEvent.setup()
    render(<ToggleHarness />)

    const toggle = screen.getByRole('switch', { name: 'Send renewal reminders' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('flips from the keyboard', async () => {
    const user = userEvent.setup()
    render(<ToggleHarness />)

    await user.tab()
    expect(screen.getByRole('switch', { name: 'Send renewal reminders' })).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.getByRole('switch', { name: 'Send renewal reminders' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})

describe('FileDrop', () => {
  it('is reachable by its label and hands picked files to the caller', async () => {
    const user = userEvent.setup()
    const onFiles = vi.fn()
    render(<FileDrop onFiles={onFiles} />)

    const input = screen.getByLabelText(/or browse/)
    const file = new File(['policy'], 'policy.pdf', { type: 'application/pdf' })
    await user.upload(input, file)

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0][0][0].name).toBe('policy.pdf')
  })

  it('accepts a dropped file', () => {
    const onFiles = vi.fn()
    const { container } = render(<FileDrop onFiles={onFiles} />)
    const zone = container.firstElementChild as HTMLElement
    const file = new File(['cheque'], 'cheque.jpg', { type: 'image/jpeg' })

    fireEvent.dragOver(zone)
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0][0][0].name).toBe('cheque.jpg')
  })

  it('ignores a drop while disabled', () => {
    const onFiles = vi.fn()
    const { container } = render(<FileDrop onFiles={onFiles} disabled />)
    const zone = container.firstElementChild as HTMLElement
    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] },
    })
    expect(onFiles).not.toHaveBeenCalled()
  })
})

describe('FileDrop states what it accepts', () => {
  /*
   * The browser enforces `accept` by dimming every other file in the picker and
   * explaining nothing. A person whose folder held no PDF opened the dialog,
   * found everything grey, and reported the upload as having "no way to add
   * files" — nothing was broken, the field simply never said what it wanted.
   */
  it('derives the terms from the accept attribute', () => {
    render(<FileDrop accept="application/pdf,image/*" />)

    expect(screen.getByText('PDF or image')).toBeInTheDocument()
  })

  it('lets an explicit hint win over the derived one', () => {
    render(<FileDrop accept="application/pdf" hint="The insurer's own schedule" />)

    expect(screen.getByText("The insurer's own schedule")).toBeInTheDocument()
    expect(screen.queryByText('PDF only')).not.toBeInTheDocument()
  })

  it('says nothing when the field takes anything', () => {
    const { container } = render(<FileDrop />)

    expect(container.textContent).not.toMatch(/only|or image/)
  })
})
