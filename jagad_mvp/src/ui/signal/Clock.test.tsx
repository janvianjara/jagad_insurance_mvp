import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Clock } from './Clock'
import { readClock } from './clock-reading'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** Every assertion below reads against this fixed moment. */
const NOW = new Date('2026-08-26T11:30:00')

function hoursBefore(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR)
}

describe('readClock — turnaround', () => {
  it('is healthy while most of the allowance is left', () => {
    const reading = readClock({ mode: 'tat', start: hoursBefore(2), now: NOW, durationMs: 24 * HOUR })
    expect(reading.tone).toBe('ok')
    expect(reading.breached).toBe(false)
    expect(reading.text).toBe('due in 22 hours')
  })

  it('warns once the remaining time falls inside the warning share', () => {
    const reading = readClock({ mode: 'tat', start: hoursBefore(20), now: NOW, durationMs: 24 * HOUR })
    expect(reading.tone).toBe('warn')
    expect(reading.breached).toBe(false)
  })

  it('takes the warning share as a parameter too', () => {
    const nearly = { mode: 'tat', start: hoursBefore(20), now: NOW, durationMs: 24 * HOUR } as const
    expect(readClock({ ...nearly, warnFraction: 0.05 }).tone).toBe('ok')
    expect(readClock({ ...nearly, warnFraction: 0.9 }).tone).toBe('warn')
  })

  it('reads as breached once the allowance has run out', () => {
    const reading = readClock({ mode: 'tat', start: hoursBefore(30), now: NOW, durationMs: 24 * HOUR })
    expect(reading.tone).toBe('bad')
    expect(reading.breached).toBe(true)
    expect(reading.text).toBe('breached by 6 hours')
    expect(reading.remainingMs).toBeLessThan(0)
  })

  it('measures against the allowance it is given, not against a constant', () => {
    const start = hoursBefore(30)
    expect(readClock({ mode: 'tat', start, now: NOW, durationMs: 24 * HOUR }).breached).toBe(true)
    expect(readClock({ mode: 'tat', start, now: NOW, durationMs: 72 * HOUR }).breached).toBe(false)
  })
})

describe('readClock — grace', () => {
  it('is a warning for as long as the window is open', () => {
    const reading = readClock({ mode: 'grace', start: hoursBefore(6 * 24), now: NOW, durationMs: 30 * DAY })
    expect(reading.tone).toBe('warn')
    expect(reading.text).toBe('grace ends in 24 days')
  })

  it('turns bad once the window has closed', () => {
    const reading = readClock({ mode: 'grace', start: hoursBefore(40 * 24), now: NOW, durationMs: 30 * DAY })
    expect(reading.tone).toBe('bad')
    expect(reading.breached).toBe(true)
    expect(reading.text).toBe('grace ended 10 days ago')
  })
})

describe('readClock — aging', () => {
  it('is idle while nobody has promised anything', () => {
    const reading = readClock({ mode: 'aging', start: hoursBefore(9), now: NOW })
    expect(reading.tone).toBe('idle')
    expect(reading.text).toBe('waiting 9 hours')
    expect(reading.remainingMs).toBeNull()
  })

  it('asks for a person once the threshold it was given has passed', () => {
    const reading = readClock({ mode: 'aging', start: hoursBefore(9), now: NOW, durationMs: 4 * HOUR })
    expect(reading.tone).toBe('attn')
    expect(reading.breached).toBe(false)
  })

  it('stays idle while inside that threshold', () => {
    const reading = readClock({ mode: 'aging', start: hoursBefore(2), now: NOW, durationMs: 4 * HOUR })
    expect(reading.tone).toBe('idle')
  })
})

describe('Clock', () => {
  it('renders the reading with its tone', () => {
    const { container } = render(
      <Clock mode="tat" start={hoursBefore(30)} durationMs={24 * HOUR} now={NOW} label="TAT" />,
    )
    expect(screen.getByText('breached by 6 hours')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'bad')
    expect(container.firstElementChild).toHaveAttribute('data-breached')
  })

  it('is deterministic: the same injected now renders the same text twice', () => {
    const first = render(
      <Clock mode="aging" start={hoursBefore(9)} now={NOW} />,
    ).container.textContent
    const second = render(
      <Clock mode="aging" start={hoursBefore(9)} now={NOW} />,
    ).container.textContent
    expect(first).toBe(second)
  })

  it('accepts an ISO start, as the repositories carry it', () => {
    render(<Clock mode="tat" start="2026-08-26T09:30:00" durationMs={24 * HOUR} now={NOW} />)
    expect(screen.getByText('due in 22 hours')).toBeInTheDocument()
  })
})
