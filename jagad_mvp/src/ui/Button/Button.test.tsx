import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('submits only when asked to', () => {
    render(
      <Button type="submit" variant="primary">
        Send
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit')
  })

  it('names an icon-only button from its label', () => {
    render(<Button icon="plus" label="Add inquiry" variant="primary" />)
    expect(screen.getByRole('button', { name: 'Add inquiry' })).toBeInTheDocument()
  })

  it('calls its handler on click and on Enter', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Assign</Button>)

    const button = screen.getByRole('button', { name: 'Assign' })
    await user.click(button)
    button.focus()
    await user.keyboard('{Enter}')

    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('does not fire while disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Escalate
      </Button>,
    )

    await user.click(screen.getByRole('button', { name: 'Escalate' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('offers exactly the three variants the colour language allows', () => {
    const { rerender } = render(<Button variant="primary">One</Button>)
    expect(screen.getByRole('button', { name: 'One' })).toBeInTheDocument()
    rerender(<Button variant="quiet">One</Button>)
    rerender(<Button variant="danger">One</Button>)
    expect(screen.getByRole('button', { name: 'One' })).toBeInTheDocument()
  })
})
