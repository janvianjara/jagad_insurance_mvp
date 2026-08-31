/**
 * The Act cards — FR-22.2's third request kind, and FR-22.4's whole subject.
 *
 * "Change something in the system. Every one of these shows what it is about to
 * do and waits for you to confirm. Cancel writes nothing."
 *
 * ---------------------------------------------------------------------------
 * What an Act does in this build, stated plainly, because it is the one place
 * this feature is smaller than the prototype it is modelled on.
 *
 * FR-22.4's full promise is "Confirm emits the mutation and records it as
 * user-initiated with assistant attribution". The Assistant reaches data through
 * `AssistantRepository`, which is an allow-listed projection facade with no
 * write method on it — that is FR-22.13, it is a product invariant, and widening
 * it to let the Assistant write would be a different piece of work with its own
 * audit requirements (FR-22.11).
 *
 * So an Act here does the first half and hands over the second: it DRAFTS the
 * change from live records, shows it in the real `<ConfirmGate>` — the same
 * component the rest of the product uses, with its tested refusal to confirm an
 * empty preview and its tested promise that Cancel invokes nothing — and its
 * receipt says where the change is made and links there.
 *
 * Every receipt in this file is written to that standard. None of them says
 * "Assigned" or "Sent". A receipt that claimed a mutation which did not happen
 * would be worse than having no Act card at all, because a person would stop
 * checking.
 * ---------------------------------------------------------------------------
 *
 * The money rule is unchanged and absolute: no Act computes, suggests or
 * defaults an amount. The one card here that touches money is the settlement,
 * and what it does is refuse — it fills in everything around the figure and
 * hands the figure to a person (D3, FR-22.5).
 */

import type { AssistantInquiry } from '../../../data/assistant'
import type { Block, KvItem } from '../blocks/blocks'
import { textCell } from '../blocks/blocks'
import {
  MAX_ROWS,
  PAGE,
  REQUEST_KINDS,
  countWord,
  inquiryRows,
  nothingFound,
  taskRows,
  words,
} from './card-kit'
import type { AskCard } from './card-kit'
import {
  claimAgeMs,
  isAgedClaim,
  isMandateFailure,
  isOpenTask,
  isOverdueTask,
  isUnassignedInquiry,
} from '../queue-rules'

const DAY = 24 * 60 * 60 * 1000

/**
 * The line every Act ends with, in one place.
 *
 * It is repeated on purpose. A person meeting their first Act card has to learn
 * where the boundary is, and they learn it from the card in front of them
 * rather than from a help page they will not open.
 */
const DRAFTED_HERE =
  'Drafted here from live records; applied in the module that owns it, under that module’s own confirmation and its own audit trail. Nothing on this screen writes.'

/* ---------------------------------------------------------------- the cards */

/**
 * Route the inquiries nobody owns.
 *
 * The prototype matches each one to an agent "on category, current load and
 * area". Matching is the routing engine's job and it has one; what the
 * Assistant contributes is noticing, naming them, and opening the screen with
 * the work already identified.
 */
export const ASSIGN_UNASSIGNED: AskCard = {
  id: 'assign-unassigned',
  label: 'Route the unassigned',
  question: 'Get the unassigned inquiries routed',
  kind: REQUEST_KINDS.act,
  async run(repo) {
    const rows = (await inquiryRows(repo)).filter(isUnassignedInquiry)
    if (rows.length === 0) return nothingFound('queue')

    const shown = rows.slice(0, MAX_ROWS)
    const items: KvItem[] = shown.map((row: AssistantInquiry) => ({
      key: row.id,
      label: row.systemNo,
      value: textCell(
        `${row.contactName} · ${row.productInterest.length > 0 ? row.productInterest.map(words).join(', ') : 'no product named'} · came in through ${words(row.source)}`,
      ),
    }))

    items.push({
      key: 'routing',
      label: 'Routed on',
      value: textCell('Category, current load and area — by the routing rules, not by the Assistant'),
    })
    items.push({
      key: 'clock',
      label: 'Turnaround',
      value: textCell('Starts for each one at the moment it is assigned, not now'),
    })

    const lead = countWord(rows.length, 'inquiry has', 'inquiries have')
    const blocks: Block[] = [
      {
        kind: 'para',
        text: `${lead} nobody on them. Left alone the rules reassign them anyway — that works, it just costs the customer a few more hours first.`,
        emphasis: [lead],
      },
      {
        kind: 'act',
        title: `Route ${countWord(shown.length, 'inquiry', 'inquiries')}`,
        tag: 'Routing',
        items,
        hint: 'Change any one of them on the queue screen before it goes out. Cancel writes nothing.',
        confirmLabel: 'Take these to the queue',
        receipt: `${shown.length} identified and ready to assign. ${DRAFTED_HERE}`,
        handOff: { label: 'Open the inquiries queue', to: '/inquiries?filter=unassigned' },
      },
    ]

    return { blocks }
  },
}

/**
 * Escalate the claim that has waited longest.
 *
 * The prototype's point about escalation is not the send — it is that the
 * escalation carries the history, "so nobody has to reconstruct it". That part
 * is real here: the draft names the claim, its age, its state and its document
 * count, all read from the record.
 */
export const ESCALATE_OLDEST_CLAIM: AskCard = {
  id: 'escalate-claim',
  label: 'Escalate the oldest claim',
  question: 'Escalate the claim that has waited longest',
  kind: REQUEST_KINDS.act,
  async run(repo, now) {
    const aged = (await repo.claims({ pageSize: PAGE })).rows
      .filter((row) => isAgedClaim(row, now))
      .sort((a, b) => claimAgeMs(b, now) - claimAgeMs(a, now))

    const worst = aged[0]
    if (!worst) return nothingFound('claim queue')

    const days = Math.floor(claimAgeMs(worst, now) / DAY)
    const items: KvItem[] = [
      { key: 'claim', label: 'Claim', value: { cell: 'id', systemNo: worst.systemNo, insurerNo: worst.insurerNo } },
      { key: 'type', label: 'Type', value: textCell(words(worst.claimType)) },
      { key: 'state', label: 'Currently', value: textCell(words(worst.state)) },
      { key: 'raised', label: 'Raised', value: { cell: 'date', value: worst.raisedAt } },
      { key: 'age', label: 'Waiting', value: textCell(countWord(days, 'day', 'days')) },
      {
        key: 'carries',
        label: 'Escalation carries',
        value: textCell(
          `The claim and insurer references, the raise and intimation dates, and the ${countWord(worst.documentIds.length, 'document', 'documents')} on file`,
        ),
      },
    ]

    return {
      blocks: [
        {
          kind: 'para',
          text: `${worst.systemNo} has waited ${countWord(days, 'day', 'days')} — the longest in your queue.`,
          emphasis: [worst.systemNo, countWord(days, 'day', 'days')],
          mono: [worst.systemNo],
        },
        {
          kind: 'act',
          title: 'Escalate to the insurer',
          tag: worst.systemNo,
          items,
          hint: 'The escalation sends the history, not just the claim number. Cancel writes nothing.',
          confirmLabel: 'Open the claim to escalate',
          receipt: `Ready to escalate with the full history attached. ${DRAFTED_HERE}`,
          handOff: { label: 'Open this claim', to: `/claims/${worst.id}` },
        },
        {
          kind: 'note',
          text: 'The Assistant never decides, predicts or scores a claim — the insurer and the TPA decide it. What it does is notice that nothing has moved for a month and put the history in one place (FR-22.7).',
        },
      ],
    }
  },
}

/**
 * Move something that is already late.
 *
 * The prototype's most-repeated demonstration, and the one it makes the
 * strongest claim for: "two taps, and the task, the reminder and the customer's
 * message all shift together — nothing is left pointing at the old date". This
 * is the `choice` block, and the reason it is a choice rather than a date
 * picker is the same reason the prototype made it one — the person doing this
 * is between two meetings.
 */
export const RESCHEDULE_OVERDUE: AskCard = {
  id: 'reschedule-overdue',
  label: 'Move something late',
  question: 'Move my most overdue task',
  kind: REQUEST_KINDS.act,
  async run(repo, now) {
    const overdue = (await taskRows(repo))
      .filter((row) => isOpenTask(row) && isOverdueTask(row, now))
      .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))

    const worst = overdue[0]
    if (!worst) return nothingFound('task list')

    return {
      blocks: [
        {
          kind: 'para',
          text: `${countWord(overdue.length, 'open item is', 'open items are')} past their due time. This is the oldest of them.`,
          emphasis: [countWord(overdue.length, 'open item is', 'open items are')],
        },
        {
          kind: 'choice',
          title: worst.title,
          tag: worst.systemNo,
          current: `${words(worst.kind)} · ${words(worst.priority)} priority · was due ${worst.dueAt === null ? 'with no time set' : new Date(worst.dueAt).toISOString().slice(0, 10)}. Picking a new time here does not move it — the task screen does, and moves the reminder with it.`,
          options: [
            { id: 'today', label: 'Later today' },
            { id: 'tomorrow', label: 'Tomorrow morning' },
            { id: 'week', label: 'In three days' },
            { id: 'pick', label: 'Pick a date' },
          ],
          receipt: `{choice} it is. ${DRAFTED_HERE}`,
          handOff: { label: 'Open this task', to: `/tasks/${worst.id}` },
        },
      ],
    }
  },
}

/**
 * Chase a bank mandate that failed.
 *
 * The prototype's sharpest instalment insight is that a monthly policy carries
 * a fifteen-day grace against thirty on every other mode, so a failed debit has
 * half the recovery window — and that a bounced mandate is silent unless
 * somebody is watching for it. The task exists because something was watching;
 * this card is what to do about it.
 */
export const CHASE_MANDATE: AskCard = {
  id: 'chase-mandate',
  label: 'Chase a failed mandate',
  question: 'Chase the failed bank mandates',
  kind: REQUEST_KINDS.act,
  async run(repo) {
    const failures = (await taskRows(repo)).filter(
      (row) => isMandateFailure(row) && isOpenTask(row),
    )
    const first = failures[0]
    if (!first) return nothingFound('collections queue')

    const items: KvItem[] = [
      { key: 'task', label: 'Raised as', value: { cell: 'id', systemNo: first.systemNo } },
      { key: 'title', label: 'On', value: textCell(first.title) },
      { key: 'due', label: 'Due', value: { cell: 'date', value: first.dueAt } },
      {
        key: 'ask',
        label: 'The customer gets',
        value: textCell('A payment link for this instalment, and a plain sentence about what happens if it is missed'),
      },
      {
        key: 'amount',
        label: 'For how much',
        value: textCell('The insurer’s instalment figure already recorded on the policy — never one worked out here'),
      },
      {
        key: 'grace',
        label: 'Why it is urgent',
        value: textCell('Monthly mode carries a shorter grace than annual, so the recovery window is half the usual'),
      },
    ]

    return {
      blocks: [
        {
          kind: 'para',
          text: `${countWord(failures.length, 'mandate failure is', 'mandate failures are')} open in your queue. A failed debit is silent unless something is watching for it — this is that something.`,
          emphasis: [countWord(failures.length, 'mandate failure is', 'mandate failures are')],
        },
        {
          kind: 'act',
          title: 'Send the payment link and set a follow-up',
          tag: 'Collections',
          items,
          hint: 'Two things in one confirmation: the link out, and a follow-up if it is still unpaid. Cancel writes nothing.',
          confirmLabel: 'Open the collection',
          receipt: `Ready to send, with the recorded instalment figure. ${DRAFTED_HERE}`,
          handOff: { label: 'Open this task', to: `/tasks/${first.id}` },
        },
      ],
    }
  },
}

/**
 * Record a settlement — the card that refuses.
 *
 * Everything around the figure is filled from records: the claim, its type, its
 * dates, its documents. The settled amount and the deduction are not, and never
 * will be. This is the money boundary given a place in the conversation rather
 * than left as a rule in a document nobody reads.
 */
export const RECORD_SETTLEMENT: AskCard = {
  id: 'record-settlement',
  label: 'Record a settlement',
  question: 'Record the settlement on a claim',
  kind: REQUEST_KINDS.act,
  async run(repo, now) {
    const open = (await repo.claims({ pageSize: PAGE })).rows
      .filter((row) => row.state === 'filed_with_insurer' || row.state === 'query_open')
      .sort((a, b) => claimAgeMs(b, now) - claimAgeMs(a, now))

    const claim = open[0]
    if (!claim) return nothingFound('claim queue')

    return {
      blocks: [
        {
          kind: 'kv',
          title: `${claim.systemNo} · ${words(claim.claimType)}`,
          tag: 'Filled from the record',
          items: [
            { key: 'state', label: 'Currently', value: textCell(words(claim.state)) },
            { key: 'raised', label: 'Raised', value: { cell: 'date', value: claim.raisedAt } },
            { key: 'intimated', label: 'Intimated', value: { cell: 'date', value: claim.intimatedAt } },
            {
              key: 'docs',
              label: 'Documents on file',
              value: textCell(countWord(claim.documentIds.length, 'document', 'documents')),
            },
            {
              key: 'settlement',
              label: 'Settlement',
              value: { cell: 'money', paise: claim.settlement?.amount?.paise ?? null },
            },
          ],
        },
        {
          kind: 'stop',
          title: 'Settled amount and deduction',
          body: 'Everything above is read from the claim. The settled figure and the deduction are not, and cannot be: they come off the insurer’s advice, and the only correct value is the one printed there. This platform records money; it does not decide it.',
          fields: [
            { key: 'settled', label: 'Settled amount' },
            { key: 'deduction', label: 'Deduction' },
          ],
          handOff: { label: 'Open this claim to record it', to: `/claims/${claim.id}` },
        },
        {
          kind: 'note',
          text: 'A claim closes only with a settlement record and a mandatory company remark, and both are enforced by the claims module rather than by the Assistant asking nicely.',
        },
      ],
    }
  },
}

export const ACT_CARDS: readonly AskCard[] = [
  ASSIGN_UNASSIGNED,
  ESCALATE_OLDEST_CLAIM,
  RESCHEDULE_OVERDUE,
  CHASE_MANDATE,
  RECORD_SETTLEMENT,
]
