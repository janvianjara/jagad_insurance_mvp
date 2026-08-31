/**
 * The automation runtime — FR-21, plan §7.
 *
 * The composition root for everything the dispatcher, the clock and the actions
 * need, and nothing more. One call starts the engine; one call stops it. The
 * pieces stay separable because each was written to be — this file is the only
 * place that knows they belong together.
 *
 * ## Boot order matters, once
 *
 * The dispatcher binds before the clock starts. Binding is what puts subscribers
 * on the bus, and the clock's first act is to emit; a clock that started first
 * would emit `renewal.due` into an empty room, record a fired run for it, and —
 * because the key carries no timestamp — never fire that rung again. One rung
 * lost per boot, silently, is precisely the class of bug the ledger exists to
 * make impossible, so the order is asserted rather than assumed.
 */

import { createDispatcher } from '../../domain/automation'
import type { Dispatcher, RecipeBinding } from '../../domain/automation'
import { isDomainEventName } from '../../domain/events'
import type { Repositories } from '../repo'
import type { MockStore } from '../mock/store'
import { createActions } from './actions'
import { createClock, localStorageLease } from './clock'
import type { Clock, TickReport } from './clock'
import { currentAutomation, setCurrentAutomation } from './handle'
import { createOutbox } from './outbox'
import type { Outbox } from './outbox'
import { createRecipientResolver } from './recipients'

export const CLOCK_LEASE_KEY = 'jagad.automation.clock'

export type AutomationRuntime = {
  readonly dispatcher: Dispatcher
  readonly clock: Clock
  /** What the engine has prepared and a person has not released yet. */
  readonly outbox: Outbox
  /** Re-reads the recipes and reconciles the bus. Call after a config edit. */
  rebind(): Promise<readonly RecipeBinding[]>
  /**
   * Moves the engine's clock forward and evaluates — the demo affordance.
   *
   * It is an offset rather than a fake clock, so the engine stays on the same
   * instant everything else in the app reads plus a delta a presenter chose. The
   * offset is never negative: rewinding would put the ledger in front of the
   * clock, and a run recorded in the future is a row nobody can reason about.
   */
  advance(days: number): Promise<TickReport>
  /** Days the demo control has added. Zero in the ordinary case. */
  offsetDays(): number
  stop(): void
}

export type AutomationOptions = {
  readonly repositories: Repositories
  readonly store: MockStore
  /** This tab's identity for the clock lease. */
  readonly nodeId: string
  /**
   * The engine's clock. Defaults to the store's, which a test pins so two runs
   * produce two identical ledgers. The app passes the wall clock instead: the
   * lease's TTL is meaningless against a frozen instant, and `isOverdue` in the
   * task view already measures lateness against `new Date()` — an engine on a
   * different clock from the screens would chase rows the screens call on time.
   */
  readonly now?: () => Date
  /** Start the interval. A test drives `clock.tick()` by hand instead. */
  readonly autoStart?: boolean
  readonly ttlMs?: number
  readonly ignoreQuietHours?: boolean
  readonly onError?: (error: unknown, binding: RecipeBinding) => void
}

/**
 * A recipe row as the dispatcher needs it, or null when it cannot be bound.
 *
 * A trigger that is not a `DomainEventName` is the one case worth naming: recipe
 * triggers are strings an admin can type, and a typo would otherwise subscribe to
 * a name nothing ever emits — which looks exactly like a recipe that is working
 * and waiting.
 */
function bindingOf(recipe: {
  readonly key: string
  readonly version: number
  readonly trigger: string
  readonly parameters: Readonly<Record<string, string | number | boolean>>
  readonly active: boolean
}): RecipeBinding | null {
  if (!recipe.active) return null
  if (!isDomainEventName(recipe.trigger)) return null
  return {
    key: recipe.key,
    version: recipe.version,
    trigger: recipe.trigger,
    parameters: recipe.parameters,
  }
}

const DAY_MS = 86_400_000

export function startAutomation(options: AutomationOptions): AutomationRuntime {
  const { repositories, store, nodeId } = options
  const base = options.now ?? store.now

  /*
   * The demo offset. Held here rather than inside the clock because the
   * dispatcher reads the same instant: a presenter who moves time forward has to
   * move it for the actions too, or a renewal rung fires at the future date and
   * the message it prepares is stamped with today's.
   */
  let offsetMs = 0
  const now = () => new Date(base().getTime() + offsetMs)

  const outbox = createOutbox({ bus: store.bus })

  const dispatcher = createDispatcher({
    bus: store.bus,
    actions: createActions({
      tasks: repositories.tasks,
      outbox,
      recipientOf: createRecipientResolver({
        customers: repositories.customers,
        policies: repositories.policies,
        quotations: repositories.quotations,
        claims: repositories.claims,
        renewals: repositories.renewals,
      }),
      ...(options.ignoreQuietHours === true ? { quietHours: [] } : {}),
    }),
    now,
    onError: options.onError,
    async recordRun(draft) {
      await repositories.recipeRuns.record({
        idempotencyKey: draft.idempotencyKey,
        recipeKey: draft.recipeKey,
        recipeVersion: draft.recipeVersion,
        trigger: draft.trigger,
        subjectEntity: draft.subject?.entity ?? null,
        subjectId: draft.subject?.id ?? null,
        phase: draft.phase,
        decision: draft.decision,
        reason: draft.reason,
        emitted: draft.emitted,
        evaluatedAt: draft.evaluatedAt,
        clockAt: draft.clockAt,
        causedBy: draft.causedBy,
        chain: draft.chain,
      })
    },
  })

  const clock = createClock({
    bus: store.bus,
    renewals: repositories.renewals,
    customers: repositories.customers,
    inquiries: repositories.inquiries,
    tasks: repositories.tasks,
    recipeRuns: repositories.recipeRuns,
    recipes: () => repositories.config.recipes(),
    now,
    storage: localStorageLease(CLOCK_LEASE_KEY),
    nodeId,
    ttlMs: options.ttlMs,
    ignoreQuietHours: options.ignoreQuietHours,
  })

  async function rebind(): Promise<readonly RecipeBinding[]> {
    const recipes = await repositories.config.recipes()
    const bindings = recipes.map(bindingOf).filter((binding) => binding !== null)
    dispatcher.bind(bindings)
    return bindings
  }

  // Subscribers first, then the clock — see the note at the top of this file.
  void rebind().then(() => {
    if (options.autoStart === true) clock.start()
  })

  const runtime: AutomationRuntime = {
    dispatcher,
    clock,
    outbox,
    rebind,

    async advance(days) {
      if (days > 0) offsetMs += days * DAY_MS
      // Rebind first: a recipe switched on since the last tick has to be
      // subscribed before the tick emits, or the trigger lands in an empty room
      // and the rung key is consumed for nothing. Same argument as boot order.
      await rebind()
      const report = await clock.tick()
      await dispatcher.settled()
      return report
    },

    offsetDays() {
      return Math.round(offsetMs / DAY_MS)
    },

    stop() {
      clock.stop()
      dispatcher.stop()
      // Only if this is still the registered one. Two providers mounting and
      // unmounting out of order must not leave a screen holding a stopped engine
      // while a live one is running underneath it.
      if (currentAutomation() === runtime) setCurrentAutomation(null)
    },
  }

  setCurrentAutomation(runtime)

  return runtime
}
