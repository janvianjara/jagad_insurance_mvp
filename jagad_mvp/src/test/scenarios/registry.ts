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
 * `pending` is deliberately not a synonym for "not done yet". A row is pending
 * because the plan puts it after M0, not because M0 is missing it. `phase` is
 * what separates the two, and `m0Rows()` is the filter that answers "what does
 * the golden path owe".
 *
 * As it stands: 48 rows, 21 of them M0, and **the M0 set owes nothing** — every
 * one of the twenty-one is walked by a named test. 3 rows are covered by a test
 * in this directory and 32 by a test in the feature that owns them; the 13 that
 * remain pending are all P1 or P2 rows whose screens the plan schedules after
 * M0. Canvas flow 2 was the last M0 block outstanding and P-13's quotation tests
 * now walk it, which is the edit that emptied `m0Pending`.
 *
 * Rows 3.3, 3.4 and 3.5 are worth a note, because they are the only rows here
 * carrying `partly`. P-15 built the payment fork, so each of them is walked by a
 * named test today — but all three are P1 rows whose screens (`/back-office/
 * collections` and the task queue) are not in M0, and a row is not covered
 * because part of it moves. `partly` is what that distinction is for: it names
 * the evidence without letting the row claim to be finished.
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/quotations/quotation-scenarios.test.tsx',
          name:
            '2.1 an agent picks three policies across two companies and the composer opens on one matrix: the union of the mapped benefit rows, a column per company, defaults pre-filled',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/quotations/quotation-scenarios.test.tsx',
          name:
            '2.2 a benefit the catalogue does not carry is added as an ad-hoc row with a value, appears on this quotation only, and leaves the catalogue untouched',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/quotations/quotation-scenarios.test.tsx',
          name:
            '2.3 the matrix is complete and a final premium is entered per company, so the quotation generates as a branded document, side by side, with every figure entered and none computed',
        },
        {
          file: 'src/features/quotations/quotation-scenarios.test.tsx',
          name:
            'generate stays blocked, and says why, until a person has typed a Final Payable Premium into every column',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/quotations/quotation-scenarios.test.tsx',
          name:
            '2.4 auto-share is on, so a quotation the agent generated and a quotation the agent uploaded both reach the customer on the configured channel and both are logged',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/quotations/quotation-scenarios.test.tsx',
          name:
            '2.5 the customer wants changes, so a revision is created with a compulsory reason, and the version it replaces stays immutable and still viewable',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/quotations/quotation-scenarios.test.tsx',
          name:
            '2.6 the customer declines, so the quotation is marked lost only once a reason is recorded, and the reason stays on the record for reporting',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/quotations/quotation-scenarios.test.tsx',
          name:
            '2.7 the customer agrees, so the quotation is marked won and a deal opens with an application number, the accepted line items, and the customer, agent and sub-agent linked',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/quotations/quotation-scenarios.test.tsx',
          name:
            '2.8 a deal exists so policy entry begins with its line items pre-populated, and a deal with nothing on it is blocked with the machine’s own sentence',
        },
      ],
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
        'Collections are P1 (plan §11.2). P-15 built the payment fork on the policy file, so the reference itself is now recorded and walked, and /back-office/collections now exists — but a direct-to-company payment never enters that queue, by design: it never touched the agency books. What is still missing is the create edge a collection needs before one can be opened outside the fixtures.',
      partly: [
        {
          file: 'src/features/policies/payment-fork.test.tsx',
          name:
            '3.3 a payment made straight to the company is recorded as a reference and never touches the agency books',
        },
      ],
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
        'Collections are P1 (plan §11.2). P-15 records an agency collection in any mode from the policy file and puts a cheque on bounce watch, and the verification queue at /back-office/collections is now built — it shows the recorded amount read-only and says in the machine own words that no receipt is issued. The row stays pending because the dedicated collection ENTRY screen is still P1: nothing yet opens a collection outside the fixtures.',
      partly: [
        {
          file: 'src/features/policies/payment-fork.test.tsx',
          name:
            '3.4 a collection taken by the agency is recorded in any mode, issues no receipt, and a cheque goes on bounce watch',
        },
        {
          file: 'src/features/collections/collections.test.tsx',
          name: 'renders the amount that was recorded and offers no control that changes it',
        },
        {
          file: 'src/features/collections/collections.test.tsx',
          name: 'says the platform issues no receipt, in the machine own words',
        },
      ],
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
        'Cheque bounce is walked from the policy file and from the verification queue, and the follow-up is raised on the same move in both. It stays pending because the follow-up is still an assertion rather than a record: `TaskRepository.create` exists now, but neither the policy desk nor the collection drawer calls it — both pass `followUpTaskCreated: true` into the collection machine — so nothing shows the task in the queue FR-15 promises. That queue is P1.',
      partly: [
        {
          file: 'src/features/policies/payment-fork.test.tsx',
          name:
            '3.5 a bounced cheque raises the follow-up task on the same move, and the collection reopens',
        },
        {
          file: 'src/features/collections/collections.test.tsx',
          name:
            'records the bounce, raises the task, and reopens the collection',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/policies/issuance.test.tsx',
          name:
            '3.6 the uploaded policy document fills the fields, a person confirms them, and both numbers are stored on a live policy',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/policies/drafts-queue.test.tsx',
          name:
            '3.7 a half-finished entry is saved as a draft and appears in the completion queue with what is still missing',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/claims/claim-scenarios.test.tsx',
          name:
            '4.1 a claim is intimated on an active policy, which draws a claim number and emails the insurer with the agent copied',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/claims/claim-scenarios.test.tsx',
          name:
            '4.2 a claim raised on a lapsed policy is blocked with the reason written out, and the sourcing agent is notified',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/claims/claim-scenarios.test.tsx',
          name:
            '4.3 the claims team picks the claim up, and the sales agent is informed rather than made the owner',
        },
      ],
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
        'The cashless fork is built and walked: a cashless claim is offered the tokenised link and never the checklist, and an issued link shows where it points, when it closes and how much it has taken. What no test walks is the word the row turns on — auto-sent. The link goes out from a person pressing Send the tokenised upload link through a gate, and no channel is read from configuration, because the claims cluster models no channel at all.',
      partly: [
        {
          file: 'src/features/claims/claim-scenarios.test.tsx',
          name:
            '4.4 the cashless and file forks never offer each other: a file claim gets the checklist, a cashless one gets the upload link',
        },
        {
          file: 'src/features/claims/claim-upload.test.tsx',
          name:
            'shows where it points, when it closes and how much it has taken',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/claims/claim-scenarios.test.tsx',
          name:
            '4.5 the customer uploads the discharge summary through the link, and it lands on the claim',
        },
        {
          file: 'src/features/claims/claim-upload.test.tsx',
          name:
            'refuses to record the summary while the upload link is still empty',
        },
      ],
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
        'The checklist half is built and walked — documents collected is refused until every item is on file, and the refusal names what is missing. The row asks for more than that: an on-field pickup task created automatically when the customer flagged pickup, and a handover tracked. The claims module deliberately folds pickup into the same state, saying so on screen — collected by the customer or picked up on field is the same state either way — so no pickup task exists and no handover is recorded.',
      partly: [
        {
          file: 'src/features/claims/claim-scenarios.test.tsx',
          name:
            '4.6 documents collected is refused until the checklist is complete, and names what is missing',
        },
      ],
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
        'The loop itself is walked and shown to be repeatable, which is the half of the row that is a machine. The other half is not a record: the explanation has no recipient list, no customer language and nothing that reaches a hospital. The screen says it goes to both in the language they were spoken to in, and that sentence is copy rather than something a test can read back.',
      partly: [
        {
          file: 'src/features/claims/claim-scenarios.test.tsx',
          name:
            '4.7 the insurer query loop can run more than once, and is visible while it is open',
        },
        {
          file: 'src/features/claims/claim-rules.test.tsx',
          name:
            'sends to the customer when the sourcing agent has direct updates on, and records that it did',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/claims/claim-scenarios.test.tsx',
          name:
            '4.8 close is refused on a settlement with no company remark, and allowed once the remark is written',
        },
        {
          file: 'src/features/claims/claim-rules.test.tsx',
          name:
            'names which of the two is missing rather than saying the action failed',
        },
        {
          file: 'src/features/claims/claim-rules.test.tsx',
          name:
            'carries the remark onto the record, where the insurer rating is built from it',
        },
      ],
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
        'FR-11 is built and walked both ways: a status change messages the customer with the claim number, and reroutes to the agent with the reroute logged when the direct-updates toggle is off. The row also asks that the customer panel match, and the portal at /portal/claims has no test of its own yet, so nothing reads the same status back from the customer side.',
      partly: [
        {
          file: 'src/features/claims/claim-rules.test.tsx',
          name:
            'sends to the customer when the sourcing agent has direct updates on, and records that it did',
        },
        {
          file: 'src/features/claims/claim-rules.test.tsx',
          name:
            'reroutes to the agent and logs the reroute when the direct-updates toggle is off',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/renewals/renewal-scenarios.test.tsx',
          name:
            '5.1 refuses to pool a renewal before its lead date, and names the date and the lead from configuration',
        },
        {
          file: 'src/features/renewals/renewal-scenarios.test.tsx',
          name:
            '5.3 refuses a bare reminder and sends one carrying the year-wise amounts and the offers',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/renewals/renewal-scenarios.test.tsx',
          name:
            '5.2 is taken from the pool by the person who will work it, and ownership is recorded',
        },
      ],
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
        'Both ends of the row are built and now walked: the upload names the extraction template configured for the insurer who sent the file and reads nothing off it, and a batch that has been read comes back as a review queue with its template named. The seam between them is not: nothing in the product completes an extraction, so a batch a person uploads stops at ocr_running and the rows to review belong to a batch the fixtures seeded.',
      partly: [
        {
          file: 'src/test/scenarios/renewal-notices.test.tsx',
          name:
            '5.3 a month of notices is uploaded against the template configured for that insurer, and nothing is read off it until a person starts the extraction',
        },
        {
          file: 'src/test/scenarios/renewal-notices.test.tsx',
          name:
            '5.3 the rows an extraction produced come back as a review queue, with the template they were read with named on the batch',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/notices/notice-review.test.tsx',
          name:
            'links the row, records who made it, and carries the confirmations with it',
        },
        {
          file: 'src/features/notices/notice-review.test.tsx',
          name:
            'rejects a row with the reason on the record, and only from Confirm',
        },
        {
          file: 'src/features/notices/unmatched-send-block.test.tsx',
          name:
            'has nothing to confirm, and says which rows and why',
        },
        {
          file: 'src/features/notices/unmatched-send-block.test.tsx',
          name:
            'blocks a send holding an unmatched row, and writes nothing',
        },
      ],
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
        'The send is built and walked: the ticked rows go out once they are clean, and the gate and the repository both refuse the batch while one of them is not. The rest of the row is a claim the screens make and nothing keeps — send writes the batch state and no more, so no per-customer PDF is produced and no renewal request is opened against any policy.',
      partly: [
        {
          file: 'src/features/notices/notice-review.test.tsx',
          name:
            'lets the batch go out once the rows in the send are clean',
        },
        {
          file: 'src/features/notices/unmatched-send-block.test.tsx',
          name:
            'sends the rows that are clean, once they are the only ones ticked',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/renewals/renewal-scenarios.test.tsx',
          name:
            'refuses a backdated term whose log is incomplete, naming what is missing',
        },
        {
          file: 'src/features/renewals/renewal-scenarios.test.tsx',
          name:
            'allows the backdated term once the reason is written, and carries the whole log with it',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/renewals/renewal-scenarios.test.tsx',
          name:
            '5.5 records a renewal as a new term, a new document version and a recalculated commission',
        },
      ],
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
        'The builder at /config/forms is built now — stages, fields and branching are edited on screen, and the rules that matter are held there (a reserved field cannot be removed, an amount cannot be computed or used as a condition). The row still cannot be walked because the builder edits a session store that no entry form reads: `forms-store` hydrates from the repository and writes back nowhere, so nothing shows an entry form rendering a schema an admin built. The second half is already true at the domain level.',
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
        {
          file: 'src/features/config/forms/reserved-fields.test.tsx',
          name:
            'offers no way to remove it, and says what depends on it',
        },
        {
          file: 'src/features/config/forms/no-computed-amount.test.tsx',
          name:
            'does not offer an amount as a condition, on a field or on a stage',
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
        'Editing is built: /config/automation edits a recipe parameter behind a gate and publishes a new version, and /config/templates does the same for wording. The row asks for more than the edit — behaviour changing immediately — and that is where it stops. `automation-store` holds the edit in the session and never writes back, while the screens that obey the parameter read `repositories.config.recipes()`, so an edited allowance or escalation recipient is invisible to the desk that is supposed to follow it.',
      partly: [
        {
          file: 'src/features/config/automation/recipe-parameters.test.tsx',
          name:
            'names the screen that reads it',
        },
        {
          file: 'src/features/config/automation/recipe-parameters.test.tsx',
          name:
            'writes nothing until the gate is confirmed, then publishes a new version',
        },
        {
          file: 'src/features/config/automation/recipe-parameters.test.tsx',
          name:
            'shows the allowance the inquiry queue measures its clock against',
        },
        {
          file: 'src/features/config/templates/template-version.test.tsx',
          name:
            'publishes the next version, and says so before it writes',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/endorsements/endorsement-reshape.test.tsx',
          name:
            'renders no premium field, and no amount at all, for a correction',
        },
        {
          file: 'src/features/endorsements/endorsement-reshape.test.tsx',
          name:
            'raises a correction the machine accepts, holding neither figure',
        },
      ],
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
        'The premium half is built and walked: the same form grows a premium delta the moment the change is called financial, and the delta is typed from the insurer advice rather than worked out. The other two clauses are not there. A floater has no member list, so there is no member picker — memberAdded is one changed-field tick among others — and nothing books a commission delta: the screen says approval does, and no repository move touches commission.',
      partly: [
        {
          file: 'src/features/endorsements/endorsement-reshape.test.tsx',
          name:
            'grows the premium block the moment the same form is told the change is financial',
        },
        {
          file: 'src/features/endorsements/endorsement-reshape.test.tsx',
          name:
            'offers a financial change the premium delta, and a cancellation none before the claims check',
        },
        {
          file: 'src/features/endorsements/endorsement-reshape.test.tsx',
          name:
            'shows a financial endorsement its typed delta, with the insurer document beside it',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/endorsements/endorsement-cancellation.test.tsx',
          name:
            'reads the platform’s own claim data and names the claim it found',
        },
        {
          file: 'src/features/endorsements/endorsement-cancellation.test.tsx',
          name:
            'shows the verdict before anybody presses anything',
        },
        {
          file: 'src/features/endorsements/endorsement-cancellation.test.tsx',
          name:
            'refuses the refund edge in the machine’s words and offers the one that is open',
        },
        {
          file: 'src/features/endorsements/endorsement-cancellation.test.tsx',
          name:
            'records refund_not_eligible from Confirm, and from nowhere else',
        },
      ],
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
        'Record-only is proved twice over: the refund reads as the insurer figure with the document it was read off beside it, and the machine refuses one that arrives without an insurer reference. Two things stop the row. No cancellation clear of claims is seeded on the check, so no test enters a refund by hand through the screen; and the method the refund was paid by is not modelled anywhere in the endorsement cluster.',
      partly: [
        {
          file: 'src/features/endorsements/endorsement-cancellation.test.tsx',
          name:
            'is shown with the document it was read off, never as something worked out',
        },
        {
          file: 'src/features/endorsements/endorsement-cancellation.test.tsx',
          name:
            'is refused by the machine when it arrives without an insurer reference',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/endorsements/endorsement-approval.test.tsx',
          name:
            'carries both endorsement numbers and leaves the earlier version alone',
        },
        {
          file: 'src/features/endorsements/endorsement-approval.test.tsx',
          name:
            'shows both numbers on the versions panel afterwards',
        },
      ],
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
      state: 'covered-elsewhere',
      tests: [
        {
          file: 'src/features/endorsements/endorsement-reshape.test.tsx',
          name:
            'is refused with the guard’s own sentence and a way to issue fresh instead',
        },
      ],
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
