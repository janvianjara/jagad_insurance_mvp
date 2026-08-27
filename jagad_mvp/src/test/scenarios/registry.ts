/**
 * The scenario registry — what M0 actually demonstrates, as data.
 *
 * The 48-row canvas (`documents/jagad_workflow_canvas.html`, Scenarios tab) is
 * the acceptance matrix for this build. A matrix nobody can query is a matrix
 * that gets quoted from memory, so every row is listed here once, with its
 * phase and with exactly one of three honest answers about its state:
 *
 *   `covered-here`       a test in `src/test/scenarios/` walks the row;
 *   `covered-elsewhere`  a test in the feature that owns the row walks it;
 *   `pending`            nothing walks it, and the step or phase that will is
 *                        named, together with why it cannot be walked today.
 *
 * The rule that keeps this file from becoming fiction is in `registry.test.ts`:
 * the row text is checked against the canvas itself, and every test named here
 * is checked to exist, by name, in the file it is claimed to be in. A row cannot
 * be marked covered by writing a sentence — only by there being a test.
 *
 * `pending` is deliberately not a synonym for "not done yet". Twenty-two of the
 * rows here are P2 and five are P1: they are pending because the plan puts them
 * after M0, not because M0 is missing them. `phase` is what separates the two,
 * and `m0Rows()` is the filter that answers "what does the golden path owe".
 *
 * As it stands: 48 rows, 21 of them M0. Eleven of those 21 are covered — canvas
 * flow 1 entire, rows 3.1 and 3.2, and the three admin-configuration rows that
 * have a screen today. The other ten are canvas flow 2, which P-13 is building,
 * and rows 3.6 and 3.7, which P-15 is. Both flip to covered here — not by a new
 * argument, only by naming the tests those steps land.
 */

/** The three answers a row is allowed to give. */
export const COVERAGE_STATES = ['covered-here', 'covered-elsewhere', 'pending'] as const
export type CoverageState = (typeof COVERAGE_STATES)[number]

/** Plan §11.2's phases, in the order the plan ships them. */
export const PHASES = ['M0', 'P1', 'P2', 'P3'] as const
export type Phase = (typeof PHASES)[number]

/** One test, named the way `it(...)` names it, in the file that holds it. */
export type TestRef = {
  /** Repository-relative, forward slashes, as it appears on disk. */
  readonly file: string
  /** The exact title passed to `it(...)`. Checked against the file's source. */
  readonly name: string
}

export type Coverage =
  | { readonly state: 'covered-here'; readonly tests: readonly TestRef[] }
  | { readonly state: 'covered-elsewhere'; readonly tests: readonly TestRef[] }
  | {
      readonly state: 'pending'
      /** The playbook step (`P-13`) or the phase (`P1`) that will cover it. */
      readonly step: string
      /** Why it cannot be walked today, in a sentence a reader can check. */
      readonly why: string
      /** Tests that already prove part of the row, if any. Never the whole row. */
      readonly partly?: readonly TestRef[]
    }

export type ScenarioRow = {
  /** `flow.row`, exactly as the canvas numbers it. */
  readonly id: string
  readonly flow: number
  readonly given: string
  readonly when: string
  readonly then: string
  readonly phase: Phase
  readonly coverage: Coverage
}

/** The seven flows, titled as the canvas titles them. */
export const FLOW_TITLES: Readonly<Record<number, string>> = {
  1: 'Inquiry → TAT → Assignment',
  2: 'Quotation Loop → Deal',
  3: 'KYC → Login → Payment → Issue',
  4: 'Claim File Lifecycle',
  5: 'Renewal incl. Bulk Notices',
  6: 'Admin Configuration',
  7: 'Endorsement & Cancellation',
}

export const SCENARIOS: readonly ScenarioRow[] = [
  /* 1. Inquiry → TAT → Assignment */
  {
    id: '1.1',
    flow: 1,
    given: 'Inquiry arrives from the website (Health)',
    when: 'Routing runs',
    then: 'Assigned to the matching person; notified; TAT timer starts',
    phase: 'M0',
    coverage: {
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/inquiries/inquiry-scenarios.test.tsx',
          name:
            '1.1 an inquiry arrives from the website and routing assigns it, notifies, and starts the TAT clock',
        },
      ],
    },
  },
  {
    id: '1.2',
    flow: 1,
    given: 'Assigned and waiting',
    when: 'Assignee confirms in time',
    then: 'Accepted; they own it; timer stops; logged',
    phase: 'M0',
    coverage: {
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/inquiries/inquiry-scenarios.test.tsx',
          name:
            '1.2 the assignee confirms inside the TAT, so it is accepted, they own it, and the clock stops',
        },
      ],
    },
  },
  {
    id: '1.3',
    flow: 1,
    given: 'Assigned',
    when: 'TAT passes with no confirmation',
    then: 'Auto-reassigned to next in category; both notified; logged',
    phase: 'M0',
    coverage: {
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/inquiries/inquiry-scenarios.test.tsx',
          name:
            '1.3 the TAT passes with no confirmation, so it auto-reassigns to the next person in the category and both are notified',
        },
        {
          file: 'src/test/scenarios/walkthrough.test.tsx',
          name:
            'lapses a live turnaround in front of the client, and the reassignment the machine refused becomes possible',
        },
      ],
    },
  },
  {
    id: '1.4',
    flow: 1,
    given: 'Reassigned once, TAT lapses again',
    when: 'Escalation fires',
    then: 'Sales Manager gets it with full history',
    phase: 'M0',
    coverage: {
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/inquiries/inquiry-scenarios.test.tsx',
          name:
            '1.4 the TAT lapses a second time, so escalation hands the sales manager the full history',
        },
      ],
    },
  },
  {
    id: '1.5',
    flow: 1,
    given: 'No category matches',
    when: 'Routing can\'t resolve',
    then: 'Lands in unrouted queue; admin alerted — never lost',
    phase: 'M0',
    coverage: {
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/inquiries/inquiry-scenarios.test.tsx',
          name:
            '1.5 routing cannot resolve a category, so the inquiry lands in the unrouted queue with an admin alert and is never lost',
        },
      ],
    },
  },
  {
    id: '1.6',
    flow: 1,
    given: 'Sub-agent in the field',
    when: 'Saves name + mobile only',
    then: 'Inquiry created, linked to them, enters routing',
    phase: 'M0',
    coverage: {
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/inquiries/inquiry-scenarios.test.tsx',
          name:
            '1.6 a sub-agent in the field saves a name and a mobile only, and the inquiry is created, linked to them, and enters routing',
        },
      ],
    },
  },

  /* 2. Quotation Loop → Deal */
  {
    id: '2.1',
    flow: 2,
    given: 'Agent selects 3 policies across 2 companies',
    when: 'Composer opens',
    then: 'One matrix: union of mapped benefit rows, a column per company, defaults pre-filled',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-13',
      why:
        'P-13 builds the Composer, the revision loop and the Deal, and lands its own scenario file. Until that step is committed there is nothing here to point at that will not move, so the second half of P-17 flips these eight rows to covered-elsewhere in one edit.',
    },
  },
  {
    id: '2.2',
    flow: 2,
    given: 'A needed benefit isn\'t in the catalog',
    when: 'Ad-hoc row added inline + amount',
    then: 'Appears on this quotation only; catalog untouched',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-13',
      why:
        'P-13 builds the Composer, the revision loop and the Deal, and lands its own scenario file. Until that step is committed there is nothing here to point at that will not move, so the second half of P-17 flips these eight rows to covered-elsewhere in one edit.',
    },
  },
  {
    id: '2.3',
    flow: 2,
    given: 'Matrix complete',
    when: 'Final premium entered per company; PDF generated',
    then: 'Single or side-by-side branded quotation; premium entered, never computed',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-13',
      why:
        'P-13 builds the Composer, the revision loop and the Deal, and lands its own scenario file. Until that step is committed there is nothing here to point at that will not move, so the second half of P-17 flips these eight rows to covered-elsewhere in one edit.',
    },
  },
  {
    id: '2.4',
    flow: 2,
    given: 'Auto-share ON',
    when: 'Quotation generated or uploaded',
    then: 'Customer receives on WhatsApp/SMS/mail; logged',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-13',
      why:
        'P-13 builds the Composer, the revision loop and the Deal, and lands its own scenario file. Until that step is committed there is nothing here to point at that will not move, so the second half of P-17 flips these eight rows to covered-elsewhere in one edit.',
    },
  },
  {
    id: '2.5',
    flow: 2,
    given: 'Customer wants changes',
    when: 'Revision created',
    then: 'Reason compulsory; old versions immutable',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-13',
      why:
        'P-13 builds the Composer, the revision loop and the Deal, and lands its own scenario file. Until that step is committed there is nothing here to point at that will not move, so the second half of P-17 flips these eight rows to covered-elsewhere in one edit.',
    },
  },
  {
    id: '2.6',
    flow: 2,
    given: 'Customer declines',
    when: 'Marked Lost',
    then: 'Reason compulsory; reportable',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-13',
      why:
        'P-13 builds the Composer, the revision loop and the Deal, and lands its own scenario file. Until that step is committed there is nothing here to point at that will not move, so the second half of P-17 flips these eight rows to covered-elsewhere in one edit.',
    },
  },
  {
    id: '2.7',
    flow: 2,
    given: 'Customer agrees',
    when: 'Marked Won',
    then: 'Deal: application no. + line items; customer + sub-agent + agent linked',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-13',
      why:
        'P-13 builds the Composer, the revision loop and the Deal, and lands its own scenario file. Until that step is committed there is nothing here to point at that will not move, so the second half of P-17 flips these eight rows to covered-elsewhere in one edit.',
    },
  },
  {
    id: '2.8',
    flow: 2,
    given: 'Deal exists',
    when: 'Policy entry begins',
    then: 'Line items pre-populate; empty deal blocked',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-13',
      why:
        'P-13 builds the Composer, the revision loop and the Deal, and lands its own scenario file. Until that step is committed there is nothing here to point at that will not move, so the second half of P-17 flips these eight rows to covered-elsewhere in one edit.',
    },
  },

  /* 3. KYC → Login → Payment → Issue */
  {
    id: '3.1',
    flow: 3,
    given: 'Won deal',
    when: 'KYC completed (staff + consent link)',
    then: 'Profile 100%; consent recorded',
    phase: 'M0',
    coverage: {
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/kyc/kyc-scenarios.test.tsx',
          name:
            '3.1 a won deal completes KYC through the desk and the consent link, and consent is recorded',
        },
      ],
    },
  },
  {
    id: '3.2',
    flow: 3,
    given: 'KYC completes',
    when: 'Credentials recipe fires',
    then: 'Username/password sent on WhatsApp',
    phase: 'M0',
    coverage: {
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/kyc/kyc-scenarios.test.tsx',
          name:
            '3.2 completing KYC fires the credentials recipe on its own — there is nothing to press',
        },
      ],
    },
  },
  {
    id: '3.3',
    flow: 3,
    given: 'Customer pays company direct',
    when: 'Reference recorded',
    then: 'No money on agency books',
    phase: 'P1',
    coverage: {
      state: 'pending',
      step: 'P1',
      why:
        'Collections are P1 (plan §11.2). No screen records a payment reference in M0.',
    },
  },
  {
    id: '3.4',
    flow: 3,
    given: 'Customer pays agency',
    when: 'Collection entry (any mode)',
    then: 'Record-only, no slip; cheque watched',
    phase: 'P1',
    coverage: {
      state: 'pending',
      step: 'P1',
      why:
        'Collections are P1 (plan §11.2). No collection entry screen exists in M0.',
    },
  },
  {
    id: '3.5',
    flow: 3,
    given: 'Recorded cheque bounces',
    when: 'Marked bounced',
    then: 'Follow-up task auto-created',
    phase: 'P1',
    coverage: {
      state: 'pending',
      step: 'P1',
      why:
        'Cheque bounce, and the follow-up task it raises, are P1 (plan §11.2).',
    },
  },
  {
    id: '3.6',
    flow: 3,
    given: 'Company issues policy',
    when: 'PDF uploaded',
    then: 'OCR fills; staff confirm; both numbers stored; customer messaged',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-15',
      why:
        'P-15 builds policy entry, the PDF upload and the OCR review that stores both numbers.',
    },
  },
  {
    id: '3.7',
    flow: 3,
    given: 'Entry half-done',
    when: 'Draft saved',
    then: 'Appears in completion queue with missing fields',
    phase: 'M0',
    coverage: {
      state: 'pending',
      step: 'P-15',
      why:
        'P-15 builds the half-done draft and the completion queue at /back-office/drafts.',
    },
  },

  /* 4. Claim File Lifecycle */
  {
    id: '4.1',
    flow: 4,
    given: 'Customer in their panel',
    when: 'Raises claim on active policy',
    then: 'Claim no. instantly; intimation email to company + CC agent',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Claims are P2 (plan §11.2). The entities are seeded so the P2 screens open onto something, but no claim screen exists.',
    },
  },
  {
    id: '4.2',
    flow: 4,
    given: 'Policy lapsed',
    when: 'Validation runs',
    then: 'Blocked with clear message; agent notified',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Claims are P2 (plan §11.2). The entities are seeded so the P2 screens open onto something, but no claim screen exists.',
    },
  },
  {
    id: '4.3',
    flow: 4,
    given: 'Claim in queue',
    when: 'Claims member picks up',
    then: 'Ownership transfers; sales agent informed, not owner',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Claims are P2 (plan §11.2). The entities are seeded so the P2 screens open onto something, but no claim screen exists.',
    },
  },
  {
    id: '4.4',
    flow: 4,
    given: 'Type is cashless',
    when: 'Recorded',
    then: 'Tokenized upload link auto-sent on the configured channel',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Claims are P2 (plan §11.2). The entities are seeded so the P2 screens open onto something, but no claim screen exists.',
    },
  },
  {
    id: '4.5',
    flow: 4,
    given: 'Cashless link received',
    when: 'Customer uploads discharge summary',
    then: 'Login-free, expiring link; document lands on the claim',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Claims are P2 (plan §11.2). The entities are seeded so the P2 screens open onto something, but no claim screen exists.',
    },
  },
  {
    id: '4.6',
    flow: 4,
    given: 'File claim, customer flagged pickup',
    when: 'Checklist raised',
    then: 'On-field pickup task auto-created; handover tracked',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Claims are P2 (plan §11.2). The entities are seeded so the P2 screens open onto something, but no claim screen exists.',
    },
  },
  {
    id: '4.7',
    flow: 4,
    given: 'Company raises query',
    when: 'Explanation written in customer\'s language',
    then: 'Shared to customer + hospital; loop visible',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Claims are P2 (plan §11.2). The entities are seeded so the P2 screens open onto something, but no claim screen exists.',
    },
  },
  {
    id: '4.8',
    flow: 4,
    given: 'Company pays',
    when: 'Settlement recorded',
    then: 'Close needs settlement + company remark',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Claims are P2 (plan §11.2). The entities are seeded so the P2 screens open onto something, but no claim screen exists.',
    },
  },
  {
    id: '4.9',
    flow: 4,
    given: 'Any status changes',
    when: 'Recipe fires',
    then: 'Customer WhatsApped with claim no.; panel matches',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Claims are P2 (plan §11.2). The entities are seeded so the P2 screens open onto something, but no claim screen exists.',
    },
  },

  /* 5. Renewal incl. Bulk Notices */
  {
    id: '5.1',
    flow: 5,
    given: 'Expiry is N days away',
    when: 'Renewal recipe fires',
    then: 'Task in pull queue; reminder sent with amount + offers',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Renewals are P2 (plan §11.2). The renewal task and its pull pool are seeded, but no renewals screen exists to walk them on.',
    },
  },
  {
    id: '5.2',
    flow: 5,
    given: 'Tasks in pool',
    when: 'Member self-assigns',
    then: 'Ownership recorded',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Renewals are P2 (plan §11.2). The renewal task and its pull pool are seeded, but no renewals screen exists to walk them on.',
    },
  },
  {
    id: '5.3',
    flow: 5,
    given: 'Month\'s notices arrive',
    when: 'Bulk upload',
    then: 'Each read by its company\'s template; rows to review',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Renewals are P2, and NoticeBatch, NoticeMatch and OcrTemplate are unmodelled — recorded in the playbook Backlog.',
    },
  },
  {
    id: '5.4',
    flow: 5,
    given: 'A notice can\'t match',
    when: 'Review flags it',
    then: 'Cannot auto-send; manual link or reject',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Renewals are P2, and NoticeBatch, NoticeMatch and OcrTemplate are unmodelled — recorded in the playbook Backlog.',
    },
  },
  {
    id: '5.5',
    flow: 5,
    given: 'Matches confirmed',
    when: 'Send-all clicked',
    then: 'Each customer gets own PDF; renewal request per policy',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Renewals are P2, and NoticeBatch, NoticeMatch and OcrTemplate are unmodelled — recorded in the playbook Backlog.',
    },
  },
  {
    id: '5.6',
    flow: 5,
    given: 'Backdate needed',
    when: 'Done with permission',
    then: 'Who/when/original date audit-logged',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Renewals are P2 (plan §11.2). The renewal task and its pull pool are seeded, but no renewals screen exists to walk them on.',
    },
  },
  {
    id: '5.7',
    flow: 5,
    given: 'Renewal completes',
    when: 'Policy renews',
    then: 'New term + PDF version; commission recalculates',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Renewals are P2 (plan §11.2). The renewal task and its pull pool are seeded, but no renewals screen exists to walk them on.',
    },
  },

  /* 6. Admin Configuration */
  {
    id: '6.1',
    flow: 6,
    given: 'A new insurer partnership',
    when: 'Company + policies added per line',
    then: 'Available across quotation, placement, claims with its contacts',
    phase: 'M0',
    coverage: {
      state: 'covered-here',
      tests: [
        {
          file: 'src/test/scenarios/admin-configuration.test.tsx',
          name:
            '6.1 a new insurer partnership is added with its lines, its policies and its contacts, and is then available to place',
        },
      ],
    },
  },
  {
    id: '6.2',
    flow: 6,
    given: 'Client process differs per product',
    when: 'SKU form schemas built: stages, fields, branching',
    then: 'Every entry form renders their way; old records keep their original schema',
    phase: 'P1',
    coverage: {
      state: 'pending',
      step: 'P1',
      why:
        'The schema builder at /config/forms is P1 (plan §11.2). The second half of this row is already true and proved at the domain level — a record keeps the schema version it was written on — but no screen lets an admin build the schema, so the row cannot be walked.',
      partly: [
        {
          file: 'src/domain/forms/catalogue.test.ts',
          name:
            'resolves the pinned version even though it is no longer live',
        },
        {
          file: 'src/domain/forms/catalogue.test.ts',
          name:
            'renders February s stages, not May s',
        },
      ],
    },
  },
  {
    id: '6.3',
    flow: 6,
    given: 'A new placement code obtained',
    when: 'Agency added: type, companies, policy scope, commission %',
    then: 'Individual locks to one company; Broker allows many; placement filtered by scope',
    phase: 'M0',
    coverage: {
      state: 'covered-here',
      tests: [
        {
          file: 'src/test/scenarios/admin-configuration.test.tsx',
          name:
            '6.3 a new placement code is added as an agency with its type, companies, policy scope and commission',
        },
      ],
    },
  },
  {
    id: '6.4',
    flow: 6,
    given: 'A new agent joins',
    when: 'Agent added: % set, sub-agent grant, cap, direct-updates toggle',
    then: 'Agent can build his own sub-agent team within the cap',
    phase: 'M0',
    coverage: {
      state: 'covered-here',
      tests: [
        {
          file: 'src/test/scenarios/admin-configuration.test.tsx',
          name:
            '6.4 a new agent joins with a percentage, a sub-agent grant, a cap and a direct-updates toggle, and builds a team inside it',
        },
      ],
    },
  },
  {
    id: '6.5',
    flow: 6,
    given: 'A rule needs changing',
    when: 'Recipe edited (TAT, renewal days, templates)',
    then: 'Behavior changes immediately — no developer',
    phase: 'P1',
    coverage: {
      state: 'pending',
      step: 'P1',
      why:
        'Automation recipe parameters live at /config/automation, which is P1 (plan §11.2). The TAT allowance is already read from the inquiry category rather than from code, but no screen edits it.',
    },
  },

  /* 7. Endorsement & Cancellation */
  {
    id: '7.1',
    flow: 7,
    given: 'Address correction',
    when: 'Non-financial type chosen',
    then: 'Correction fields only; no premium block',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Endorsement and cancellation are P2 (plan §11.2), and the Endorsement entity is unmodelled — recorded in the playbook Backlog.',
    },
  },
  {
    id: '7.2',
    flow: 7,
    given: 'Member added to floater',
    when: 'Financial type chosen',
    then: 'Member picker + premium delta; commission adjusts',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Endorsement and cancellation are P2 (plan §11.2), and the Endorsement entity is unmodelled — recorded in the playbook Backlog.',
    },
  },
  {
    id: '7.3',
    flow: 7,
    given: 'Cancel a 1-yr policy',
    when: 'System checks own claims',
    then: 'Claim this period → \'refund not eligible\' instantly',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Endorsement and cancellation are P2 (plan §11.2), and the Endorsement entity is unmodelled — recorded in the playbook Backlog.',
    },
  },
  {
    id: '7.4',
    flow: 7,
    given: 'Cancellation eligible',
    when: 'Refund entered manually',
    then: 'Insurer\'s figure; method noted; record-only',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Endorsement and cancellation are P2 (plan §11.2), and the Endorsement entity is unmodelled — recorded in the playbook Backlog.',
    },
  },
  {
    id: '7.5',
    flow: 7,
    given: 'Endorsement approved',
    when: 'Version created',
    then: 'Immutable history; both endorsement numbers; new PDF',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Endorsement and cancellation are P2 (plan §11.2), and the Endorsement entity is unmodelled — recorded in the playbook Backlog.',
    },
  },
  {
    id: '7.6',
    flow: 7,
    given: 'Change too large',
    when: 'Endorsement attempted',
    then: 'System suggests fresh issue instead',
    phase: 'P2',
    coverage: {
      state: 'pending',
      step: 'P2',
      why:
        'Endorsement and cancellation are P2 (plan §11.2), and the Endorsement entity is unmodelled — recorded in the playbook Backlog.',
    },
  },]

/* ------------------------------------------------------------------ queries */

/** The rows the golden path owes — plan §11.2's M0 column, and nothing else. */
export function m0Rows(): readonly ScenarioRow[] {
  return SCENARIOS.filter((row) => row.phase === 'M0')
}

export function rowsInState(state: CoverageState): readonly ScenarioRow[] {
  return SCENARIOS.filter((row) => row.coverage.state === state)
}

/** Every test the registry claims, flattened. `partly` refs are included. */
export function claimedTests(): readonly TestRef[] {
  return SCENARIOS.flatMap((row) =>
    row.coverage.state === 'pending' ? (row.coverage.partly ?? []) : row.coverage.tests,
  )
}

export function rowById(id: string): ScenarioRow | undefined {
  return SCENARIOS.find((row) => row.id === id)
}
