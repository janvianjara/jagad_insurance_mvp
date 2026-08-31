/**
 * The shared machine contract — plan §9.
 *
 * Thirteen business machines are described in §9 and they are all the same shape:
 * a frozen state set, an adjacency map from state to state, guards on the edges
 * that encode the PRD's acceptance criteria, and a domain event per edge. Writing
 * that shape thirteen times would produce thirteen slightly different answers to
 * "why was this blocked", which is the one question the UI has to answer well.
 *
 * So the shape lives here once. It is deliberately not a framework: no actors, no
 * async, no side effects beyond emitting on the injected bus. A machine here holds
 * no state of its own — the caller owns the current state and asks whether a move
 * is allowed. That keeps every machine trivially testable and lets the repository
 * layer (P-04) stay the only thing that persists anything.
 *
 * The refusal shape is the point. `canTransition` never returns a bare boolean,
 * because a disabled button with no explanation is how a back office ends up
 * phoning the developer. Every refusal carries prose written for the person
 * looking at the screen, plus the name of the guard that produced it so the audit
 * trail can say which rule fired.
 */

import { eventBus as appEventBus } from '../events'
import type { DomainEvent, DomainEventName, EventBus, EventSubject } from '../events'

export const REFUSAL_CODES = {
  /** The edge does not exist in the adjacency map at all. */
  illegalTransition: 'illegal_transition',
  /** The edge exists, and a guard on it said no. */
  guardBlocked: 'guard_blocked',
  /** The caller named a state this machine does not have. */
  unknownState: 'unknown_state',
} as const

export type RefusalCode = (typeof REFUSAL_CODES)[keyof typeof REFUSAL_CODES]

export type Allowed = { readonly ok: true }

export type Refused = {
  readonly ok: false
  readonly code: RefusalCode
  /** Written to be rendered. Says what is missing and what would fix it. */
  readonly reason: string
  /** The guard function that refused, for the audit timeline. */
  readonly guard?: string
}

export type TransitionResult = Allowed | Refused

const ALLOWED: Allowed = Object.freeze({ ok: true })

export function allow(): Allowed {
  return ALLOWED
}

export function refuse(
  reason: string,
  code: RefusalCode = REFUSAL_CODES.guardBlocked,
): Refused {
  return { ok: false, code, reason }
}

/**
 * A guard is a plain named function so a screen can call it directly to decide
 * whether to disable a control, and so its identifier lands in the refusal
 * without a registration step. Declare guards with `export function name(...)`,
 * never as an arrow assigned to a const, or `fn.name` stops being meaningful.
 */
export type Guard<Ctx> = (ctx: Ctx) => TransitionResult

export type Transition<Ctx> = {
  /** The P-02 event name this edge emits. Every edge emits one: a state change nobody can observe is the silent drop §9 keeps warning about. */
  readonly event: DomainEventName
  /** Follow-on events the same edge fires automatically, e.g. the credentials recipe on KYC completion. */
  readonly alsoEmits?: readonly DomainEventName[]
  /** Run in order; the first refusal wins and the rest are not evaluated. */
  readonly guards?: readonly Guard<Ctx>[]
  /** The §9 line this edge came from, so the spec stays readable next to the code. */
  readonly note?: string
}

/**
 * The adjacency map. The inner keys are exactly the states reachable from the
 * outer key — there is no separate "allowed targets" list to fall out of sync.
 */
export type TransitionTable<S extends string, Ctx> = {
  readonly [From in S]?: { readonly [To in S]?: Transition<Ctx> }
}

export type MachineDefinition<S extends string, Ctx> = {
  readonly name: string
  readonly states: readonly S[]
  readonly initial: S
  readonly transitions: TransitionTable<S, Ctx>
}

export type TransitionOptions = {
  /** Injected so fixtures, tests and the mock adapter each get their own log. */
  readonly bus?: EventBus
  readonly actorId?: string
  readonly subject?: EventSubject
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>
  /**
   * The event that caused this transition, when a recipe caused it — FR-21.5.
   * Stamped onto every event the edge emits, which is what lets the dispatcher's
   * depth guard count a repository write as a hop rather than as a fresh root.
   */
  readonly causedBy?: string
}

export type TransitionOutcome<S extends string> =
  | { readonly ok: true; readonly state: S; readonly events: readonly DomainEvent[] }
  | Refused

export type Machine<S extends string, Ctx> = {
  readonly name: string
  readonly states: readonly S[]
  readonly initial: S
  readonly transitions: TransitionTable<S, Ctx>
  /** Every state reachable from `from`, in declaration order. */
  targetsFrom(from: S): readonly S[]
  /** No outgoing edges. `lost`, `closed`, `locked` and friends. */
  isTerminal(state: S): boolean
  canTransition(from: S, to: S, ctx: Ctx): TransitionResult
  /**
   * Runs the guards and, only if they all pass, emits. A refusal writes nothing
   * and emits nothing — the same posture `<ConfirmGate>` takes in the UI.
   */
  transition(from: S, to: S, ctx: Ctx, options?: TransitionOptions): TransitionOutcome<S>
}

export function createMachine<S extends string, Ctx>(
  definition: MachineDefinition<S, Ctx>,
): Machine<S, Ctx> {
  const { name, states, initial, transitions } = definition
  const known = new Set<string>(states)

  if (!known.has(initial)) {
    throw new Error(`${name}: initial state "${initial}" is not in the state set.`)
  }

  // A typo in an adjacency map is a business rule that silently never fires, so
  // it fails at module load rather than at the one demo that exercises the edge.
  for (const from of Object.keys(transitions)) {
    if (!known.has(from)) {
      throw new Error(`${name}: transition table has unknown source state "${from}".`)
    }
    for (const to of Object.keys(transitions[from as S] ?? {})) {
      if (!known.has(to)) {
        throw new Error(`${name}: transition ${from} -> ${to} names an unknown target state.`)
      }
    }
  }

  function edgeFor(from: S, to: S): Transition<Ctx> | undefined {
    return transitions[from]?.[to]
  }

  function targetsFrom(from: S): readonly S[] {
    return Object.keys(transitions[from] ?? {}) as S[]
  }

  function canTransition(from: S, to: S, ctx: Ctx): TransitionResult {
    if (!known.has(from)) {
      return refuse(`${name} has no state "${from}".`, REFUSAL_CODES.unknownState)
    }
    if (!known.has(to)) {
      return refuse(`${name} has no state "${to}".`, REFUSAL_CODES.unknownState)
    }

    const edge = edgeFor(from, to)
    if (!edge) {
      const targets = targetsFrom(from)
      const allowed = targets.length > 0 ? targets.join(', ') : 'nothing — this is a final state'
      return refuse(
        `A ${name} in "${from}" cannot move to "${to}". From "${from}" it can go to: ${allowed}.`,
        REFUSAL_CODES.illegalTransition,
      )
    }

    for (const guard of edge.guards ?? []) {
      const verdict = guard(ctx)
      if (!verdict.ok) {
        return { ...verdict, guard: verdict.guard ?? guard.name }
      }
    }

    return ALLOWED
  }

  return {
    name,
    states,
    initial,
    transitions,
    targetsFrom,
    isTerminal(state) {
      return targetsFrom(state).length === 0
    },
    canTransition,
    transition(from, to, ctx, options = {}) {
      const verdict = canTransition(from, to, ctx)
      if (!verdict.ok) return verdict

      const edge = edgeFor(from, to) as Transition<Ctx>
      const bus = options.bus ?? appEventBus
      const names: readonly DomainEventName[] = [edge.event, ...(edge.alsoEmits ?? [])]

      const events = names.map((eventName) =>
        bus.emit(eventName, {
          actorId: options.actorId,
          subject: options.subject,
          detail: { ...options.detail, from, to },
          causedBy: options.causedBy,
        }),
      )

      return { ok: true, state: to, events }
    },
  }
}

/** Convenience for tests and for a screen that only wants the sentence. */
export function reasonOf(result: TransitionResult): string {
  return result.ok ? '' : result.reason
}
