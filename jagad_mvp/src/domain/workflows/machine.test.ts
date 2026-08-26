import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { allow, createMachine, refuse, REFUSAL_CODES, reasonOf } from './machine'
import type { TransitionTable } from './machine'

type Light = 'red' | 'amber' | 'green'
type LightContext = { readonly keyTurned: boolean }

function keyIsTurned(ctx: LightContext) {
  return ctx.keyTurned ? allow() : refuse('Turn the key before changing the light.')
}

const TABLE = {
  red: { green: { event: 'task.created', guards: [keyIsTurned] } },
  green: { amber: { event: 'task.completed' } },
  amber: { red: { event: 'task.completed' } },
} as const satisfies TransitionTable<Light, LightContext>

const lights = createMachine<Light, LightContext>({
  name: 'light',
  states: ['red', 'amber', 'green'],
  initial: 'red',
  transitions: TABLE,
})

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => new Date('2026-08-26T09:00:00.000Z') })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

describe('the shared machine contract', () => {
  it('refuses an edge that is not in the adjacency map, and names what is allowed instead', () => {
    const verdict = lights.canTransition('red', 'amber', { keyTurned: true })

    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.code).toBe(REFUSAL_CODES.illegalTransition)
    expect(reasonOf(verdict)).toContain('green')
  })

  it('explains a refusal rather than returning a bare boolean', () => {
    const verdict = lights.canTransition('red', 'green', { keyTurned: false })

    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.code).toBe(REFUSAL_CODES.guardBlocked)
    expect(reasonOf(verdict)).toBe('Turn the key before changing the light.')
  })

  it('names the guard that refused, so the audit trail can say which rule fired', () => {
    const verdict = lights.canTransition('red', 'green', { keyTurned: false })
    expect(verdict.ok === false && verdict.guard).toBe('keyIsTurned')
  })

  it('rejects a state it does not have', () => {
    const verdict = lights.canTransition('red', 'blue' as Light, { keyTurned: true })
    expect(verdict.ok === false && verdict.code).toBe(REFUSAL_CODES.unknownState)
  })

  it('emits the edge event on a permitted transition', () => {
    const { bus, seen } = recordingBus()
    const outcome = lights.transition('red', 'green', { keyTurned: true }, { bus })

    expect(outcome.ok).toBe(true)
    expect(outcome.ok === true && outcome.state).toBe('green')
    expect(seen.map((event) => event.name)).toEqual(['task.created'])
    expect(seen[0].detail).toMatchObject({ from: 'red', to: 'green' })
  })

  it('writes nothing and emits nothing when a guard refuses', () => {
    const { bus, seen } = recordingBus()
    const spy = vi.spyOn(bus, 'emit')

    const outcome = lights.transition('red', 'green', { keyTurned: false }, { bus })

    expect(outcome.ok).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    expect(seen).toHaveLength(0)
  })

  it('reports terminal states and reachable targets', () => {
    expect(lights.targetsFrom('red')).toEqual(['green'])
    expect(lights.isTerminal('red')).toBe(false)
  })

  it('fails at construction when the table names a state the machine does not have', () => {
    expect(() =>
      createMachine<Light, LightContext>({
        name: 'broken',
        states: ['red', 'amber', 'green'],
        initial: 'red',
        transitions: { red: { blue: { event: 'task.created' } } } as unknown as TransitionTable<Light, LightContext>,
      }),
    ).toThrow(/unknown target state/)
  })
})
