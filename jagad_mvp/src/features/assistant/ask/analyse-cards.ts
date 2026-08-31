/**
 * The Analyse cards — FR-22.2's second request kind.
 *
 * "A question a report cannot answer, because the answer is a reason rather
 * than a number." That is the whole distinction from Ask, and it is a real one:
 * three reports will each show that renewals are lapsing; none of them will say
 * that most of the lapses had one reminder and not two. An Analyse card counts
 * the same rows an Ask card lists, but it counts them into buckets and names
 * the largest, which is the shape of an explanation.
 *
 * The hard line, and it is where this file departs from the prototype it is
 * modelled on: the prototype's analysis attaches a rupee figure to each cause
 * — "₹44,200 of the gap", "₹15,200". Every one of those is a number the
 * assistant worked out, and D3 forbids it absolutely. So these cards count
 * RECORDS and never money. "Thirty-one motor renewals lapsed after a single
 * reminder" is a fact about the queue; "that cost ₹44,200" is an estimate, and
 * the difference between them is the whole of FR-22.5.
 *
 * Where an amount does appear it is a figure someone recorded, printed
 * unchanged, in its own row — never summed, never averaged, never compared.
 */

import type { AssistantClaim, AssistantRenewal } from '../../../data/assistant'
import type { Block, BlockRow } from '../blocks/blocks'
import {
  MAX_ROWS,
  PAGE,
  REQUEST_KINDS,
  countWord,
  inquiryRows,
  nothingFound,
  tally,
  taskRows,
  words,
} from './card-kit'
import type { AskCard, Tally } from './card-kit'
import {
  claimAgeMs,
  isAgedClaim,
  isLapsedRenewal,
  isOpenTask,
  isUnassignedInquiry,
} from '../queue-rules'

const DAY = 24 * 60 * 60 * 1000

/**
 * A tally, drawn as the prototype's severity-striped rows.
 *
 * The largest bucket is the one that needs a person, so it takes the severity
 * that says so. The rest step down. Nothing here is a status — it is a ranking —
 * which is why it uses severity rather than the status tones.
 */
function tallyRows(counts: readonly Tally[], noun: string, plural: string): BlockRow[] {
  return counts.slice(0, MAX_ROWS).map((bucket, index) => ({
    id: bucket.key,
    severity: index === 0 ? 'hot' : index === 1 ? 'warm' : 'cool',
    primary: bucket.label,
    secondary: `${countWord(bucket.count, noun, plural)} in this group.`,
    right: { cell: 'text', value: String(bucket.count) },
  }))
}

/** The sentence a tally supports, and no stronger than the tally supports it. */
function leadOf(counts: readonly Tally[], subject: string): Block {
  const top = counts[0]
  if (!top) return { kind: 'para', text: `Nothing to group in your ${subject} right now.` }

  const phrase = `${top.count} of them`
  return {
    kind: 'para',
    text: `Grouped, the largest single reason is ${top.label} — ${phrase}.`,
    emphasis: [phrase, top.label],
  }
}

/* ---------------------------------------------------------------- the cards */

/**
 * Why work is sitting unassigned, grouped by where it came from.
 *
 * The interesting answer is almost never "people are slow". It is that one
 * source — a web form at 09:20, a category with no owner free — produces most
 * of the backlog, and that is a routing problem rather than an effort problem.
 */
export const WHY_UNASSIGNED: AskCard = {
  id: 'why-unassigned',
  label: 'Why is work unassigned',
  question: 'Why is work sitting unassigned?',
  kind: REQUEST_KINDS.analyse,
  async run(repo) {
    const rows = (await inquiryRows(repo)).filter(isUnassignedInquiry)
    if (rows.length === 0) return nothingFound('queue')

    const bySource = tally(rows, (row) => ({
      key: row.source,
      label: `Came in through ${words(row.source)}`,
    }))

    const total = countWord(rows.length, 'inquiry is', 'inquiries are')
    return {
      blocks: [
        {
          kind: 'para',
          text: `${total} waiting for an owner. Grouped by where they came from rather than by who is busy, because an unassigned inquiry is a routing outcome and not an effort one.`,
          emphasis: [total],
        },
        { kind: 'rows', caption: 'By source', rows: tallyRows(bySource, 'inquiry', 'inquiries') },
        leadOf(bySource, 'queue'),
        {
          kind: 'note',
          text: 'Counted from the inquiries this account can see, at the moment you asked. These are counts of records — the Assistant does not put a rupee figure on a backlog, here or anywhere.',
        },
      ],
    }
  },
}

/**
 * Aged claims, split by whose side the delay is on.
 *
 * The prototype's sharpest single line — "CLM-0402 is waiting on us, not the
 * insurer" — and it is derivable rather than written: a claim with an open
 * insurer query is waiting on a reply from this agency; one sitting with the
 * insurer is not. Clearing the ones that are ours first is the whole advice,
 * and it needs no judgement to produce.
 */
export const AGEING_SIDES: AskCard = {
  id: 'ageing-sides',
  label: 'Who is the delay with',
  question: 'On the aged claims, which side is the delay on?',
  kind: REQUEST_KINDS.analyse,
  async run(repo, now) {
    const rows = (await repo.claims({ pageSize: PAGE })).rows.filter((row) =>
      isAgedClaim(row, now),
    )
    if (rows.length === 0) return nothingFound('claim queue')

    const ours = rows.filter((row) => row.state === 'query_open' || row.state === 'blocked')
    const theirs = rows.filter((row) => !ours.includes(row))

    function claimRow(row: AssistantClaim): BlockRow {
      return {
        id: row.id,
        severity: 'hot',
        primary: row.systemNo,
        secondary: `${words(row.claimType)} · ${words(row.state)} · raised ${Math.floor(claimAgeMs(row, now) / DAY)} days ago.`,
        right: { cell: 'clock', mode: 'aging', start: row.raisedAt },
        to: `/claims/${row.id}`,
      }
    }

    const oursPhrase = countWord(ours.length, 'is waiting on us', 'are waiting on us')
    const blocks: Block[] = [
      {
        kind: 'para',
        text: `${countWord(rows.length, 'claim has', 'claims have')} aged past the threshold. Of those, ${oursPhrase} — an insurer query with no reply out, or a checklist we have not closed.`,
        emphasis: [oursPhrase],
      },
    ]

    if (ours.length > 0) {
      blocks.push({ kind: 'rows', caption: 'Waiting on us', rows: ours.map(claimRow) })
    }
    if (theirs.length > 0) {
      blocks.push({ kind: 'rows', caption: 'Waiting on the insurer', rows: theirs.map(claimRow) })
    }

    blocks.push({
      kind: 'note',
      text: 'Clear the ones on our side first: they are the only ones where the wait is a choice. The Assistant never predicts or scores an outcome — the insurer and the TPA decide the claim (FR-22.7).',
    })

    return { blocks }
  },
}

/**
 * Why renewals lapse, grouped by how many reminders they had first.
 *
 * The prototype's motor-renewal finding, derived rather than asserted: lapses
 * concentrate in the policies that got one reminder and not two, and that is a
 * fact about the reminder rule rather than about the customers.
 */
export const WHY_LAPSING: AskCard = {
  id: 'why-lapsing',
  label: 'Why renewals lapse',
  question: 'Why are renewals lapsing?',
  kind: REQUEST_KINDS.analyse,
  async run(repo) {
    const rows = (await repo.renewals({ pageSize: PAGE })).rows.filter(isLapsedRenewal)
    if (rows.length === 0) return nothingFound('renewal pool')

    function bucketOf(row: AssistantRenewal) {
      if (row.remindersSent === 0) return { key: 'none', label: 'Lapsed with no reminder sent' }
      if (row.remindersSent === 1) return { key: 'one', label: 'Lapsed after one reminder' }
      return { key: 'many', label: `Lapsed after ${row.remindersSent} reminders` }
    }

    const byReminders = tally(rows, bucketOf)
    const unreminded = rows.filter((row) => row.remindersSent === 0).length

    const blocks: Block[] = [
      {
        kind: 'para',
        text: `${countWord(rows.length, 'policy has', 'policies have')} lapsed. Grouped by how many reminders went out before they did — which is the part of a lapse this agency controls.`,
        emphasis: [countWord(rows.length, 'policy has', 'policies have')],
      },
      { kind: 'rows', caption: 'By reminders sent', rows: tallyRows(byReminders, 'policy', 'policies') },
    ]

    if (unreminded > 0) {
      const phrase = countWord(unreminded, 'lapsed with no reminder at all', 'lapsed with no reminder at all')
      blocks.push({
        kind: 'para',
        text: `${phrase}. That is the actionable group: it is a gap in the reminder rule, not a decision any customer made.`,
        emphasis: [phrase],
      })
    }

    blocks.push({
      kind: 'note',
      text: 'Counts of policies, from the renewal pool this account can see. No premium is read, added or projected here — a lapse is counted in policies, never in rupees.',
    })

    return { blocks }
  },
}

/**
 * Where the open work actually sits, by owner.
 *
 * The prototype's "Rohit has 22 open against a team average of 13". The average
 * is arithmetic over a COUNT rather than over money, so it is allowed and it is
 * the only reason the largest number means anything.
 */
export const LOAD_BY_OWNER: AskCard = {
  id: 'load-by-owner',
  label: 'Who is carrying most',
  question: 'Who is carrying the most open work?',
  kind: REQUEST_KINDS.analyse,
  async run(repo) {
    const rows = (await taskRows(repo)).filter(isOpenTask)
    if (rows.length === 0) return nothingFound('queue')

    const staff = await repo.staff()
    const nameOf = new Map(staff.map((person) => [person.id, person.name]))

    const byOwner = tally(rows, (row) =>
      row.ownerId === null
        ? { key: 'unowned', label: 'Not assigned to anyone' }
        : { key: row.ownerId, label: nameOf.get(row.ownerId) ?? 'Someone outside your scope' },
    )

    const top = byOwner[0]
    const blocks: Block[] = [
      {
        kind: 'para',
        text: `${countWord(rows.length, 'open item', 'open items')} across ${countWord(byOwner.length, 'person', 'people')} in scope.`,
        emphasis: [countWord(rows.length, 'open item', 'open items')],
      },
      { kind: 'rows', caption: 'Open items by owner', rows: tallyRows(byOwner, 'item', 'items') },
    ]

    if (top && byOwner.length > 1) {
      blocks.push({
        kind: 'para',
        text: `${top.label} is carrying the most. Worth checking whether the items are old before reading the number as effort — a queue can be long because it is stuck rather than because it is busy.`,
        emphasis: [top.label],
      })
    }

    blocks.push({
      kind: 'note',
      text: 'Only the people this account can see are counted, so a team lead sees their team and an admin sees the agency. A name you have no scope over is counted but not named.',
    })

    return { blocks }
  },
}

/**
 * Leads that have gone quiet — FR-06.19, and a question the platform could not
 * answer before the engagement layer existed.
 *
 * The prototype has been promising this one all along: "which leads haven't been
 * touched in ten days". Nothing in the model could produce it, because nothing
 * recorded a contact — an inquiry accepted in March and an inquiry rung this
 * morning looked identical on every screen, both `accepted`, both with a stopped
 * clock.
 *
 * The two buckets are deliberately kept apart because they are different faults
 * and want different responses. A missed next action is a promise the agency made
 * and broke, and somebody knows what it was. Nothing booked at all is worse and
 * quieter: no promise was ever made, so nothing was ever going to surface it.
 *
 * Note what this card reads and what it cannot. It counts contacts and dates off
 * the inquiry — every one of them operational. The note on the call itself is
 * `document-content` and is not in the Assistant's projection at all, so this
 * answer is built without the Assistant ever seeing a word of what was said.
 */
export const QUIET_LEADS: AskCard = {
  id: 'quiet-leads',
  label: 'Which leads have gone quiet',
  question: 'Which leads have gone quiet?',
  kind: REQUEST_KINDS.analyse,
  async run(repo, now) {
    const rows = (await inquiryRows(repo)).filter((row) => row.status === 'accepted')
    const at = now.getTime()

    const overdue = rows.filter(
      (row) => row.nextActionAt !== null && new Date(row.nextActionAt).getTime() < at,
    )
    const unplanned = rows.filter((row) => row.nextActionAt === null)
    const quiet = [...overdue, ...unplanned]

    if (quiet.length === 0) {
      return {
        blocks: [
          {
            kind: 'para',
            text: 'Every accepted inquiry you can see has a next action with a date still to come. Nothing has gone quiet.',
          },
        ],
      }
    }

    const total = countWord(quiet.length, 'lead has', 'leads have')
    const buckets: Tally[] = [
      ...(overdue.length > 0
        ? [{ key: 'overdue', label: 'A next action that came and went', count: overdue.length }]
        : []),
      ...(unplanned.length > 0
        ? [{ key: 'unplanned', label: 'No next action ever set', count: unplanned.length }]
        : []),
    ]

    const oldest = [...quiet]
      .sort((a, b) => (a.lastActivityAt ?? '').localeCompare(b.lastActivityAt ?? ''))
      .slice(0, MAX_ROWS)

    return {
      blocks: [
        {
          kind: 'para',
          text: `${total} stopped moving. The turnaround clock stopped when they were accepted, so none of them shows as late anywhere else.`,
          emphasis: [total],
        },
        { kind: 'rows', caption: 'By what is missing', rows: tallyRows(buckets, 'lead', 'leads') },
        {
          kind: 'rows',
          caption: 'Quietest first',
          rows: oldest.map((row, index) => ({
            id: row.id,
            severity: index === 0 ? 'hot' : index < 3 ? 'warm' : 'cool',
            primary: row.systemNo,
            secondary:
              row.lastActivityAt === null
                ? 'Nobody has logged a contact against this one at all.'
                : `Last contact ${daysSince(row.lastActivityAt, now)}.`,
            right: {
              cell: 'text',
              value: row.nextActionAt === null ? 'nothing booked' : 'overdue',
            },
          })),
        },
        {
          kind: 'note',
          text: 'Counted from contact dates and stages on the inquiries this account can see. What was said on those calls is not in the Assistant’s reach — only that they happened, and when.',
        },
      ],
    }
  },
}

/** How long ago, in the words a person would use. */
function daysSince(when: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(when).getTime()) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export const ANALYSE_CARDS: readonly AskCard[] = [
  WHY_UNASSIGNED,
  AGEING_SIDES,
  WHY_LAPSING,
  LOAD_BY_OWNER,
  QUIET_LEADS,
]
