/**
 * The sweep every machine has to survive.
 *
 * §9's guard bullets are each tested beside their own machine. This file tests
 * the thing none of them can test alone: that an edge nobody drew is refused
 * everywhere, with an explanation, rather than quietly succeeding in the one
 * machine somebody wrote by hand at the end of a long afternoon.
 */

import { describe, expect, it } from 'vitest'
import { isDomainEventName } from '../events'
import { REFUSAL_CODES } from './machine'
import type { Machine } from './machine'
import { inquiryMachine } from './inquiry'
import { quotationMachine } from './quotation'
import { dealMachine } from './deal'
import { policyMachine } from './policy'
import { consentMachine, kycMachine } from './kycConsent'
import { collectionMachine } from './collection'
import { claimMachine } from './claim'
import { renewalTaskMachine } from './renewalTask'
import { noticeBatchMachine, noticeRowMachine } from './noticeBatch'
import { premiumScheduleMachine } from './premiumSchedule'
import { instalmentMachine } from './instalment'
import { mandateMachine } from './mandate'
import { endorsementMachine } from './endorsement'

type AnyMachine = Machine<string, unknown>

const MACHINES: readonly AnyMachine[] = [
  inquiryMachine,
  quotationMachine,
  dealMachine,
  policyMachine,
  kycMachine,
  consentMachine,
  collectionMachine,
  claimMachine,
  renewalTaskMachine,
  noticeBatchMachine,
  noticeRowMachine,
  premiumScheduleMachine,
  instalmentMachine,
  mandateMachine,
  endorsementMachine,
] as unknown as readonly AnyMachine[]

/** Guards never run on an edge that does not exist, so the context is irrelevant here. */
const NO_CONTEXT = {} as unknown

function edgesOf(machine: AnyMachine): { from: string; to: string }[] {
  return Object.entries(machine.transitions).flatMap(([from, targets]) =>
    Object.keys(targets ?? {}).map((to) => ({ from, to })),
  )
}

describe('every §9 machine', () => {
  it('covers the thirteen machines §9 describes', () => {
    expect(MACHINES.map((machine) => machine.name)).toEqual([
      'inquiry',
      'quotation',
      'deal',
      'policy',
      'kyc',
      'consent',
      'collection',
      'claim',
      'renewalTask',
      'noticeBatch',
      'noticeRow',
      'premiumSchedule',
      'instalment',
      'mandate',
      'endorsement',
    ])
  })

  it.each(MACHINES.map((machine) => [machine.name, machine] as const))(
    '%s rejects every transition that is not in its adjacency map',
    (_name, machine) => {
      const drawn = new Set(edgesOf(machine).map((edge) => `${edge.from}->${edge.to}`))
      let checked = 0

      for (const from of machine.states) {
        for (const to of machine.states) {
          if (drawn.has(`${from}->${to}`)) continue

          const verdict = machine.canTransition(from, to, NO_CONTEXT)
          checked += 1

          expect(verdict.ok).toBe(false)
          expect(verdict.ok === false && verdict.code).toBe(REFUSAL_CODES.illegalTransition)
          expect(verdict.ok === false && verdict.reason).toContain(machine.name)
        }
      }

      expect(checked).toBeGreaterThan(0)
    },
  )

  it.each(MACHINES.map((machine) => [machine.name, machine] as const))(
    '%s refuses a state it does not have, in either position',
    (_name, machine) => {
      const from = machine.initial
      const nonsense = 'not_a_state_in_this_machine'

      expect(machine.canTransition(from, nonsense, NO_CONTEXT)).toMatchObject({
        ok: false,
        code: REFUSAL_CODES.unknownState,
      })
      expect(machine.canTransition(nonsense, from, NO_CONTEXT)).toMatchObject({
        ok: false,
        code: REFUSAL_CODES.unknownState,
      })
    },
  )

  it.each(MACHINES.map((machine) => [machine.name, machine] as const))(
    '%s emits a P-02 event name on every edge it draws',
    (_name, machine) => {
      const edges = edgesOf(machine)
      expect(edges.length).toBeGreaterThan(0)

      for (const { from, to } of edges) {
        const edge = machine.transitions[from]?.[to]
        expect(edge).toBeDefined()
        expect(isDomainEventName(edge?.event ?? '')).toBe(true)

        for (const followOn of edge?.alsoEmits ?? []) {
          expect(isDomainEventName(followOn)).toBe(true)
        }
      }
    },
  )

  it.each(MACHINES.map((machine) => [machine.name, machine] as const))(
    '%s can reach every state it declares from its initial state',
    (_name, machine) => {
      const reached = new Set<string>([machine.initial])
      const queue = [machine.initial]

      while (queue.length > 0) {
        const current = queue.shift() as string
        for (const next of machine.targetsFrom(current)) {
          if (reached.has(next)) continue
          reached.add(next)
          queue.push(next)
        }
      }

      const unreachable = machine.states.filter((state) => !reached.has(state))
      expect(unreachable).toEqual([])
    },
  )

  it.each(MACHINES.map((machine) => [machine.name, machine] as const))(
    '%s starts at a state it declares',
    (_name, machine) => {
      expect(machine.states).toContain(machine.initial)
    },
  )
})
