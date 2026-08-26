import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Badge } from './Badge'
import { CountChip } from './CountChip'
import { StatusPill } from './StatusPill'
import { StatusStripe } from './StatusStripe'
import { Tag } from './Tag'
import { SEVERITIES } from '../tone'

describe('StatusStripe', () => {
  it('maps every severity onto its charter token', () => {
    expect(SEVERITIES).toEqual({ hot: 'bad', warm: 'warn', cool: 'info', good: 'ok', attn: 'attn' })
  })

  it('paints the mapped tone', () => {
    const { container } = render(<StatusStripe severity="hot" />)
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'bad')
  })

  it('stays out of the accessibility tree unless it is given a name', () => {
    const { container } = render(<StatusStripe severity="warm" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    render(<StatusStripe severity="warm" label="At risk" />)
    expect(screen.getByRole('img', { name: 'At risk' })).toBeInTheDocument()
  })
})

describe('StatusPill and Badge', () => {
  it('states the status in words as well as in colour', () => {
    render(<StatusPill tone="bad">Escalated</StatusPill>)
    expect(screen.getByText('Escalated')).toBeInTheDocument()
  })

  it('defaults a badge to a neutral label rather than a status', () => {
    const { container } = render(<Badge>Retail</Badge>)
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'neutral')
  })
})

describe('CountChip', () => {
  it('names what it counts for assistive tech', () => {
    render(<CountChip count={12} label="unassigned inquiries" />)
    expect(screen.getByLabelText('12 unassigned inquiries')).toBeInTheDocument()
  })

  it('caps a long count and keeps the exact figure on hover', () => {
    render(<CountChip count={248} label="tasks" />)
    const chip = screen.getByLabelText('248 tasks')
    expect(chip).toHaveTextContent('99+')
    expect(chip).toHaveAttribute('title', '248')
  })
})

describe('Tag', () => {
  it('is read-only until a remove handler is supplied', () => {
    render(<Tag>Health</Tag>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('removes from the keyboard', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(
      <Tag onRemove={onRemove} removeLabel="Remove filter: unassigned">
        Unassigned
      </Tag>,
    )

    await user.tab()
    expect(screen.getByRole('button', { name: 'Remove filter: unassigned' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
