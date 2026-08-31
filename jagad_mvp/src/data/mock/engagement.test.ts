import { describe, expect, it } from 'vitest'
import { FIXTURE_NOW } from '../fixtures'
import { NO_LATENCY } from './latency'
import { createMockRepositories } from './index'

/**
 * FR-06.15's mandate, proved where it cannot be got round.
 *
 * The rule could have lived on the screen — check the form, disable the button —
 * and it would have looked identical in the browser. It is under the repository
 * instead, so the question these tests answer is not "does the form validate"
 * but "can an open inquiry end up with nobody owing it anything". Every refusal
 * below is checked for leaving nothing behind, because a rule that half-writes
 * is a rule that produces orphans.
 */
function repositories() {
  return createMockRepositories({ latency: NO_LATENCY })
}

const ACTOR = 'usr-nita-shah'
/**
 * Accepted and untouched: it has a pipeline position to move through and nobody
 * has moved it yet, so a test starts from the state every inquiry is in the
 * moment the conversation begins.
 */
const ACCEPTED = 'inq-1036'
const TOMORROW = new Date(FIXTURE_NOW.getTime() + 26 * 3_600_000).toISOString()

describe('recording one contact — FR-06.13 to .17', () => {
  it('logs the call, raises the follow-up and stamps the inquiry in one act', async () => {
    const repos = repositories()

    const outcome = await repos.inquiries.logEngagement(ACCEPTED, {
      actorId: ACTOR,
      channel: 'call',
      direction: 'outbound',
      dispositionKey: 'call_back',
      notes: 'Travelling until Thursday, asked me to ring back then.',
      nextAction: { kind: 'inquiry_follow_up', dueAt: TOMORROW },
      now: FIXTURE_NOW,
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const { inquiry, activity, task } = outcome.record
    expect(activity.dispositionKey).toBe('call_back')
    expect(task).not.toBeNull()
    expect(task?.subjectId).toBe(ACCEPTED)
    expect(task?.dueAt).toBe(TOMORROW)
    // The follow-up is a task a person committed to, not one a recipe raised.
    expect(task?.raisedBy).toBe(ACTOR)

    expect(inquiry.stageKey).toBe('follow_up_scheduled')
    expect(inquiry.nextActionAt).toBe(TOMORROW)
    expect(inquiry.lastActivityAt).toBe(activity.occurredAt)
    // The activity points back at what it raised, so the timeline can say the
    // callback and the call are the same event rather than two coincidences.
    expect(activity.nextTaskId).toBe(task?.id)
  })

  it('refuses to leave an open inquiry with nothing owed, and writes nothing at all', async () => {
    const repos = repositories()
    const before = await repos.activities.forSubject('Inquiry', ACCEPTED)
    const tasksBefore = await repos.tasks.forSubject('Inquiry', ACCEPTED)

    const outcome = await repos.inquiries.logEngagement(ACCEPTED, {
      actorId: ACTOR,
      channel: 'call',
      direction: 'outbound',
      dispositionKey: 'call_back',
      notes: 'Said he would think about it.',
      nextAction: null,
      now: FIXTURE_NOW,
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/needs a next action with a date/)

    // Nothing half-written: no activity, no task, and the inquiry untouched.
    expect(await repos.activities.forSubject('Inquiry', ACCEPTED)).toHaveLength(before.length)
    expect(await repos.tasks.forSubject('Inquiry', ACCEPTED)).toHaveLength(tasksBefore.length)
    const inquiry = await repos.inquiries.get(ACCEPTED)
    expect(inquiry?.nextActionAt).toBeNull()
    expect(inquiry?.stageKey).toBeNull()
    expect(inquiry?.contactAttempts).toBe(0)
  })

  it('counts attempts on the outcomes that say to, and leaves them alone otherwise', async () => {
    const repos = repositories()

    for (const attempt of [1, 2, 3]) {
      const outcome = await repos.inquiries.logEngagement(ACCEPTED, {
        actorId: ACTOR,
        channel: 'call',
        direction: 'outbound',
        dispositionKey: 'not_reachable',
        nextAction: { kind: 'inquiry_follow_up', dueAt: TOMORROW },
        now: FIXTURE_NOW,
      })
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      expect(outcome.record.activity.attemptNo).toBe(attempt)
      expect(outcome.record.inquiry.contactAttempts).toBe(attempt)
    }

    // Reaching somebody is not an attempt at reaching them, so the count holds.
    const connected = await repos.inquiries.logEngagement(ACCEPTED, {
      actorId: ACTOR,
      channel: 'call',
      direction: 'outbound',
      dispositionKey: 'call_back',
      nextAction: { kind: 'inquiry_follow_up', dueAt: TOMORROW },
      now: FIXTURE_NOW,
    })
    expect(connected.ok).toBe(true)
    if (!connected.ok) return
    expect(connected.record.inquiry.contactAttempts).toBe(3)
  })

  it('closes an inquiry on a terminal outcome without demanding a next action', async () => {
    const repos = repositories()

    const outcome = await repos.inquiries.logEngagement(ACCEPTED, {
      actorId: ACTOR,
      channel: 'call',
      direction: 'outbound',
      dispositionKey: 'wrong_number',
      reason: 'Number belongs to somebody else entirely.',
      nextAction: null,
      now: FIXTURE_NOW,
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // A wrong number is a data fault, not a sales outcome: it lands in its own
    // stage where the source can be corrected rather than dying as another Lost.
    expect(outcome.record.inquiry.stageKey).toBe('data_issue')
    expect(outcome.record.task).toBeNull()
    expect(outcome.record.inquiry.nextActionAt).toBeNull()
  })

  it('holds FR-06.10 open here: a closing outcome still needs its reason', async () => {
    const repos = repositories()

    const outcome = await repos.inquiries.logEngagement(ACCEPTED, {
      actorId: ACTOR,
      channel: 'call',
      direction: 'outbound',
      dispositionKey: 'not_interested',
      nextAction: null,
      now: FIXTURE_NOW,
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/reason is compulsory/)
  })

  it('refuses an outcome nobody configured rather than inventing one', async () => {
    const repos = repositories()

    const outcome = await repos.inquiries.logEngagement(ACCEPTED, {
      actorId: ACTOR,
      channel: 'call',
      direction: 'outbound',
      dispositionKey: 'sounded_keen',
      nextAction: { kind: 'inquiry_follow_up', dueAt: TOMORROW },
      now: FIXTURE_NOW,
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/not a configured outcome/)
  })

  it('refuses an outcome recorded against a channel it does not belong to', async () => {
    const repos = repositories()

    // "Not reachable" is configured for calls. You do not fail to reach an inbox.
    const outcome = await repos.inquiries.logEngagement(ACCEPTED, {
      actorId: ACTOR,
      channel: 'email',
      direction: 'outbound',
      dispositionKey: 'not_reachable',
      nextAction: { kind: 'inquiry_follow_up', dueAt: TOMORROW },
      now: FIXTURE_NOW,
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/not an outcome you can record against a email/)
  })

  it('will not put a pipeline position on an inquiry routing has not finished with', async () => {
    const repos = repositories()

    // inq-1044 is captured and unassigned: no owner, no clock, no conversation.
    const outcome = await repos.inquiries.logEngagement('inq-1044', {
      actorId: ACTOR,
      channel: 'call',
      direction: 'outbound',
      dispositionKey: 'call_back',
      nextAction: { kind: 'inquiry_follow_up', dueAt: TOMORROW },
      now: FIXTURE_NOW,
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/Only an accepted inquiry has a pipeline position/)
  })

  it('reports the inquiries whose next action has already passed', async () => {
    const repos = repositories()
    const soon = new Date(FIXTURE_NOW.getTime() + 3_600_000).toISOString()

    await repos.inquiries.logEngagement(ACCEPTED, {
      actorId: ACTOR,
      channel: 'call',
      direction: 'outbound',
      dispositionKey: 'call_back',
      nextAction: { kind: 'inquiry_follow_up', dueAt: soon },
      now: FIXTURE_NOW,
    })

    const before = await repos.inquiries.nextActionOverdue(FIXTURE_NOW)
    expect(before.rows.some((row) => row.id === ACCEPTED)).toBe(false)

    const later = new Date(FIXTURE_NOW.getTime() + 2 * 3_600_000)
    const after = await repos.inquiries.nextActionOverdue(later)
    expect(after.rows.some((row) => row.id === ACCEPTED)).toBe(true)
  })
})

/**
 * FR-06.17 — the tail of the pipeline, and the reason it is not just Lost.
 */
describe('going cold, and coming back', () => {
  it('parks a lead once the configured attempts are exhausted, and says why', async () => {
    const repos = repositories()
    const recipes = await repos.config.recipes()
    const rule = recipes.find((row) => row.key === 'inquiry.dormancy')
    const maxAttempts = Number(rule?.parameters.maxAttempts)
    expect(maxAttempts).toBeGreaterThan(0)

    let last = null as Awaited<ReturnType<typeof repos.inquiries.logEngagement>> | null
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      last = await repos.inquiries.logEngagement(ACCEPTED, {
        actorId: ACTOR,
        channel: 'call',
        direction: 'outbound',
        dispositionKey: 'not_reachable',
        nextAction: { kind: 'inquiry_follow_up', dueAt: TOMORROW },
        now: FIXTURE_NOW,
      })
      expect(last.ok).toBe(true)
      if (!last.ok) return

      // It only parks on the attempt that reaches the threshold, never before.
      const expected = attempt >= maxAttempts ? 'dormant' : 'not_reachable'
      expect(last.record.inquiry.stageKey).toBe(expected)
    }

    if (!last?.ok) return
    // A parked lead owes nobody a date: leaving the follow-up on would put it
    // back in the overdue sweep every morning for ever.
    expect(last.record.inquiry.nextActionAt).toBeNull()

    const parked = await repos.inquiries.dormant()
    expect(parked.rows.some((row) => row.id === ACCEPTED)).toBe(true)

    // And it is out of the open population the KPI divides into.
    const overdue = await repos.inquiries.nextActionOverdue(
      new Date(FIXTURE_NOW.getTime() + 5 * 86_400_000),
    )
    expect(overdue.rows.some((row) => row.id === ACCEPTED)).toBe(false)
  })

  it('brings a parked lead back rather than leaving Lost as its only exit', async () => {
    const repos = repositories()
    const recipes = await repos.config.recipes()
    const maxAttempts = Number(
      recipes.find((row) => row.key === 'inquiry.dormancy')?.parameters.maxAttempts,
    )

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await repos.inquiries.logEngagement(ACCEPTED, {
        actorId: ACTOR,
        channel: 'call',
        direction: 'outbound',
        dispositionKey: 'not_reachable',
        nextAction: { kind: 'inquiry_follow_up', dueAt: TOMORROW },
        now: FIXTURE_NOW,
      })
    }

    const back = await repos.inquiries.recycle(ACCEPTED, {
      actorId: ACTOR,
      reason: 'He rang the office himself asking about the motor renewal.',
      toPool: true,
      now: FIXTURE_NOW,
    })

    expect(back.ok).toBe(true)
    if (!back.ok) return
    // Unstaged and uncounted: nobody has spoken to them lately, which is exactly
    // what no stage means, and the attempt count starts again.
    expect(back.record.stageKey).toBeNull()
    expect(back.record.contactAttempts).toBe(0)
    expect(back.record.ownerId).toBeNull()

    // The lifecycle state never moved. Dormancy is a pipeline position, and this
    // inquiry has been accepted the whole way through.
    expect(back.record.status).toBe('accepted')
  })

  it('refuses to recycle an inquiry that was never parked, and one with no reason', async () => {
    const repos = repositories()

    const notParked = await repos.inquiries.recycle(ACCEPTED, {
      actorId: ACTOR,
      reason: 'Trying it on.',
      now: FIXTURE_NOW,
    })
    expect(notParked.ok).toBe(false)
    if (notParked.ok) return
    expect(notParked.reason).toMatch(/Only a parked inquiry can be recycled/)
  })
})

describe('the engagement log is append-only', () => {
  /**
   * Stated as a test because the guarantee is the absence of methods, and an
   * absence is the one thing a reader skims past. If an `update` or a `remove`
   * ever appears on this repository, this fails and somebody has to justify it.
   */
  it('offers no way to change or remove what was recorded', async () => {
    const repos = repositories()
    const surface = Object.keys(repos.activities)
    expect(surface).toContain('log')
    expect(surface).not.toContain('update')
    expect(surface).not.toContain('remove')
    expect(surface).not.toContain('delete')
  })

  it('keeps the seeded contacts in the order they happened', async () => {
    const repos = repositories()
    // A week of contact on one lead: two no-answers, a call that connected, and
    // an inbound question. The attempt counter moves on the first two only.
    const rows = await repos.activities.forSubject('Inquiry', 'inq-1039')
    expect(rows.map((row) => row.attemptNo)).toEqual([1, 2, 2, 2])
    expect(rows.map((row) => row.direction)).toEqual([
      'outbound',
      'outbound',
      'outbound',
      'inbound',
    ])
    const latest = await repos.activities.latestFor('Inquiry', 'inq-1039')
    expect(latest?.id).toBe('act-0004')
  })

  /**
   * The seeded record and its log have to agree. A fixture whose inquiry says
   * "two attempts, needs information" while its activities say something else is
   * a fixture that will teach a reader the wrong model of the feature.
   */
  it('seeds an inquiry whose engagement fields match its own log', async () => {
    const repos = repositories()
    const inquiry = await repos.inquiries.get('inq-1039')
    const rows = await repos.activities.forSubject('Inquiry', 'inq-1039')
    const last = rows[rows.length - 1]

    expect(inquiry?.stageKey).toBe('needs_info')
    expect(inquiry?.contactAttempts).toBe(last.attemptNo)
    expect(inquiry?.lastActivityAt).toBe(last.occurredAt)
    // And its next action is already behind, which is what makes it the worked
    // example for the overdue sweep and the coverage KPI.
    expect(inquiry?.nextActionAt).not.toBeNull()
    const overdue = await repos.inquiries.nextActionOverdue(FIXTURE_NOW)
    expect(overdue.rows.some((row) => row.id === 'inq-1039')).toBe(true)
  })
})
