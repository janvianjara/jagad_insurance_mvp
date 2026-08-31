/**
 * A hand-built `AssistantRepository`, and the projected rows to fill it with.
 *
 * This exists because the boundary is real. `src/features/assistant` may import
 * `src/data/assistant` and nothing else in the data layer, which means its tests
 * cannot reach `createMockRepositories` or the fixture set either — the eslint
 * zone does not have a test exemption, and it should not have one: an exemption
 * is a door, and the value of a door is measured by who else walks through it.
 *
 * So the tests here work the way the feature does. They are handed projections
 * and assert on what the feature makes of them. What the facade itself does with
 * `can()` — scope-filtering as the requesting user, giving a sub-agent nothing,
 * refusing an account with no Assistant grant — is proved where it lives, in
 * `src/data/assistant/boundary.test.ts`, against the real store and the real
 * permission evaluator. Duplicating that here would prove nothing new and would
 * add a second, weaker definition of scope.
 *
 * The stub is faithful in the one way that matters to these tests: `enabled`
 * false answers empty from every method, and every list returns exactly the rows
 * it was given, in order. Nothing in the feature is allowed to assume more.
 */

import type {
  AssistantClaim,
  AssistantInquiry,
  AssistantQuotation,
  AssistantRenewal,
  AssistantRepository,
  AssistantTask,
} from '../../data/assistant'

export type StubRows = {
  readonly inquiries?: readonly AssistantInquiry[]
  readonly quotations?: readonly AssistantQuotation[]
  readonly tasks?: readonly AssistantTask[]
  readonly claims?: readonly AssistantClaim[]
  readonly renewals?: readonly AssistantRenewal[]
}

type Page<T> = {
  readonly rows: readonly T[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly pageCount: number
}

function page<T>(rows: readonly T[]): Page<T> {
  return {
    rows,
    total: rows.length,
    page: 1,
    pageSize: Math.max(1, rows.length),
    pageCount: rows.length === 0 ? 0 : 1,
  }
}

export function stubAssistantRepository(
  rows: StubRows = {},
  options: { enabled?: boolean; userId?: string } = {},
): AssistantRepository {
  const enabled = options.enabled ?? true
  const give = <T>(supplied: readonly T[] | undefined): Page<T> =>
    page(enabled ? (supplied ?? []) : [])
  const none = <T>(): readonly T[] => []

  return {
    /*
     * The one assertion in this file, and it is not a way around the boundary.
     * `User` carries a resolved `PermissionTemplate`, which lives in `src/domain`
     * and cannot be imported here; the feature reads only `user.id`, and only as
     * a cache key. The assertion buys a test double, not access to anything.
     */
    user: { id: options.userId ?? 'usr-stub', name: 'Stub', templateKey: 'stub' } as
      AssistantRepository['user'],
    enabled,

    async customers() {
      return give(undefined)
    },
    async customer() {
      return null
    },
    async members() {
      return none()
    },
    async household() {
      return null
    },
    async consent() {
      return null
    },

    async inquiries() {
      return give(rows.inquiries)
    },
    async inquiry() {
      return null
    },

    async quotations() {
      return give(rows.quotations)
    },
    async quotation() {
      return null
    },
    async quotationLines() {
      return none()
    },

    async deals() {
      return give(undefined)
    },
    async deal() {
      return null
    },

    async policies() {
      return give(undefined)
    },
    async policy() {
      return null
    },
    async policiesForCustomer() {
      return none()
    },
    async policyVersions() {
      return none()
    },
    async policyDraft() {
      return null
    },

    async schedule() {
      return null
    },
    async instalments() {
      return none()
    },
    async mandate() {
      return null
    },
    async mandateEvents() {
      return none()
    },
    async collections() {
      return none()
    },

    async documents() {
      return none()
    },
    async documentPresence() {
      return {}
    },

    async tasks() {
      return give(rows.tasks)
    },
    async task() {
      return null
    },
    async renewals() {
      return give(rows.renewals)
    },

    async claims() {
      return give(rows.claims)
    },
    async claim() {
      return null
    },
    async claimsForCustomer() {
      return none()
    },

    async messages() {
      return none()
    },

    async companies() {
      return none()
    },
    async products() {
      return none()
    },
    async benefitItems() {
      return none()
    },
    async agencies() {
      return none()
    },
    async agents() {
      return none()
    },
    async staff() {
      return none()
    },
    async teams() {
      return none()
    },
    async categories() {
      return none()
    },
  }
}

/* ---------------------------------------------------------- row builders */

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export function anInquiry(over: Partial<AssistantInquiry> = {}): AssistantInquiry {
  return {
    id: 'inq-1',
    systemNo: 'INQ-1001',
    status: 'assigned',
    source: 'website',
    categoryId: 'cat-health',
    productInterest: ['health'],
    ownerId: 'usr-1',
    teamId: 'team-sales',
    agentId: null,
    subAgentId: null,
    assignedAt: new Date(Date.now() - HOUR_MS).toISOString(),
    tatDueAt: new Date(Date.now() + 8 * HOUR_MS).toISOString(),
    assignmentHistory: [],
    escalationLevel: 0,
    createdAt: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    customerId: null,
    // Engagement, FR-06.12 to .17. A stub inquiry has not been contacted, which
    // is the state every inquiry is in before somebody rings.
    stageKey: null,
    stageEnteredAt: null,
    contactAttempts: 0,
    lastActivityAt: null,
    nextActionAt: null,
    contactName: 'Rakesh Patel',
    contactMobile: '9800000000',
    contactEmail: null,
    ...over,
  }
}

export function aQuotation(over: Partial<AssistantQuotation> = {}): AssistantQuotation {
  return {
    id: 'qtn-1',
    systemNo: 'QTN-0331',
    version: 1,
    status: 'draft',
    customerId: 'cus-1',
    inquiryId: null,
    ownerId: 'usr-1',
    agentId: null,
    companyIds: [],
    productIds: [],
    benefitRows: [],
    premiumMode: 'annual',
    // Never fabricated here either: an amount exists only where one was recorded.
    finalPayablePremium: null,
    sharedAt: null,
    revisionReason: null,
    lostReason: null,
    createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    ...over,
  }
}

export function aTask(over: Partial<AssistantTask> = {}): AssistantTask {
  return {
    id: 'tsk-1',
    systemNo: 'TSK-0001',
    kind: 'inquiry_follow_up',
    title: 'Call the customer back',
    subjectEntity: 'Inquiry',
    subjectId: 'inq-1',
    ownerId: 'usr-1',
    teamId: 'team-sales',
    agentId: null,
    state: 'open',
    priority: 'normal',
    dueAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
    createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    completedAt: null,
    raisedBy: 'usr-1',
    ...over,
  }
}

export function aClaim(over: Partial<AssistantClaim> = {}): AssistantClaim {
  return {
    id: 'clm-1',
    systemNo: 'CLM-0402',
    insurerNo: null,
    policyId: 'pol-1',
    customerId: 'cus-1',
    memberId: null,
    claimType: 'file',
    state: 'intimated',
    ownerId: 'usr-1',
    agentId: null,
    raisedAt: new Date(Date.now() - 5 * DAY_MS).toISOString(),
    intimatedAt: null,
    settlement: { amount: null, deduction: null, source: null, insurerAdviceRef: null },
    documentIds: [],
    checklistItems: [],
    documentsCollected: [],
    ...over,
  }
}

export function aRenewal(over: Partial<AssistantRenewal> = {}): AssistantRenewal {
  return {
    id: 'rnw-1',
    policyId: 'pol-1',
    customerId: 'cus-1',
    state: 'in_pool',
    dueOn: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    expiryDate: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    assigneeId: null,
    remindersSent: 0,
    lastReminderAt: null,
    lapseReason: null,
    createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    ...over,
  }
}
