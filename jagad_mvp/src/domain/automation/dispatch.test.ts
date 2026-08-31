import { describe, expect, it, vi } from 'vitest'

import { createEventBus } from '../events'
import type { EventBus } from '../events'
import { MAX_CHAIN_DEPTH, RUN_DECISIONS, createDispatcher } from './dispatch'
import type { ActionRegistry, RecipeBinding, RecipeRunDraft } from './dispatch'

const NOW = () => new Date('2026-08-30T09:00:00.000Z')

function harness(actions: ActionRegistry, options: { readonly maxDepth?: number } = {}) {
  const bus: EventBus = createEventBus({ now: NOW })
  const runs: RecipeRunDraft[] = []
  const dispatcher = createDispatcher({
    bus,
    actions,
    now: NOW,
    maxDepth: options.maxDepth,
    recordRun: (draft) => {
      runs.push(draft)
    },
  })
  return { bus, runs, dispatcher }
}

const bounce: RecipeBinding = {
  key: 'collection.bounceFollowUp',
  version: 1,
  trigger: 'cheque.bounced',
  parameters: { dueInDays: 1 },
}

const fires = (reason = 'did the thing') => ({ decision: RUN_DECISIONS.fired, reason })

describe('binding recipes to the bus', () => {
  it('runs an active recipe when its trigger fires — the thing that has never happened', async () => {
    const action = vi.fn(() => fires())
    const { bus, dispatcher, runs } = harness({ 'collection.bounceFollowUp': action })

    dispatcher.bind([bounce])
    bus.emit('cheque.bounced', { subject: { entity: 'CollectionRecord', id: 'col-0001' } })
    await dispatcher.settled()

    expect(action).toHaveBeenCalledTimes(1)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      recipeKey: 'collection.bounceFollowUp',
      recipeVersion: 1,
      trigger: 'cheque.bounced',
      decision: RUN_DECISIONS.fired,
      subject: { entity: 'CollectionRecord', id: 'col-0001' },
    })
  })

  it('leaves other triggers alone', async () => {
    const action = vi.fn(() => fires())
    const { bus, dispatcher } = harness({ 'collection.bounceFollowUp': action })

    dispatcher.bind([bounce])
    bus.emit('policy.issued')
    await dispatcher.settled()

    expect(action).not.toHaveBeenCalled()
  })

  it('never registers through the audit seam, so no recipe can act on an unlogged event', () => {
    const bus = createEventBus({ now: NOW })
    const onAudit = vi.spyOn(bus, 'onAudit')
    const on = vi.spyOn(bus, 'on')

    createDispatcher({ bus, actions: {}, now: NOW, recordRun: () => {} }).bind([bounce])

    expect(on).toHaveBeenCalledWith('cheque.bounced', expect.any(Function))
    expect(onAudit).not.toHaveBeenCalled()
  })

  it('unsubscribes a deactivated recipe within the same tick', async () => {
    const action = vi.fn(() => fires())
    const { bus, dispatcher } = harness({ 'collection.bounceFollowUp': action })

    dispatcher.bind([bounce])
    // Deactivation reaches the dispatcher as an absence, exactly as it reaches a
    // read: an inactive recipe is not in the set the runtime hands over.
    dispatcher.bind([])
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(action).not.toHaveBeenCalled()
    expect(dispatcher.bound()).toEqual([])
  })

  it('re-subscribes at the new version when one is published, and runs it once', async () => {
    const seen: number[] = []
    const { bus, dispatcher } = harness({
      'collection.bounceFollowUp': (context) => {
        seen.push(context.binding.version)
        return fires()
      },
    })

    dispatcher.bind([bounce])
    dispatcher.bind([{ ...bounce, version: 2, parameters: { dueInDays: 3 } }])
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(seen).toEqual([2])
    expect(dispatcher.bound()).toEqual([
      { ...bounce, version: 2, parameters: { dueInDays: 3 } },
    ])
  })

  it('leaves an in-flight run on the version it started under', async () => {
    let release: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      release = resolve
    })
    let capturedVersion = 0

    const { bus, dispatcher } = harness({
      'collection.bounceFollowUp': async (context) => {
        await started
        capturedVersion = context.binding.version
        return fires()
      },
    })

    dispatcher.bind([bounce])
    bus.emit('cheque.bounced')
    // The publish lands while the run is still awaiting.
    dispatcher.bind([{ ...bounce, version: 9 }])
    release()
    await dispatcher.settled()

    expect(capturedVersion).toBe(1)
  })

  it('binding twice with the same set does not double-subscribe', async () => {
    const action = vi.fn(() => fires())
    const { bus, dispatcher } = harness({ 'collection.bounceFollowUp': action })

    dispatcher.bind([bounce])
    dispatcher.bind([bounce])
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(action).toHaveBeenCalledTimes(1)
  })

  it('stops everything on stop()', async () => {
    const action = vi.fn(() => fires())
    const { bus, dispatcher } = harness({ 'collection.bounceFollowUp': action })

    dispatcher.bind([bounce])
    dispatcher.stop()
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(action).not.toHaveBeenCalled()
  })
})

describe('the run ledger', () => {
  it('writes exactly one run per evaluation, whatever the recipe decided', async () => {
    const { bus, dispatcher, runs } = harness({
      'collection.bounceFollowUp': () => ({
        decision: RUN_DECISIONS.skipped,
        reason: 'already chased',
      }),
    })

    dispatcher.bind([bounce])
    bus.emit('cheque.bounced')
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(runs).toHaveLength(2)
    expect(runs.map((run) => run.decision)).toEqual([
      RUN_DECISIONS.skipped,
      RUN_DECISIONS.skipped,
    ])
  })

  it('writes a run for a recipe with no action, rather than nothing at all', async () => {
    const { bus, dispatcher, runs } = harness({})

    dispatcher.bind([bounce])
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(runs).toHaveLength(1)
    expect(runs[0].decision).toBe(RUN_DECISIONS.skipped)
    expect(runs[0].reason).toMatch(/no action is registered/)
  })

  it('keys a run off the occurrence rather than the instant, so a replay writes the same key', async () => {
    const { bus, dispatcher, runs } = harness({ 'collection.bounceFollowUp': () => fires() })

    dispatcher.bind([bounce])
    const event = bus.emit('cheque.bounced', {
      subject: { entity: 'CollectionRecord', id: 'col-0001' },
    })
    await dispatcher.settled()

    expect(runs[0].idempotencyKey).toBe(
      `collection.bounceFollowUp:v1:col-0001:trigger:${event.id}`,
    )
    expect(runs[0].idempotencyKey).not.toContain('2026')
  })

  it('carries both timestamps and the triggering event', async () => {
    const { bus, dispatcher, runs } = harness({ 'collection.bounceFollowUp': () => fires() })

    dispatcher.bind([bounce])
    const event = bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(runs[0].evaluatedAt).toBe('2026-08-30T09:00:00.000Z')
    expect(runs[0].clockAt).toBe('2026-08-30T09:00:00.000Z')
    expect(runs[0].causedBy).toBe(event.id)
  })

  it('records what the run emitted, in order', async () => {
    const { bus, dispatcher, runs } = harness({
      'collection.bounceFollowUp': (context) => {
        context.emit('task.created')
        context.emit('message.sent')
        return fires()
      },
    })

    dispatcher.bind([bounce])
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(runs[0].emitted).toEqual(['task.created', 'message.sent'])
  })

  it('writes a refused run when the action throws, and hands the error on', async () => {
    const onError = vi.fn()
    const bus = createEventBus({ now: NOW })
    const runs: RecipeRunDraft[] = []
    const dispatcher = createDispatcher({
      bus,
      now: NOW,
      onError,
      recordRun: (draft) => {
        runs.push(draft)
      },
      actions: {
        'collection.bounceFollowUp': () => {
          throw new Error('the desk was unreachable')
        },
      },
    })

    dispatcher.bind([bounce])
    // The emit is somebody's save. It must not be taken down by a broken recipe.
    expect(() => bus.emit('cheque.bounced')).not.toThrow()
    await dispatcher.settled()

    expect(runs[0].decision).toBe(RUN_DECISIONS.refused)
    expect(runs[0].reason).toMatch(/the desk was unreachable/)
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

describe('causality and the depth guard', () => {
  it('stamps causedBy on everything a recipe emits', async () => {
    const seen: { name: string; causedBy?: string }[] = []
    const { bus, dispatcher } = harness({
      'collection.bounceFollowUp': (context) => {
        context.emit('task.created')
        return fires()
      },
    })

    bus.onAny((event) => seen.push({ name: event.name, causedBy: event.causedBy }))
    dispatcher.bind([bounce])
    const trigger = bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(seen).toContainEqual({ name: 'task.created', causedBy: trigger.id })
    expect(seen).toContainEqual({ name: 'cheque.bounced', causedBy: undefined })
    /*
     * The effect is seen before its cause, and that is the bus working as built:
     * `onAny` runs after the named subscribers, so the recipe has already emitted
     * by the time the trigger reaches an `onAny` sink. Ordering on this channel is
     * delivery order, not causal order — which is exactly why `causedBy` exists
     * and why the audit timeline cannot infer a chain from position alone.
     */
    expect(seen.map((event) => event.name)).toEqual(['task.created', 'cheque.bounced'])
  })

  it('hands an action the cause to pass to a repository, so a repo write is a hop too', async () => {
    let cause = ''
    const { bus, dispatcher } = harness({
      'collection.bounceFollowUp': (context) => {
        cause = context.cause
        return fires()
      },
    })

    dispatcher.bind([bounce])
    const trigger = bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(cause).toBe(trigger.id)
  })

  it('terminates a deliberate cycle at the ceiling instead of running away', async () => {
    /*
     * Two recipes pointed at each other: a bounce raises a task, a task raises a
     * bounce. Left alone this is unbounded. The guard is the only thing between
     * this configuration and a stack that never unwinds.
     */
    const { bus, dispatcher, runs } = harness({
      'collection.bounceFollowUp': (context) => {
        context.emit('task.created')
        return fires()
      },
      'task.loop': (context) => {
        context.emit('cheque.bounced')
        return fires()
      },
    })

    dispatcher.bind([
      bounce,
      { key: 'task.loop', version: 1, trigger: 'task.created', parameters: {} },
    ])
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    const refusals = runs.filter((run) => run.decision === RUN_DECISIONS.refused)
    expect(refusals.length).toBeGreaterThan(0)
    expect(runs.filter((run) => run.decision === RUN_DECISIONS.fired)).toHaveLength(
      MAX_CHAIN_DEPTH,
    )
    // Terminated, and bounded: the count is a function of the ceiling.
    expect(runs).toHaveLength(MAX_CHAIN_DEPTH + 1)
  })

  it('records the chain that reached a refusal, so the silence is explicable', async () => {
    const { bus, dispatcher, runs } = harness(
      {
        'collection.bounceFollowUp': (context) => {
          context.emit('task.created')
          return fires()
        },
        'task.loop': (context) => {
          context.emit('cheque.bounced')
          return fires()
        },
      },
      { maxDepth: 2 },
    )

    dispatcher.bind([
      bounce,
      { key: 'task.loop', version: 1, trigger: 'task.created', parameters: {} },
    ])
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    const refused = runs.find((run) => run.decision === RUN_DECISIONS.refused)
    expect(refused).toBeDefined()
    expect(refused?.chain).toEqual([
      'collection.bounceFollowUp',
      'task.loop',
      'collection.bounceFollowUp',
    ])
    expect(refused?.reason).toMatch(/ceiling is 2/)
    expect(refused?.emitted).toEqual([])
  })

  it('leaves an ordinary one-hop chain well inside the ceiling', async () => {
    const { bus, dispatcher, runs } = harness({
      'collection.bounceFollowUp': (context) => {
        context.emit('task.created')
        return fires()
      },
      'task.notify': () => fires('told somebody'),
    })

    dispatcher.bind([
      bounce,
      { key: 'task.notify', version: 1, trigger: 'task.created', parameters: {} },
    ])
    bus.emit('cheque.bounced')
    await dispatcher.settled()

    expect(runs.every((run) => run.decision === RUN_DECISIONS.fired)).toBe(true)
    /*
     * The caused run is written first: it settles inside the emit its cause is
     * still awaiting. `chain` is what orders the ledger causally, which is the
     * reason it is stored rather than reconstructed from write order.
     */
    expect(runs.map((run) => run.chain)).toEqual([
      ['collection.bounceFollowUp', 'task.notify'],
      ['collection.bounceFollowUp'],
    ])
  })
})
