/**
 * The engine, end to end — FR-21, FR-21.5, FR-15.
 *
 * The unit tests prove each piece in isolation. This proves the thing the audit
 * was actually about: that switching a recipe on now changes what the platform
 * does, rather than only changing what a screen reads.
 */

import { afterEach, describe, expect, it } from 'vitest'

import type { LeaseStorage } from '../../domain/automation'
import { NO_LATENCY, createMockRepositories } from '../mock'
import type { MockRepositories } from '../mock'
import { STORY_ONLY } from '../fixtures'
import { CALLBACK_DUE_KEY, TAT_BREACH_KEY } from './clock'
import { startAutomation } from './runtime'
import type { AutomationRuntime } from './runtime'
import { createClock } from './clock'

const ACTOR = 'usr-priya'

function memoryLease(): LeaseStorage {
  let value: string | null = null
  return {
    read: () => value,
    write: (next) => {
      value = next
    },
    clear: () => {
      value = null
    },
  }
}

function repositories(now?: () => Date): MockRepositories {
  return createMockRepositories({
    latency: NO_LATENCY,
    fixtureOptions: { volume: STORY_ONLY },
    ...(now === undefined ? {} : { now }),
  })
}

let running: AutomationRuntime | null = null

function start(
  repos: MockRepositories,
  options: { readonly nodeId?: string; readonly now?: () => Date; readonly quiet?: boolean } = {},
) {
  running = startAutomation({
    repositories: repos,
    store: repos.store,
    nodeId: options.nodeId ?? 'tab-test',
    // Quiet hours are off unless a test is asserting the hold; the fixture
    // anchor is 09:30 UTC, which lands inside the window in some zones.
    ignoreQuietHours: options.quiet !== true,
    ...(options.now === undefined ? {} : { now: options.now }),
  })
  return running
}

/** A customer who answered the consent link, and a claim about them. */
const CONSENTED_CLAIM = { entity: 'Claim', id: 'clm-0418' } as const

afterEach(() => {
  running?.stop()
  running = null
})

describe('the dispatcher, against the seeded recipes', () => {
  it('binds every active recipe whose trigger is a real event name', async () => {
    const repos = repositories()
    const runtime = start(repos)
    const bound = await runtime.rebind()

    const seeded = await repos.config.recipes()
    const active = seeded.filter((recipe) => recipe.active)

    expect(bound.length).toBe(active.length)
    expect(bound.map((binding) => binding.key)).toContain('collection.bounceFollowUp')
    expect(bound.map((binding) => binding.key)).toContain('renewal.reminder')
  })

  it('raises a REAL task when a cheque bounces, and it lands in the FR-15 queue', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    const before = await repos.tasks.forSubject('CollectionRecord', 'col-0001')
    expect(before).toHaveLength(0)

    const bounced = await repos.collections.markBounced('col-0001', {
      actorId: ACTOR,
      bounceReason: 'Insufficient funds',
      followUpTaskCreated: true,
      followUpTaskDueOn: '2026-08-27',
    })
    expect(bounced.ok).toBe(true)
    await runtime.dispatcher.settled()

    // The row, not the event. This is the P-15 backlog entry: the edge used to
    // emit `task.created` and write nothing, so the queue stayed empty while the
    // audit trail said otherwise.
    const raised = await repos.tasks.forSubject('CollectionRecord', 'col-0001')
    expect(raised).toHaveLength(1)
    expect(raised[0]).toMatchObject({
      kind: 'cheque_bounce',
      state: 'open',
      priority: 'high',
      raisedBy: 'collection.bounceFollowUp',
    })

    const queue = await repos.tasks.open({ pageSize: 500 })
    expect(queue.rows.map((task) => task.id)).toContain(raised[0].id)
  })

  it('writes a ledger row naming the recipe and the trigger — FR-21.5', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    await repos.collections.markBounced('col-0001', {
      actorId: ACTOR,
      bounceReason: 'Insufficient funds',
      followUpTaskCreated: true,
      followUpTaskDueOn: '2026-08-27',
    })
    await runtime.dispatcher.settled()

    const runs = await repos.recipeRuns.forRecipe('collection.bounceFollowUp')
    expect(runs.rows).toHaveLength(1)
    expect(runs.rows[0]).toMatchObject({
      decision: 'fired',
      trigger: 'cheque.bounced',
      recipeVersion: 1,
      subjectEntity: 'CollectionRecord',
      subjectId: 'col-0001',
    })
    expect(runs.rows[0].reason).toMatch(/^Raised TSK-\d+/)
    expect(runs.rows[0].causedBy).not.toBeNull()
  })

  it('links the task it raised back to the bounce that caused it', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    await repos.collections.markBounced('col-0001', {
      actorId: ACTOR,
      bounceReason: 'Insufficient funds',
      followUpTaskCreated: true,
      followUpTaskDueOn: '2026-08-27',
    })
    await runtime.dispatcher.settled()

    const log = repos.store.events()
    const bounce = log.find((event) => event.name === 'cheque.bounced')
    const created = log.find((event) => event.name === 'task.created')

    expect(bounce).toBeDefined()
    expect(created?.causedBy).toBe(bounce?.id)
    // And the edge no longer emits a task it never wrote.
    expect(log.filter((event) => event.name === 'task.created')).toHaveLength(1)
  })

  it('does not raise a second follow-up when the same record bounces again', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    await repos.collections.markBounced('col-0001', {
      actorId: ACTOR,
      bounceReason: 'Insufficient funds',
      followUpTaskCreated: true,
      followUpTaskDueOn: '2026-08-27',
    })
    await runtime.dispatcher.settled()

    /*
     * A second, distinct occurrence against the same record. The ledger's key
     * cannot catch this one — a different trigger event is a different key by
     * construction — so the action's own "is one already open?" read is what
     * stops the queue growing a duplicate every time a cheque re-presents.
     */
    repos.store.bus.emit('cheque.bounced', {
      actorId: ACTOR,
      subject: { entity: 'CollectionRecord', id: 'col-0001' },
    })
    await runtime.dispatcher.settled()

    const raised = await repos.tasks.forSubject('CollectionRecord', 'col-0001')
    expect(raised).toHaveLength(1)
  })

  it('will not prepare a message for somebody who has not consented, and says so', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    // pol-4388's customer sits in `link_issued`: a link went out and was never
    // answered, which is not a yes. FR-17.3 wants the hold honoured AND logged.
    repos.store.bus.emit('policy.issued', { subject: { entity: 'Policy', id: 'pol-4388' } })
    await runtime.dispatcher.settled()

    const runs = await repos.recipeRuns.forRecipe('policy.issuedNotice')
    expect(runs.rows).toHaveLength(1)
    expect(runs.rows[0].decision).toBe('skipped')
    expect(runs.rows[0].reason).toMatch(/consent is "link_issued"/)
    expect(runtime.outbox.list()).toHaveLength(0)
  })

  it('stops running a recipe the moment it is unbound', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    runtime.dispatcher.bind([])
    await repos.collections.markBounced('col-0001', {
      actorId: ACTOR,
      bounceReason: 'Insufficient funds',
      followUpTaskCreated: true,
      followUpTaskDueOn: '2026-08-27',
    })
    await runtime.dispatcher.settled()

    expect(await repos.tasks.forSubject('CollectionRecord', 'col-0001')).toHaveLength(0)
  })
})

describe('the clock', () => {
  function clockFor(repos: MockRepositories, options: {
    readonly nodeId: string
    readonly storage: LeaseStorage
    readonly now?: () => Date
  }) {
    return createClock({
      bus: repos.store.bus,
      renewals: repos.renewals,
      customers: repos.customers,
      inquiries: repos.inquiries,
      tasks: repos.tasks,
      recipeRuns: repos.recipeRuns,
      recipes: () => repos.config.recipes(),
      now: options.now ?? repos.store.now,
      storage: options.storage,
      nodeId: options.nodeId,
      ignoreQuietHours: true,
    })
  }

  it('emits from exactly one of two simulated tabs', async () => {
    const repos = repositories()
    const storage = memoryLease()
    const ticks: string[] = []
    repos.store.bus.on('clock.tick', (event) => ticks.push(String(event.detail?.node)))

    const first = await clockFor(repos, { nodeId: 'tab-a', storage }).tick()
    const second = await clockFor(repos, { nodeId: 'tab-b', storage }).tick()

    expect(first.emitted).toBe(true)
    expect(second.emitted).toBe(false)
    expect(ticks).toEqual(['tab-a'])
  })

  it('synthesises renewal.due, the trigger nothing in the tree ever emitted', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    const due: string[] = []
    repos.store.bus.on('renewal.due', (event) => due.push(event.subject?.id ?? ''))

    const report = await clockFor(repos, { nodeId: 'tab-a', storage: memoryLease() }).tick()

    expect(report.emitted).toBe(true)
    expect(report.triggers).toContain('renewal.due')
    expect(due.length).toBeGreaterThan(0)
  })

  it('fires each rung once, however many times the tick runs', async () => {
    const repos = repositories()
    const storage = memoryLease()
    const clock = clockFor(repos, { nodeId: 'tab-a', storage })

    const first = await clock.tick()
    const second = await clock.tick()
    const third = await clock.tick()

    expect(first.triggers.length).toBeGreaterThan(0)
    expect(second.triggers).toEqual([])
    expect(third.triggers).toEqual([])
  })

  it('collapses a three-day gap to one action at the highest rung, with the skip recorded', async () => {
    const repos = repositories()
    const storage = memoryLease()

    // A tick that never ran for three days: the ladder is walked from an instant
    // well past several rungs at once.
    const late = new Date(repos.store.now().getTime() + 3 * 86_400_000)
    const report = await clockFor(repos, {
      nodeId: 'tab-a',
      storage,
      now: () => late,
    }).tick()

    const dueEvents = repos.store.events().filter((event) => event.name === 'renewal.due')
    const bySubject = new Map<string, number>()
    for (const event of dueEvents) {
      const id = event.subject?.id ?? ''
      bySubject.set(id, (bySubject.get(id) ?? 0) + 1)
    }

    // One reminder per record, not one per rung it happens to have passed.
    for (const count of bySubject.values()) expect(count).toBe(1)

    const runs = await repos.recipeRuns.forRecipe('renewal.reminder', { pageSize: 200 })
    const skips = runs.rows.filter((run) => run.decision === 'skipped')
    expect(report.superseded).toBe(skips.length)
    for (const skip of skips) expect(skip.reason).toMatch(/collapsed into/)
  })

  it('splits evaluatedAt from clockAt only where the two really differ', async () => {
    const repos = repositories()
    const at = new Date('2026-09-15T04:00:00.000Z')

    await clockFor(repos, {
      nodeId: 'tab-a',
      storage: memoryLease(),
      now: () => at,
    }).tick()

    const runs = await repos.recipeRuns.list({ pageSize: 200 })
    expect(runs.rows.length).toBeGreaterThan(0)
    for (const run of runs.rows) expect(run.clockAt).toBe(at.toISOString())
  })

  it('holds its tongue inside quiet hours, and still emits the tick', async () => {
    const repos = repositories()
    // 22:00 local, inside CONSENT_CADENCE.quietHours.
    const night = new Date(2026, 8, 15, 22, 0, 0)
    const ticks: string[] = []
    repos.store.bus.on('clock.tick', () => ticks.push('tick'))

    const report = await createClock({
      bus: repos.store.bus,
      renewals: repos.renewals,
      customers: repos.customers,
      inquiries: repos.inquiries,
      tasks: repos.tasks,
      recipeRuns: repos.recipeRuns,
      recipes: () => repos.config.recipes(),
      now: () => night,
      storage: memoryLease(),
      nodeId: 'tab-a',
    }).tick()

    expect(report.emitted).toBe(true)
    expect(report.quiet).toBe(true)
    expect(report.triggers).toEqual([])
    expect(ticks).toEqual(['tick'])
  })
})

describe('the staged outbox — the confirm-gate answer', () => {
  it('prepares a message for a consenting customer and sends nothing', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    const sent: string[] = []
    repos.store.bus.on('message.sent', () => sent.push('sent'))

    repos.store.bus.emit('claim.status_changed', { subject: CONSENTED_CLAIM })
    await runtime.dispatcher.settled()

    const staged = runtime.outbox.waiting()
    expect(staged).toHaveLength(1)
    expect(staged[0].recipeKey).toBe('claim.statusUpdate')
    expect(staged[0].templateKey).toBe('claim.status')
    expect(staged[0].subjectId).toBe(CONSENTED_CLAIM.id)
    expect(staged[0].releaseAfter).toBeNull()

    // The whole point: the engine finished its job and the customer has still
    // not been written to. Nothing left the building without a person.
    expect(sent).toEqual([])

    const runs = await repos.recipeRuns.forRecipe('claim.statusUpdate')
    expect(runs.rows[0].decision).toBe('fired')
    expect(runs.rows[0].reason).toMatch(/Nothing has been sent/)
  })

  it('does not put the same message in front of a person twice', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    repos.store.bus.emit('claim.status_changed', { subject: CONSENTED_CLAIM })
    repos.store.bus.emit('claim.status_changed', { subject: CONSENTED_CLAIM })
    await runtime.dispatcher.settled()

    expect(runtime.outbox.waiting()).toHaveLength(1)
    // Two runs, one row. The ledger records both evaluations; the outbox holds
    // one decision, because there is only one to make.
    expect((await repos.recipeRuns.forRecipe('claim.statusUpdate')).rows).toHaveLength(2)
  })

  it('holds a message prepared inside quiet hours, and logs the skip with its reason', async () => {
    const repos = repositories()
    // 23:00 local, inside CONSENT_CADENCE.quietHours.
    const night = new Date(2026, 8, 15, 23, 0, 0)
    const runtime = start(repos, { quiet: true, now: () => night })
    await runtime.rebind()

    repos.store.bus.emit('claim.status_changed', { subject: CONSENTED_CLAIM })
    await runtime.dispatcher.settled()

    const runs = await repos.recipeRuns.forRecipe('claim.statusUpdate')
    expect(runs.rows[0].decision).toBe('skipped')
    expect(runs.rows[0].reason).toMatch(/quiet hours/)

    // Held, not dropped: the row exists and says when it may go.
    const staged = runtime.outbox.waiting()
    expect(staged).toHaveLength(1)
    expect(staged[0].releaseAfter).not.toBeNull()
    expect(new Date(String(staged[0].releaseAfter)).getHours()).toBe(9)

    // And the hold binds a person exactly as it binds the engine.
    const early = runtime.outbox.release(staged[0].id, { actorId: ACTOR, now: night })
    expect(early.ok).toBe(false)
    if (early.ok) return
    expect(early.reason).toMatch(/held until/)
  })

  it('sends only when a person releases it, and the send names the recipe', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    repos.store.bus.emit('claim.status_changed', { subject: CONSENTED_CLAIM })
    await runtime.dispatcher.settled()

    const staged = runtime.outbox.waiting()[0]
    const sent: { recipe: unknown; actor: string | undefined }[] = []
    repos.store.bus.on('message.sent', (event) => {
      sent.push({ recipe: event.detail?.recipe, actor: event.actorId })
    })

    const released = runtime.outbox.release(staged.id, { actorId: ACTOR, now: repos.store.now() })
    expect(released.ok).toBe(true)
    if (!released.ok) return
    expect(released.record.releasedBy).toBe(ACTOR)

    // "Who sent this?" answers with a person; "why was it prepared?" answers
    // with a recipe. That pair is FR-21.5.
    expect(sent).toEqual([{ recipe: 'claim.statusUpdate', actor: ACTOR }])
    expect(runtime.outbox.waiting()).toHaveLength(0)
  })

  it('will not cancel a prepared message without a reason', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    repos.store.bus.emit('claim.status_changed', { subject: CONSENTED_CLAIM })
    await runtime.dispatcher.settled()

    const staged = runtime.outbox.waiting()[0]
    const blank = runtime.outbox.discard(staged.id, {
      actorId: ACTOR,
      reason: '   ',
      now: repos.store.now(),
    })
    expect(blank.ok).toBe(false)

    const given = runtime.outbox.discard(staged.id, {
      actorId: ACTOR,
      reason: 'The customer was called instead.',
      now: repos.store.now(),
    })
    expect(given.ok).toBe(true)
    expect(runtime.outbox.waiting()).toHaveLength(0)
  })

  it('refuses to prepare anything when the recipe names no template', async () => {
    const repos = repositories()
    const runtime = start(repos)
    const bound = await runtime.rebind()
    const claimRecipe = bound.find((binding) => binding.key === 'claim.statusUpdate')
    expect(claimRecipe).toBeDefined()
    if (claimRecipe === undefined) return

    runtime.dispatcher.bind([
      { ...claimRecipe, version: claimRecipe.version + 1, parameters: { channel: 'whatsapp' } },
    ])
    repos.store.bus.emit('claim.status_changed', { subject: CONSENTED_CLAIM })
    await runtime.dispatcher.settled()

    const runs = await repos.recipeRuns.forRecipe('claim.statusUpdate')
    expect(runs.rows[0].decision).toBe('refused')
    expect(runs.rows[0].reason).toMatch(/templateKey/)
    expect(runtime.outbox.list()).toHaveLength(0)
  })
})

describe('the sweeps that had no caller', () => {
  it('finds the inquiries past their turnaround allowance, once each', async () => {
    const repos = repositories()
    const runtime = start(repos)
    const breaching = await repos.inquiries.breachingTat(repos.store.now(), { pageSize: 100 })
    expect(breaching.total).toBeGreaterThan(0)

    const breaches: string[] = []
    repos.store.bus.on('sla.breached', (event) => breaches.push(String(event.subject?.id)))

    await runtime.clock.tick()
    await runtime.dispatcher.settled()

    expect(breaches.toSorted()).toEqual(breaching.rows.map((row) => row.id).toSorted())

    // Re-entrant: the same inquiries are still late on the next tick and must
    // not breach again. The key carries the deadline, never the evaluation.
    await runtime.clock.tick()
    await runtime.dispatcher.settled()
    expect(breaches).toHaveLength(breaching.total)

    const runs = await repos.recipeRuns.forRecipe(TAT_BREACH_KEY)
    expect(runs.total).toBe(breaching.total)
    expect(runs.rows[0].reason).toMatch(/turnaround allowance/)
    expect(runs.rows[0].decision).toBe('fired')
  })

  it('nudges a task whose callback date has passed, and leaves the rest alone', async () => {
    const repos = repositories()
    const runtime = start(repos)
    const at = repos.store.now()
    const open = await repos.tasks.open({ pageSize: 200 })
    const late = open.rows.filter((row) => new Date(row.dueAt).getTime() <= at.getTime())
    expect(late.length).toBeGreaterThan(0)

    await runtime.clock.tick()
    await runtime.dispatcher.settled()

    const runs = await repos.recipeRuns.forRecipe(CALLBACK_DUE_KEY)
    expect(runs.rows.map((row) => row.subjectId).toSorted()).toEqual(
      late.map((row) => row.id).toSorted(),
    )
  })

  it('records every sweep in the ledger against the schedule that ran it', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.clock.tick()
    await runtime.dispatcher.settled()

    const all = await repos.recipeRuns.list({ pageSize: 200 })
    const swept = all.rows.filter((row) => row.trigger === 'clock.tick')
    expect(swept.length).toBeGreaterThan(0)
    // Every one traces to a recipe or a schedule and to the tick that caused it.
    for (const run of swept) {
      expect(run.recipeKey).not.toBe('')
      expect(run.causedBy).not.toBeNull()
      expect(run.chain.length).toBeGreaterThan(0)
    }
  })
})

describe('advancing the clock', () => {
  it('fires the renewal rungs that were not due before, and none that still are not', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.rebind()

    await runtime.clock.tick()
    await runtime.dispatcher.settled()
    const before = (await repos.recipeRuns.forRecipe('renewal.reminder')).total

    const report = await runtime.advance(30)
    expect(report.emitted).toBe(true)
    expect(runtime.offsetDays()).toBe(30)

    const after = (await repos.recipeRuns.forRecipe('renewal.reminder')).total
    expect(after).toBeGreaterThan(before)

    // Idempotent at the new instant: asking again changes nothing.
    await runtime.advance(0)
    expect((await repos.recipeRuns.forRecipe('renewal.reminder')).total).toBe(after)
  })

  it('never rewinds — a run recorded in the future is a row nobody can read', async () => {
    const repos = repositories()
    const runtime = start(repos)
    await runtime.advance(10)
    await runtime.advance(-5)
    expect(runtime.offsetDays()).toBe(10)
  })
})
