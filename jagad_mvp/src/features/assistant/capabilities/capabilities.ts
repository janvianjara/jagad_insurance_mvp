/**
 * What the Assistant does, and what it will not — the prototype's `#cap`.
 *
 * The prototype gives this its own view for a reason that survives the port:
 * this is the front door of the product, most of what it does is invisible
 * until you press something, and a person deciding whether to trust it needs to
 * be able to read the boundaries rather than discover them.
 *
 * It is data rather than markup so the boundaries can be asserted on. The
 * refusals in `NEVER` are not marketing copy — each one restates a product
 * invariant that is enforced somewhere else in the codebase, and a test reads
 * this file to check that the page still claims all of them.
 *
 * Two sections are deliberately narrower than the prototype's:
 *
 *   The prototype's before-and-after table puts a minute figure on each job —
 *   "~40 min saved". Those are estimates of someone else's day, they were
 *   invented for a demo, and printing them in the product would be the product
 *   making a claim it cannot support. The comparison stays; the numbers go.
 *
 *   The prototype's Act examples read "Send the six matched notices". Ours say
 *   what an Act actually does in this build, which is draft the change and open
 *   the module that makes it. Nothing on this page may promise more than the
 *   card behind it delivers.
 */

export const REQUEST_KIND_GUIDE = [
  {
    key: 'ask',
    name: 'Ask',
    tag: null,
    summary:
      'Fetch something you would otherwise navigate to. Nothing changes; it arrives faster than opening four screens.',
    examples: [
      'What is open in my queue?',
      'Which inquiries have nobody on them?',
      'Which claims have aged past the threshold?',
      'What falls due this week?',
    ],
  },
  {
    key: 'analyse',
    name: 'Analyse',
    tag: 'Analyse',
    summary:
      'A question a report cannot answer, because the answer is a reason rather than a number. Every figure is a count of records read at the moment you ask.',
    examples: [
      'Why is work sitting unassigned?',
      'On the aged claims, which side is the delay on?',
      'Why are renewals lapsing?',
      'Who is carrying the most open work?',
    ],
  },
  {
    key: 'act',
    name: 'Act',
    tag: 'Act',
    summary:
      'Draft a change and open the module that makes it. Every one shows what it is about to do and waits. Cancel writes nothing, and nothing on this screen writes.',
    examples: [
      'Get the unassigned inquiries routed',
      'Escalate the claim that has waited longest',
      'Move my most overdue task',
      'Chase the failed bank mandates',
    ],
  },
  {
    key: 'produce',
    name: 'Produce',
    tag: 'Produce',
    summary:
      'Generate a document from records already in the system, on agency letterhead. It opens in the drawer; the record’s own screen is what sends it.',
    examples: [
      'Make a claim summary I can hand over',
      'Make the renewal notice for the next one due',
      'Produce a summary of where the work stands',
    ],
  },
] as const

/**
 * The same job, before and after.
 *
 * No minutes. The prototype's savings figures are the one part of that file
 * that is a claim rather than a demonstration, and a claim the product cannot
 * check is a claim the product should not print.
 */
export const BEFORE_AFTER = [
  {
    key: 'find-work',
    job: 'Find out what needs you today',
    today: 'Open each queue in turn, read the counts, work out which of them is actually late',
    withAssistant: 'The opening turn counts them for you, from your own records, before you ask',
  },
  {
    key: 'why',
    job: 'Explain why something is drifting',
    today: 'Pull the reports, cross-check by owner, by stage, by week',
    withAssistant: 'One answer grouping the same records by the thing that explains them',
  },
  {
    key: 'route',
    job: 'Get unowned work routed',
    today: 'Open the queue, filter to unassigned, select, check each one against who is free',
    withAssistant: 'They are named and identified; the queue opens with them already in hand',
  },
  {
    key: 'position',
    job: 'Answer "where has my claim got to"',
    today: 'Open the claim, read the timeline, check the checklist, piece the position together',
    withAssistant: 'One sheet with the position and what is outstanding, ready to hand over',
  },
  {
    key: 'notice',
    job: 'Notice something crossed a threshold',
    today: 'Somebody happens to look, or a customer calls',
    withAssistant: 'It raises itself, with the reason it was raised attached',
  },
] as const

/**
 * The refusals. Every line here is enforced somewhere else in the codebase, and
 * the `where` is the file or component that does the enforcing — so this page
 * can be checked against the product rather than believed.
 */
export const NEVER = [
  {
    key: 'money',
    claim: 'Produce a money figure',
    detail:
      'No premium, settlement, refund or endorsement delta is ever calculated, suggested or defaulted. Staff type them; the platform adds up only what was typed. The Assistant does not even total a column.',
    where: 'RecordOnlyAmount, and no arithmetic on an amount anywhere in this feature',
  },
  {
    key: 'ledger',
    claim: 'Write to the commission ledger',
    detail:
      'Read only, from every role including admin. Rate and payout changes stay in the commission module with their own approval trail.',
    where: 'The projection facade has no write method on it',
  },
  {
    key: 'confirm',
    claim: 'Send or save without confirming',
    detail:
      'Every Act shows what it will do and waits. Cancel writes nothing — not a draft, not a log line, nothing.',
    where: 'ConfirmGate, with a test for each promise',
  },
  {
    key: 'scope',
    claim: 'Cross a permission boundary',
    detail:
      'It runs as you, never above you. An agent asking about a customer they did not source gets nothing back — the record was not filtered out of the answer, it was never in the query.',
    where: 'can(), applied by the repository before a card sees a row',
  },
  {
    key: 'sensitive',
    claim: 'Read an identity number, or a document',
    detail:
      'It sees that a document exists, its type and whether it has been verified — never the file, never its extracted text, and never an Aadhaar in any form, masked included.',
    where: 'The allow-list in src/data/assistant, with a boundary test',
  },
  {
    key: 'health',
    claim: 'Read a diagnosis',
    detail:
      'Medical documents, health declarations and diagnosis fields are outside the projection entirely. A claim summary it produces names the checklist, not the illness.',
    where: 'The allow-list, again — absent from the query rather than filtered from the answer',
  },
  {
    key: 'claim',
    claim: 'Decide a claim',
    detail:
      'It never predicts, scores or advises an outcome. The insurer and the TPA decide; the platform coordinates, records and chases.',
    where: 'No card in this feature reads or emits an opinion on an outcome',
  },
] as const

/** What each role asks for, changes and produces — the prototype's `RSUM`. */
export const BY_ROLE = [
  {
    key: 'admin',
    name: 'Admin',
    asks: 'Everything in scope: open work, aged claims, where the load sits',
    analyses: 'Which side a delay is on, who is carrying most, why work is unowned',
    produces: 'Work summary',
  },
  {
    key: 'salesManager',
    name: 'Sales',
    asks: 'Open inquiries, unassigned, turnaround at risk, quotations awaiting a reply',
    analyses: 'Why work is sitting unassigned',
    produces: '—',
  },
  {
    key: 'agent',
    name: 'Agent',
    asks: 'Own leads, own drafts, what falls due this week',
    analyses: '—',
    produces: '—',
  },
  {
    key: 'backOffice',
    name: 'Back-office',
    asks: 'The work queue, policy entries, mandate failures, what is past due',
    analyses: '—',
    produces: '—',
  },
  {
    key: 'claims',
    name: 'Claims',
    asks: 'Own claims, insurer queries, claims past the ageing threshold',
    analyses: 'Which side the delay is on',
    produces: 'Claim summary',
  },
  {
    key: 'renewals',
    name: 'Renewals',
    asks: 'Due, lapsed, mandate failures',
    analyses: 'Why renewals lapse',
    produces: 'Renewal notice',
  },
] as const
