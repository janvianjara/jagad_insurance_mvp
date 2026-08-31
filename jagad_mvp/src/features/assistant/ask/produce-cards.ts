/**
 * The Produce cards — FR-22.2's fourth request kind, and FR-22.9.
 *
 * "Generate a document from data already in the system, on agency letterhead,
 * ready to send." Producing is the one of the four kinds that is entirely
 * honest here without qualification: a document is a rendering of records, and
 * rendering records is exactly what a read-only projection facade is for.
 *
 * Three rules, and the third is the one that makes these documents worth
 * trusting:
 *
 *   Every figure on a produced page is a figure somebody recorded. No total, no
 *   subtotal, no percentage, no year-on-year change. The prototype's renewal
 *   notice prints "+11.3%" beside last year's premium and its statement prints
 *   a tax total; both are the assistant doing arithmetic on money, and neither
 *   comes across (D3, FR-22.5).
 *
 *   A figure nobody recorded prints as "Not recorded" and not as zero. An empty
 *   money slot that renders as ₹0 is a number the system invented.
 *
 *   Nothing sends. The card produces the sheet and opens it in the drawer; the
 *   record's own screen is what puts it in front of a customer, through that
 *   screen's confirmation gate. FR-22.9's "nothing sends without confirmation"
 *   is kept by there being no send here at all.
 */

import type { AssistantClaim } from '../../../data/assistant'
import { textCell } from '../blocks/blocks'
import type { TableRow } from '../blocks/blocks'
import { onLetterhead } from '../documents/document-page'
import type { AssistantDocumentPage, DocumentSection } from '../documents/document-page'
import { MAX_ROWS, PAGE, REQUEST_KINDS, countWord, nothingFound, taskRows, words } from './card-kit'
import type { AskCard } from './card-kit'
import { claimAgeMs, isAgedClaim, isOpenTask, isOverdueTask } from '../queue-rules'

const DAY = 24 * 60 * 60 * 1000

/**
 * The feed's half of a Produce answer.
 *
 * The card in the conversation is a receipt for the document, not the document.
 * It names it, says what is in it, says where the figures came from, and offers
 * Open. The sheet itself goes to the drawer.
 */
function produced(
  document: AssistantDocumentPage,
  meta: string,
  note: string,
  lead: { text: string; emphasis?: readonly string[] },
) {
  return {
    blocks: [
      { kind: 'para' as const, text: lead.text, ...(lead.emphasis ? { emphasis: lead.emphasis } : {}) },
      {
        kind: 'file' as const,
        documentId: document.id,
        name: document.fileName,
        meta,
        note,
      },
      {
        kind: 'note' as const,
        text: 'Generated from the records this account can see, at the moment you asked. Every figure on it was recorded by a person — nothing on the page is totalled, averaged or worked out.',
      },
    ],
    documents: [document],
  }
}

/** A stable id per conversation turn, from the subject rather than a counter. */
function documentId(prefix: string, subject: string, issuedOn: string): string {
  return `${prefix}-${subject}-${issuedOn}`
}

/* ---------------------------------------------------------------- the cards */

/**
 * A claim summary — the prototype's `claimsum`.
 *
 * "Read from the documents on file. Summaries are for reading, not deciding."
 * Ours is narrower still and has to be: FR-22.14 gives the Assistant document
 * PRESENCE and never document content, so the summary lists which documents are
 * on file and which the checklist is still missing — it does not read them, and
 * there is no path by which it could. That is a smaller document than the
 * prototype's and it is the one that can honestly be built.
 *
 * No diagnosis, no hospital, no treatment. Those are health data and FR-22.15
 * puts them outside the projection entirely, so they are absent from the query
 * rather than filtered from the page.
 */
export const CLAIM_SUMMARY: AskCard = {
  id: 'claim-summary',
  label: 'Claim summary',
  question: 'Make a claim summary I can hand over',
  kind: REQUEST_KINDS.produce,
  async run(repo, now) {
    const claims = (await repo.claims({ pageSize: PAGE })).rows
      .filter((row) => row.state !== 'closed')
      .sort((a, b) => claimAgeMs(b, now) - claimAgeMs(a, now))

    const claim = claims[0]
    if (!claim) return nothingFound('claim queue')

    const issuedOn = now.toISOString()
    const days = Math.floor(claimAgeMs(claim, now) / DAY)

    const outstanding = claim.checklistItems.filter(
      (item) => !claim.documentsCollected.includes(item),
    )

    const sections: DocumentSection[] = [
      { section: 'heading', text: 'Claim summary and current position' },
      {
        section: 'meta',
        items: [
          { key: 'claim', label: 'Claim', value: { cell: 'id', systemNo: claim.systemNo, insurerNo: claim.insurerNo } },
          { key: 'type', label: 'Claim type', value: textCell(words(claim.claimType)) },
          { key: 'state', label: 'Current position', value: textCell(words(claim.state)) },
          { key: 'raised', label: 'Raised', value: { cell: 'date', value: claim.raisedAt } },
          { key: 'intimated', label: 'Intimated to insurer', value: { cell: 'date', value: claim.intimatedAt } },
          { key: 'age', label: 'Open for', value: textCell(countWord(days, 'day', 'days')) },
        ],
      },
      {
        section: 'table',
        columns: [
          { key: 'item', label: 'Checklist item' },
          { key: 'state', label: 'Status' },
        ],
        rows: claim.checklistItems.map(
          (item): TableRow => ({
            id: item,
            cells: [
              textCell(words(item)),
              claim.documentsCollected.includes(item)
                ? { cell: 'status', value: 'received', tone: 'ok' }
                : { cell: 'status', value: 'awaited', tone: 'attn' },
            ],
          }),
        ),
      },
      {
        section: 'amounts',
        label: 'Settlement as recorded',
        note: 'Entered from the insurer’s advice',
        rows: [
          { key: 'settled', label: 'Settled amount', paise: claim.settlement?.amount?.paise ?? null },
          { key: 'deduction', label: 'Deduction', paise: claim.settlement?.deduction?.paise ?? null },
        ],
      },
      {
        section: 'para',
        text:
          outstanding.length === 0
            ? 'Every checklist item for this claim has been received. The file is with the insurer for a decision.'
            : `${countWord(outstanding.length, 'checklist item is', 'checklist items are')} still outstanding. The insurer cannot progress the file until they are supplied.`,
      },
      {
        section: 'para',
        text: 'This summary records what is on file and where the claim stands. It states no opinion on the outcome: the insurer and the TPA decide the claim, and this agency coordinates, records and chases it.',
      },
      { section: 'signature', by: repo.user.name, role: 'Claims — Jagad Insurance' },
    ]

    const document = onLetterhead({
      id: documentId('claim-summary', claim.id, issuedOn),
      title: 'Claim Summary',
      fileName: `Claim Summary — ${claim.systemNo}.pdf`,
      pages: 1,
      reference: claim.systemNo,
      issuedOn,
      addressedTo: 'Insurer claims desk',
      sections,
    })

    return produced(
      document,
      `Position, checklist and settlement record · ${countWord(claim.checklistItems.length, 'checklist row', 'checklist rows')} · agency letterhead`,
      'Document presence only — the Assistant sees that a file exists, never what is inside it.',
      {
        text: `${claim.systemNo} has been open ${countWord(days, 'day', 'days')}. Here it is as one sheet, for the insurer desk or as the handover note when it changes hands.`,
        emphasis: [claim.systemNo],
      },
    )
  },
}

/**
 * A renewal notice — the prototype's `notice`.
 *
 * The prototype prints last year's premium beside this year's and the
 * percentage between them, and says that showing the two together is what stops
 * the "why has it gone up" phone call. It is right, and half of it survives:
 * the recorded premiums print, and the percentage does not, because the
 * Assistant may not compute a figure about money (D3).
 */
export const RENEWAL_NOTICE: AskCard = {
  id: 'renewal-notice',
  label: 'Renewal notice',
  question: 'Make the renewal notice for the next one due',
  kind: REQUEST_KINDS.produce,
  async run(repo, now) {
    const due = (await repo.renewals({ pageSize: PAGE })).rows
      .filter((row) => row.state !== 'renewed' && row.state !== 'lapsed')
      .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))

    const renewal = due[0]
    if (!renewal) return nothingFound('renewal pool')

    const policy = await repo.policy(renewal.policyId)
    const issuedOn = now.toISOString()

    const sections: DocumentSection[] = [
      { section: 'heading', text: 'Your policy is due for renewal' },
      {
        section: 'meta',
        items: [
          {
            key: 'policy',
            label: 'Policy',
            value: policy
              ? { cell: 'id', systemNo: policy.systemNo, insurerNo: policy.insurerNo }
              : textCell('Policy reference not in scope'),
          },
          { key: 'expiry', label: 'Expires', value: { cell: 'date', value: renewal.expiryDate } },
          { key: 'due', label: 'Renewal due', value: { cell: 'date', value: renewal.dueOn } },
          {
            key: 'reminders',
            label: 'Reminders sent',
            value: textCell(countWord(renewal.remindersSent, 'reminder', 'reminders')),
          },
        ],
      },
      {
        section: 'amounts',
        label: 'Premium as recorded',
        note: 'From the insurer’s notice, entered by staff',
        rows: [
          {
            key: 'current',
            label: 'Current term',
            paise: policy?.finalPremium?.paise ?? null,
          },
        ],
      },
      {
        section: 'para',
        text: 'The renewal premium for the coming term is the insurer’s figure and is entered on the policy when their notice arrives. Where it is not shown above, it has not yet been received.',
      },
      {
        section: 'para',
        text: 'Renewing before the expiry date keeps your waiting periods and your no-claim bonus intact. To renew, reply to this message or call your agent.',
      },
      { section: 'signature', by: repo.user.name, role: 'Renewals — Jagad Insurance' },
    ]

    const document = onLetterhead({
      id: documentId('renewal-notice', renewal.id, issuedOn),
      title: 'Renewal Notice',
      fileName: `Renewal Notice — ${policy?.systemNo ?? renewal.policyId}.pdf`,
      pages: 1,
      reference: policy?.systemNo ?? renewal.policyId,
      issuedOn,
      addressedTo: 'Policyholder',
      sections,
    })

    return produced(
      document,
      'Expiry, reminders sent and the recorded premium · agency letterhead',
      'Recorded premiums only. No year-on-year change is printed, because working one out would be the Assistant producing a figure about money.',
      {
        text: `The next renewal falls due on ${renewal.dueOn?.slice(0, 10) ?? 'a date not recorded'}. Here is the notice for it.`,
      },
    )
  },
}

/**
 * A work summary — the prototype's monthly business report, reduced to what is
 * true.
 *
 * The prototype's report prints premium booked, commission booked and
 * conversion percentages. Every one of those is money the assistant totalled,
 * and none of it comes across. What is left is a count of work: how much is
 * open, how much is late, and where it sits. That is genuinely useful, it is a
 * document somebody would print for a Monday meeting, and every figure on it is
 * a count of records rather than a sum of rupees.
 */
export const WORK_SUMMARY: AskCard = {
  id: 'work-summary',
  label: 'Work summary',
  question: 'Produce a summary of where the work stands',
  kind: REQUEST_KINDS.produce,
  async run(repo, now) {
    const tasks = await taskRows(repo)
    const open = tasks.filter(isOpenTask)
    if (tasks.length === 0) return nothingFound('queue')

    const overdue = open.filter((row) => isOverdueTask(row, now))
    const claims = (await repo.claims({ pageSize: PAGE })).rows
    const aged = claims.filter((row: AssistantClaim) => isAgedClaim(row, now))
    const inquiries = (await repo.inquiries({ pageSize: PAGE })).rows

    const issuedOn = now.toISOString()

    const byKind = new Map<string, number>()
    for (const row of open) byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1)

    const sections: DocumentSection[] = [
      { section: 'heading', text: 'Where the work stands' },
      {
        section: 'meta',
        items: [
          { key: 'as-at', label: 'Counted at', value: { cell: 'date', value: issuedOn, mode: 'datetime' } },
          { key: 'scope', label: 'Scope', value: textCell(`${repo.user.name} — everything this account can see`) },
        ],
      },
      {
        section: 'table',
        columns: [
          { key: 'measure', label: 'Measure' },
          { key: 'count', label: 'Count', align: 'end' },
        ],
        rows: [
          { id: 'open', cells: [textCell('Open items'), textCell(String(open.length))] },
          { id: 'overdue', cells: [textCell('Open and past due'), textCell(String(overdue.length))] },
          { id: 'inquiries', cells: [textCell('Inquiries in scope'), textCell(String(inquiries.length))] },
          { id: 'claims', cells: [textCell('Claims in scope'), textCell(String(claims.length))] },
          { id: 'aged', cells: [textCell('Claims past the ageing threshold'), textCell(String(aged.length))] },
        ],
      },
      {
        section: 'table',
        columns: [
          { key: 'kind', label: 'Open work by kind' },
          { key: 'count', label: 'Count', align: 'end' },
        ],
        rows: [...byKind.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_ROWS)
          .map(
            ([kind, count]): TableRow => ({
              id: kind,
              cells: [textCell(words(kind)), textCell(String(count))],
            }),
          ),
      },
      {
        section: 'para',
        text: 'Every figure above is a count of records, taken at the moment this page was generated. No premium, commission or settlement total appears on it: this platform records money and does not compute it, and a summary is not an exception to that.',
      },
      { section: 'signature', by: repo.user.name, role: 'Generated by the Assistant from live counts' },
    ]

    const document = onLetterhead({
      id: documentId('work-summary', repo.user.id, issuedOn),
      title: 'Work Summary',
      fileName: `Work Summary — ${issuedOn.slice(0, 10)}.pdf`,
      pages: 1,
      reference: `WRK-${issuedOn.slice(0, 10)}`,
      issuedOn,
      addressedTo: repo.user.name,
      sections,
    })

    return produced(
      document,
      'Open work, what is late, and where it sits · counts only · agency letterhead',
      'Counts of records. Not one figure on this page is an amount of money.',
      {
        text: `${countWord(open.length, 'open item', 'open items')}, of which ${countWord(overdue.length, 'is', 'are')} past due. Here it is as a sheet.`,
        emphasis: [countWord(open.length, 'open item', 'open items')],
      },
    )
  },
}

export const PRODUCE_CARDS: readonly AskCard[] = [CLAIM_SUMMARY, RENEWAL_NOTICE, WORK_SUMMARY]
