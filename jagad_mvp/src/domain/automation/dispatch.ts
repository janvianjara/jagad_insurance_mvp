/**
 * The dispatcher — plan §7, FR-21, FR-21.5.
 *
 * `ticks.ts` is the time half of FR-21 and has been testable since it was
 * written. This is the other half, and its absence is why twelve recipes seeded
 * `active` against real triggers have never once run: `src/domain/events.ts` has
 * carried `on` and `onAny` since P-02, and the only production subscriber in the
 * tree is the audit sink. A recipe row said what should happen and nothing was
 * listening, so switching a recipe on changed what a screen read and nothing
 * else. This is the subscriber.
 *
 * ## What it is not
 *
 * It is not a rules engine. A recipe's action is a function the data layer
 * supplies — the bounce follow-up calls `TaskRepository.create`, which runs the
 * same guards a person's button press runs. Automation is a caller of the
 * machines, never a peer of them, and that is what stops it becoming the one path
 * in the system that reaches a customer without passing a guard.
 *
 * ## Depth, and why it is counted on the event rather than the call stack
 *
 * Recipes emit, and what they emit can trigger recipes: `task.escalated` triggers
 * a recipe that raises a task that emits `task.created` that triggers another.
 * The obvious guard is a counter on the call stack, and it is wrong here, because
 * an action is async — it awaits a repository — so by the time it emits, the
 * stack that would have carried the counter has unwound.
 *
 * So causality is carried on the events themselves. Every event a recipe causes —
 * whether it emitted it directly or a repository emitted it on the recipe's
 * behalf — sets `causedBy` to its trigger's id, and the dispatcher keeps a note
 * of what a given trigger's effects are worth: which depth they sit at, and which
 * chain of recipe keys reached them. Depth survives an await, a queue and a
 * resume, because it is a fact about the event rather than about the process that
 * made it.
 *
 * The note is written BEFORE the action runs, and that ordering is the whole
 * mechanism. `bus.emit` is synchronous and named subscribers run inside it, so an
 * event a repository emits mid-action reaches this dispatcher again before the
 * action has returned. Attributing effects afterwards would therefore attribute
 * them too late — the second run would already have been handled as a root, at
 * depth zero, and the guard would never close.
 *
 * Beyond `MAX_CHAIN_DEPTH` the run is refused — not dropped. A refused run is a
 * ledger row carrying the chain that produced it, because "why did nothing
 * happen?" is a question the ledger has to be able to answer, and an engine that
 * only records its successes cannot.
 */

import type {
  DomainEvent,
  DomainEventName,
  EventBus,
  EventInit,
  EventSubject,
  Unsubscribe,
} from '../events'
import type { AutomationParameters } from './ladder'
import { runKey } from './ledger'

/**
 * How many recipes may fire in one causal chain before the dispatcher stops.
 *
 * Three is deliberately small. A legitimate chain in this product is one or two
 * hops — a bounce raises a task, a task breach escalates — and anything longer is
 * far likelier to be a cycle somebody configured by accident than a workflow
 * somebody designed. The ceiling refuses rather than truncates so the run is
 * visible on `/config/automation` instead of being a silence to debug.
 */
export const MAX_CHAIN_DEPTH = 3

export const RUN_DECISIONS = {
  /** The action ran and the recipe did something. */
  fired: 'fired',
  /** The recipe looked and decided this occurrence was not for it. */
  skipped: 'skipped',
  /** The dispatcher would not let it run: depth, a bad parameter, a throw. */
  refused: 'refused',
} as const

export type RunDecision = (typeof RUN_DECISIONS)[keyof typeof RUN_DECISIONS]

/**
 * What the dispatcher needs to know about a recipe. Structural, so `src/domain`
 * keeps importing no data type: the data layer maps its `Recipe` rows onto this.
 */
export type RecipeBinding = {
  readonly key: string
  readonly version: number
  readonly trigger: DomainEventName
  readonly parameters: AutomationParameters
}

/** What an action may do to the world, handed in so it cannot reach for more. */
export type ActionContext = {
  /** The event that triggered this run. */
  readonly event: DomainEvent
  /** The binding as it stood when this run began — see `bind` on versions. */
  readonly binding: RecipeBinding
  /** The instant the run claims as "now". Never read from a wall clock. */
  readonly clockAt: Date
  /**
   * Emit, with `causedBy` already stamped. An action that reached for the bus
   * directly would produce an event with no parent, and the depth guard would
   * count it as a root — so this is the only emit an action gets.
   */
  readonly emit: (name: DomainEventName, init?: EventInit) => DomainEvent
  /**
   * What to pass as `causedBy` on a repository command. A recipe's real work is
   * a repository call — `TaskRepository.create`, not a bare emit — and the event
   * that call makes has to carry the same parent, or the task a recipe raised
   * looks exactly like a task a person raised.
   */
  readonly cause: string
}

/**
 * What a recipe decided. Deliberately the same allow/refuse-with-a-sentence
 * shape every machine in `src/domain/workflows` returns: a reason is prose
 * written for the person who later asks what the automation did.
 */
export type ActionOutcome = {
  readonly decision: RunDecision
  readonly reason: string
  /** The rung, when a ladder produced this run. Null for a plain trigger. */
  readonly phase?: string | null
}

export type RecipeAction = (context: ActionContext) => Promise<ActionOutcome> | ActionOutcome

/** Actions by recipe key. A recipe with no action here is bound but inert. */
export type ActionRegistry = Readonly<Record<string, RecipeAction>>

/** One row of the FR-21.5 ledger, before the repository numbers it. */
export type RecipeRunDraft = {
  readonly idempotencyKey: string
  readonly recipeKey: string
  readonly recipeVersion: number
  readonly trigger: string
  readonly subject: EventSubject | null
  readonly phase: string | null
  readonly decision: RunDecision
  readonly reason: string
  readonly emitted: readonly DomainEventName[]
  /** When the dispatcher actually ran. */
  readonly evaluatedAt: string
  /** The instant it claimed as "now". The two differ on a catch-up or a replay. */
  readonly clockAt: string
  readonly causedBy: string | null
  /** Recipe keys that led here, oldest first. Empty for a run off a root event. */
  readonly chain: readonly string[]
}

export type RunSink = (draft: RecipeRunDraft) => void | Promise<void>

export type DispatcherOptions = {
  readonly bus: EventBus
  readonly actions: ActionRegistry
  /** Where a run is written. Every evaluation writes exactly one. */
  readonly recordRun: RunSink
  /** The dispatcher's clock. Injected, so a test can sit anywhere on it. */
  readonly now: () => Date
  readonly maxDepth?: number
  /**
   * Where an action's thrown error goes after the refused run is written. A
   * dispatcher that rethrew would take down the emit that triggered it — and the
   * emit is somebody's save.
   */
  readonly onError?: (error: unknown, binding: RecipeBinding) => void
}

export type Dispatcher = {
  /**
   * Reconciles the bus against this set of recipes. Idempotent: call it on boot
   * and again after every config edit.
   */
  bind(recipes: readonly RecipeBinding[]): void
  /** What is currently subscribed. The automation screen reads it. */
  bound(): readonly RecipeBinding[]
  /** Every run this dispatcher has started and not yet finished writing. */
  settled(): Promise<void>
  stop(): void
}

/** What produced an event, when a recipe did. Roots have no entry. */
type Lineage = {
  readonly depth: number
  readonly chain: readonly string[]
}

/**
 * A binding's identity for reconciliation. Version is part of it, because
 * publishing a new version must re-subscribe rather than leave the old closure
 * holding the old parameters.
 */
function bindingId(binding: RecipeBinding): string {
  return `${binding.key}@${binding.version}:${binding.trigger}`
}

function subjectIdOf(event: DomainEvent): string {
  return event.subject?.id ?? 'none'
}

export function createDispatcher(options: DispatcherOptions): Dispatcher {
  const { bus, actions, recordRun, now, onError } = options
  const maxDepth = options.maxDepth ?? MAX_CHAIN_DEPTH

  const subscriptions = new Map<string, { binding: RecipeBinding; off: Unsubscribe }>()

  /**
   * What a trigger's effects are worth, keyed by the TRIGGER's id rather than by
   * the effect's — which is what lets one note cover an event the action emitted
   * and an event a repository emitted on its behalf, without either of them
   * having to be predicted.
   *
   * Root events are absent and read as depth zero, so this grows with automation
   * activity rather than with the whole event log.
   *
   * Two recipes on one trigger both write here, and the second wins. The depth is
   * identical either way — that is what the guard reads — so the cost is that a
   * chain may name the sibling recipe rather than the one that emitted. Worth
   * knowing when reading a refused run; not worth a second index to fix.
   */
  const effectsOf = new Map<string, Lineage>()

  /** In-flight runs, so a test can await the engine rather than sleep on it. */
  const pending = new Set<Promise<void>>()

  function track(work: Promise<void>): void {
    pending.add(work)
    void work.finally(() => pending.delete(work))
  }

  /** Where this event sits: what its cause was already worth. */
  function lineageOf(event: DomainEvent): Lineage {
    if (event.causedBy === undefined) return { depth: 0, chain: [] }
    return effectsOf.get(event.causedBy) ?? { depth: 0, chain: [] }
  }

  function write(draft: RecipeRunDraft): void {
    const written = recordRun(draft)
    if (written instanceof Promise) track(written)
  }

  function handle(binding: RecipeBinding, event: DomainEvent): void {
    const clockAt = now()
    const evaluatedAt = clockAt.toISOString()
    const parent = lineageOf(event)
    const chain = [...parent.chain, binding.key]

    const base = {
      idempotencyKey: runKey({
        recipeKey: binding.key,
        recipeVersion: binding.version,
        subjectId: subjectIdOf(event),
        phase: null,
        occurrence: event.id,
      }),
      recipeKey: binding.key,
      recipeVersion: binding.version,
      trigger: event.name,
      subject: event.subject ?? null,
      evaluatedAt,
      clockAt: evaluatedAt,
      /*
       * The triggering event, not the trigger's own parent. "Which event caused
       * this run" is the question FR-21.5 asks, and `chain` below already
       * carries the ancestry, so pointing one hop further back would lose the
       * only link the ledger cannot reconstruct.
       */
      causedBy: event.id,
      chain,
    } as const

    // The guard runs before the action, not inside it: a recipe that has already
    // been reached three hops deep does not get to decide whether it is too deep.
    if (parent.depth + 1 > maxDepth) {
      write({
        ...base,
        phase: null,
        decision: RUN_DECISIONS.refused,
        reason:
          `This run would be ${parent.depth + 1} recipes deep and the ceiling is ${maxDepth}. ` +
          `The chain that reached it was ${chain.join(' → ')}. ` +
          'Nothing was written and nothing was sent; a chain this long is almost always two recipes triggering each other.',
        emitted: [],
      })
      return
    }

    const action = actions[binding.key]
    if (action === undefined) {
      write({
        ...base,
        phase: null,
        decision: RUN_DECISIONS.skipped,
        reason: `The recipe ${binding.key} is active and subscribed, but no action is registered for it, so this trigger did nothing.`,
        emitted: [],
      })
      return
    }

    /*
     * Everything this run causes is one hop deeper and carries this chain. Noted
     * before the action so that an event a repository emits mid-call — inside a
     * synchronous `bus.emit`, reaching this dispatcher again before the action
     * returns — is already attributable when it arrives.
     */
    effectsOf.set(event.id, { depth: parent.depth + 1, chain })

    const emitted: DomainEventName[] = []
    const context: ActionContext = {
      event,
      binding,
      clockAt,
      cause: event.id,
      emit(name, init = {}) {
        emitted.push(name)
        return bus.emit(name, { ...init, causedBy: event.id })
      },
    }

    const run = (async () => {
      try {
        const outcome = await action(context)
        write({
          ...base,
          phase: outcome.phase ?? null,
          decision: outcome.decision,
          reason: outcome.reason,
          emitted,
        })
      } catch (error) {
        // A thrown action is a refusal with a stack behind it. It is written like
        // any other refusal and then handed on, because swallowing it here would
        // make a broken recipe indistinguishable from an idle one.
        write({
          ...base,
          phase: null,
          decision: RUN_DECISIONS.refused,
          reason: `The recipe ${binding.key} threw while running: ${
            error instanceof Error ? error.message : String(error)
          }`,
          emitted,
        })
        onError?.(error, binding)
      }
    })()

    track(run)
  }

  return {
    bind(recipes) {
      const wanted = new Map(recipes.map((binding) => [bindingId(binding), binding]))

      // Unsubscribe first, in the same call. Deactivating a recipe has to stop it
      // within the tick the admin saved on — a recipe that keeps firing until the
      // next reload is a recipe the switch does not control.
      for (const [id, subscription] of subscriptions) {
        if (wanted.has(id)) continue
        subscription.off()
        subscriptions.delete(id)
      }

      for (const [id, binding] of wanted) {
        if (subscriptions.has(id)) continue
        // The binding is captured here rather than looked up per event, which is
        // what makes an in-flight run keep the version it started under: a
        // publish swaps the subscription, and the run already going holds the old
        // closure until it finishes.
        const off = bus.on(binding.trigger, (event) => handle(binding, event))
        subscriptions.set(id, { binding, off })
      }
    },

    bound() {
      return [...subscriptions.values()].map((subscription) => subscription.binding)
    },

    async settled() {
      // Drained rather than awaited once: a run can start another run, and the
      // set is only empty when the whole chain has come to rest.
      while (pending.size > 0) await Promise.all([...pending])
    },

    stop() {
      for (const subscription of subscriptions.values()) subscription.off()
      subscriptions.clear()
      effectsOf.clear()
    },
  }
}
