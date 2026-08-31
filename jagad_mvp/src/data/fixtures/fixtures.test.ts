import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SCHEMA_PROBLEM_CODES, validateFormSchema } from '../../domain/forms'
import { containsFullAadhaar } from '../../domain/workflows'
import { buildFixtures } from './index'
import type { FixtureSet } from './index'
import { FIXTURE_SCHEMAS } from './schema'

const fixtures = buildFixtures()

/** Every table is covered by a schema, and every schema names a real table. */
type SchemaCoverage = Exclude<keyof FixtureSet, keyof typeof FIXTURE_SCHEMAS> extends never
  ? Exclude<keyof typeof FIXTURE_SCHEMAS, keyof FixtureSet> extends never
    ? true
    : { schemaWithoutTable: Exclude<keyof typeof FIXTURE_SCHEMAS, keyof FixtureSet> }
  : { tableWithoutSchema: Exclude<keyof FixtureSet, keyof typeof FIXTURE_SCHEMAS> }

const coverage: SchemaCoverage = true

function ids(rows: readonly { readonly id: string }[]): Set<string> {
  return new Set(rows.map((row) => row.id))
}

/**
 * One foreign key: the rows that hold it, how to read it, and the set it must
 * resolve into. Written as data so a new reference is one line rather than one
 * more forgotten assertion.
 */
type Reference = {
  readonly from: string
  readonly rows: readonly unknown[]
  readonly read: (row: never) => string | null
  readonly into: Set<string>
}

const companyIds = ids(fixtures.companies)
const productIds = ids(fixtures.products)
const agencyIds = ids(fixtures.agencies)
const agentIds = ids(fixtures.agents)
const userIds = ids(fixtures.users)
const teamIds = ids(fixtures.teams)
const categoryIds = ids(fixtures.categories)
const customerIds = ids(fixtures.customers)
const policyIds = ids(fixtures.policies)
const quotationIds = ids(fixtures.quotations)
const benefitIds = ids(fixtures.benefitItems)
const documentIds = ids(fixtures.documents)
const scheduleIds = ids(fixtures.premiumSchedules)
const mandateIds = ids(fixtures.mandates)
const collectionIds = ids(fixtures.collections)
const formSchemaIds = ids(fixtures.formSchemas)
const claimIds = ids(fixtures.claims)
const endorsementIds = ids(fixtures.endorsements)
const noticeBatchIds = ids(fixtures.noticeBatches)
const ocrTemplateIds = ids(fixtures.ocrTemplates)
const policyVersionIds = ids(fixtures.policyVersions)
const masterTypeIds = ids(fixtures.masterTypes)
const retentionKeys = new Set(fixtures.retentionClasses.map((entry) => entry.key))

function reference<T>(
  from: string,
  rows: readonly T[],
  read: (row: T) => string | null,
  into: Set<string>,
): Reference {
  return { from, rows, read: read as (row: never) => string | null, into }
}

const REFERENCES: readonly Reference[] = [
  reference('StaffUser.teamId', fixtures.users, (row) => row.teamId, teamIds),
  reference('StaffUser.agentId', fixtures.users, (row) => row.agentId, agentIds),
  reference('StaffUser.parentAgentId', fixtures.users, (row) => row.parentAgentId, agentIds),
  reference('Team.leadUserId', fixtures.teams, (row) => row.leadUserId, userIds),
  reference('InquiryCategory.teamId', fixtures.categories, (row) => row.teamId, teamIds),
  reference('MasterValue.masterTypeId', fixtures.masterValues, (row) => row.masterTypeId, masterTypeIds),
  reference('FormSchema.productId', fixtures.formSchemas, (row) => row.productId, productIds),

  reference('CompanyContact.companyId', fixtures.companyContacts, (row) => row.companyId, companyIds),
  reference('Product.companyId', fixtures.products, (row) => row.companyId, companyIds),
  reference('Product.categoryId', fixtures.products, (row) => row.categoryId, categoryIds),
  reference('Product.formSchemaId', fixtures.products, (row) => row.formSchemaId, formSchemaIds),
  reference('DocChecklist.companyId', fixtures.docChecklists, (row) => row.companyId, companyIds),
  reference('DocChecklist.productId', fixtures.docChecklists, (row) => row.productId, productIds),
  reference('PolicyBenefitMap.productId', fixtures.policyBenefitMaps, (row) => row.productId, productIds),
  reference('PolicyBenefitMap.benefitItemId', fixtures.policyBenefitMaps, (row) => row.benefitItemId, benefitIds),
  reference('AgencyPolicyScope.agencyId', fixtures.agencyScopes, (row) => row.agencyId, agencyIds),
  reference('AgencyPolicyScope.companyId', fixtures.agencyScopes, (row) => row.companyId, companyIds),
  reference('AgencyPolicyScope.productId', fixtures.agencyScopes, (row) => row.productId, productIds),
  reference('Agent.agencyId', fixtures.agents, (row) => row.agencyId, agencyIds),
  reference('Agent.userId', fixtures.agents, (row) => row.userId, userIds),
  reference('Agent.parentAgentId', fixtures.agents, (row) => row.parentAgentId, agentIds),
  reference('CommissionSplit.agentId', fixtures.commissionSplits, (row) => row.agentId, agentIds),
  reference('CommissionSplit.subAgentId', fixtures.commissionSplits, (row) => row.subAgentId, agentIds),
  reference('CommissionRule.agencyId', fixtures.commissionRules, (row) => row.agencyId, agencyIds),
  reference('CommissionRule.productId', fixtures.commissionRules, (row) => row.productId, productIds),

  reference('Household.headCustomerId', fixtures.households, (row) => row.headCustomerId, customerIds),
  reference('Customer.ownerId', fixtures.customers, (row) => row.ownerId, userIds),
  reference('Customer.agentId', fixtures.customers, (row) => row.agentId, agentIds),
  reference('Customer.subAgentId', fixtures.customers, (row) => row.subAgentId, agentIds),
  reference('Member.customerId', fixtures.members, (row) => row.customerId, customerIds),
  reference('ConsentRecord.customerId', fixtures.consentRecords, (row) => row.customerId, customerIds),
  reference('CustomerCredential.customerId', fixtures.customerCredentials, (row) => row.customerId, customerIds),

  reference('Inquiry.ownerId', fixtures.inquiries, (row) => row.ownerId, userIds),
  reference('Inquiry.teamId', fixtures.inquiries, (row) => row.teamId, teamIds),
  reference('Inquiry.categoryId', fixtures.inquiries, (row) => row.categoryId, categoryIds),
  reference('Inquiry.customerId', fixtures.inquiries, (row) => row.customerId, customerIds),
  reference('Inquiry.agentId', fixtures.inquiries, (row) => row.agentId, agentIds),
  reference('Inquiry.subAgentId', fixtures.inquiries, (row) => row.subAgentId, agentIds),

  reference('Quotation.customerId', fixtures.quotations, (row) => row.customerId, customerIds),
  reference('Quotation.inquiryId', fixtures.quotations, (row) => row.inquiryId, ids(fixtures.inquiries)),
  reference('Quotation.ownerId', fixtures.quotations, (row) => row.ownerId, userIds),
  reference('Quotation.agentId', fixtures.quotations, (row) => row.agentId, agentIds),
  reference('Quotation.subAgentId', fixtures.quotations, (row) => row.subAgentId, agentIds),
  reference('Quotation.documentId', fixtures.quotations, (row) => row.documentId, documentIds),
  reference('QuotationLine.quotationId', fixtures.quotationLines, (row) => row.quotationId, quotationIds),
  reference('QuotationLine.companyId', fixtures.quotationLines, (row) => row.companyId, companyIds),
  reference('QuotationLine.productId', fixtures.quotationLines, (row) => row.productId, productIds),

  reference('Deal.quotationId', fixtures.deals, (row) => row.quotationId, quotationIds),
  reference('Deal.customerId', fixtures.deals, (row) => row.customerId, customerIds),
  reference('Deal.agentId', fixtures.deals, (row) => row.agentId, agentIds),
  reference('Deal.subAgentId', fixtures.deals, (row) => row.subAgentId, agentIds),
  reference('Deal.agencyId', fixtures.deals, (row) => row.agencyId, agencyIds),
  reference('Deal.consumedByPolicyId', fixtures.deals, (row) => row.consumedByPolicyId, policyIds),

  reference('Policy.customerId', fixtures.policies, (row) => row.customerId, customerIds),
  reference('Policy.companyId', fixtures.policies, (row) => row.companyId, companyIds),
  reference('Policy.productId', fixtures.policies, (row) => row.productId, productIds),
  reference('Policy.agencyId', fixtures.policies, (row) => row.agencyId, agencyIds),
  reference('Policy.agentId', fixtures.policies, (row) => row.agentId, agentIds),
  reference('Policy.retentionClass', fixtures.policies, (row) => row.retentionClass, retentionKeys),
  reference('PolicyVersion.policyId', fixtures.policyVersions, (row) => row.policyId, policyIds),
  reference('PolicyVersion.documentId', fixtures.policyVersions, (row) => row.documentId, documentIds),
  reference('PolicyEntryDraft.policyId', fixtures.policyDrafts, (row) => row.policyId, policyIds),
  reference('PolicyEntryDraft.dealId', fixtures.policyDrafts, (row) => row.dealId, ids(fixtures.deals)),
  reference('PolicyEntryDraft.formSchemaId', fixtures.policyDrafts, (row) => row.formSchemaId, formSchemaIds),
  reference('PremiumSchedule.policyId', fixtures.premiumSchedules, (row) => row.policyId, policyIds),
  reference('InstalmentDue.scheduleId', fixtures.instalments, (row) => row.scheduleId, scheduleIds),
  reference('InstalmentDue.policyId', fixtures.instalments, (row) => row.policyId, policyIds),
  reference('InstalmentDue.collectionRecordId', fixtures.instalments, (row) => row.collectionRecordId, collectionIds),
  reference('Mandate.policyId', fixtures.mandates, (row) => row.policyId, policyIds),
  reference('Mandate.customerId', fixtures.mandates, (row) => row.customerId, customerIds),
  reference('MandateEvent.mandateId', fixtures.mandateEvents, (row) => row.mandateId, mandateIds),
  reference('CollectionRecord.policyId', fixtures.collections, (row) => row.policyId, policyIds),
  reference('CollectionRecord.customerId', fixtures.collections, (row) => row.customerId, customerIds),
  reference('CollectionRecord.agencyId', fixtures.collections, (row) => row.agencyId, agencyIds),
  reference('CollectionRecord.instalmentId', fixtures.collections, (row) => row.instalmentId, ids(fixtures.instalments)),

  reference('Task.ownerId', fixtures.tasks, (row) => row.ownerId, userIds),
  reference('Task.teamId', fixtures.tasks, (row) => row.teamId, teamIds),
  reference('Task.agentId', fixtures.tasks, (row) => row.agentId, agentIds),
  reference('RenewalTask.policyId', fixtures.renewalTasks, (row) => row.policyId, policyIds),
  reference('RenewalTask.customerId', fixtures.renewalTasks, (row) => row.customerId, customerIds),
  reference('RenewalTask.assigneeId', fixtures.renewalTasks, (row) => row.assigneeId, userIds),
  reference('Document.verifiedBy', fixtures.documents, (row) => row.verifiedBy, userIds),
  reference('Document.retentionClass', fixtures.documents, (row) => row.retentionClass, retentionKeys),
  reference('Claim.policyId', fixtures.claims, (row) => row.policyId, policyIds),
  reference('Claim.customerId', fixtures.claims, (row) => row.customerId, customerIds),
  reference('Claim.ownerId', fixtures.claims, (row) => row.ownerId, userIds),
  reference('Claim.agentId', fixtures.claims, (row) => row.agentId, agentIds),
  reference('LedgerEntry.policyId', fixtures.ledgerEntries, (row) => row.policyId, policyIds),
  reference('LedgerEntry.agencyId', fixtures.ledgerEntries, (row) => row.agencyId, agencyIds),
  reference('LedgerEntry.agentId', fixtures.ledgerEntries, (row) => row.agentId, agentIds),
  reference('LedgerEntry.bookedBy', fixtures.ledgerEntries, (row) => row.bookedBy, userIds),

  reference('Endorsement.policyId', fixtures.endorsements, (row) => row.policyId, policyIds),
  reference('Endorsement.customerId', fixtures.endorsements, (row) => row.customerId, customerIds),
  reference('Endorsement.ownerId', fixtures.endorsements, (row) => row.ownerId, userIds),
  reference('Endorsement.approvedBy', fixtures.endorsements, (row) => row.approvedBy, userIds),
  reference('Endorsement.policyVersionId', fixtures.endorsements, (row) => row.policyVersionId, policyVersionIds),
  reference('Endorsement.documentId', fixtures.endorsements, (row) => row.documentId, documentIds),
  reference('OcrTemplate.companyId', fixtures.ocrTemplates, (row) => row.companyId, companyIds),
  reference('NoticeBatch.companyId', fixtures.noticeBatches, (row) => row.companyId, companyIds),
  reference('NoticeBatch.ocrTemplateId', fixtures.noticeBatches, (row) => row.ocrTemplateId, ocrTemplateIds),
  reference('NoticeBatch.sourceDocumentId', fixtures.noticeBatches, (row) => row.sourceDocumentId, documentIds),
  reference('NoticeBatch.uploadedBy', fixtures.noticeBatches, (row) => row.uploadedBy, userIds),
  reference('NoticeBatch.sentBy', fixtures.noticeBatches, (row) => row.sentBy, userIds),
  reference('NoticeMatch.batchId', fixtures.noticeMatches, (row) => row.batchId, noticeBatchIds),
  reference('NoticeMatch.matchedPolicyId', fixtures.noticeMatches, (row) => row.matchedPolicyId, policyIds),
  reference('NoticeMatch.matchedCustomerId', fixtures.noticeMatches, (row) => row.matchedCustomerId, customerIds),
  reference('NoticeMatch.manuallyLinkedBy', fixtures.noticeMatches, (row) => row.manuallyLinkedBy, userIds),
  reference('MessageTemplate.updatedBy', fixtures.messageTemplates, (row) => row.updatedBy, userIds),
  reference('MessageTemplate.recipeKey', fixtures.messageTemplates, (row) => row.recipeKey, new Set(fixtures.recipes.map((recipe) => recipe.key))),
  reference('IntegrationConfig.updatedBy', fixtures.integrations, (row) => row.updatedBy, userIds),
]

describe('every fixture satisfies its schema', () => {
  it('covers every table with a schema, checked by the compiler', () => {
    expect(coverage).toBe(true)
    expect(Object.keys(FIXTURE_SCHEMAS).sort()).toEqual(Object.keys(fixtures).sort())
  })

  /*
   * Tables that are empty on purpose, and why each one is.
   *
   * The non-empty rule below is not pedantry: a table nobody seeded is a table
   * whose screens were never seen with data, and that is how an empty state
   * ships as a feature. So an exemption has to name itself here rather than be
   * won by deleting the assertion.
   *
   * `recipeRuns` is FR-21.5's ledger. A run is something the dispatcher DID, so
   * seeding one would assert that an automation fired when none has — the same
   * lie the 800 seeded tasks tell when they are read as generated work. The
   * screens that read it are exercised against runs the engine really wrote, in
   * `src/data/automation/automation.test.ts`.
   */
  const DELIBERATELY_EMPTY = new Set<keyof FixtureSet>(['recipeRuns'])

  for (const [table, schema] of Object.entries(FIXTURE_SCHEMAS)) {
    it(`parses every row of ${table}`, () => {
      const rows = fixtures[table as keyof FixtureSet]
      if (DELIBERATELY_EMPTY.has(table as keyof FixtureSet)) {
        expect(rows).toHaveLength(0)
      } else {
        expect(rows.length).toBeGreaterThan(0)
      }

      const result = z.array(schema).safeParse(rows)
      if (!result.success) {
        const first = result.error.issues[0]
        throw new Error(`${table}[${first.path.join('.')}]: ${first.message}`)
      }
    })
  }
})

describe('every foreign key resolves', () => {
  it('has no dangling reference anywhere in the set', () => {
    const dangling: string[] = []

    for (const ref of REFERENCES) {
      for (const row of ref.rows) {
        const value = ref.read(row as never)
        // Absence is a legitimate answer everywhere in this model — an inquiry
        // with no category is canvas 1.5, not a broken row.
        if (value === null || value === undefined) continue
        if (!ref.into.has(value)) dangling.push(`${ref.from} -> ${value}`)
      }
    }

    expect(dangling).toEqual([])
  })

  it('resolves the ids held inside arrays too', () => {
    const dangling: string[] = []
    const policyIdSet = ids(fixtures.policies)
    const memberIdSet = ids(fixtures.members)

    for (const member of fixtures.members) {
      for (const policyId of member.coveredUnderPolicyIds) {
        if (!policyIdSet.has(policyId)) dangling.push(`Member.coveredUnderPolicyIds -> ${policyId}`)
      }
    }
    for (const policy of fixtures.policies) {
      for (const memberId of policy.memberIds) {
        if (!memberIdSet.has(memberId)) dangling.push(`Policy.memberIds -> ${memberId}`)
      }
    }
    for (const deal of fixtures.deals) {
      for (const item of deal.lineItems) {
        if (!companyIds.has(item.companyId)) dangling.push(`DealLineItem.companyId -> ${item.companyId}`)
        if (!productIds.has(item.productId)) dangling.push(`DealLineItem.productId -> ${item.productId}`)
      }
    }
    for (const claim of fixtures.claims) {
      for (const docId of claim.documentIds) {
        if (!documentIds.has(docId)) dangling.push(`Claim.documentIds -> ${docId}`)
      }
    }
    for (const endorsement of fixtures.endorsements) {
      for (const claimId of endorsement.claimsVerdict?.claimIds ?? []) {
        if (!claimIds.has(claimId)) {
          dangling.push(`Endorsement.claimsVerdict.claimIds -> ${claimId}`)
        }
      }
    }

    expect(dangling).toEqual([])
  })

  it('gives every subject-referencing document and task a real subject', () => {
    const subjects: Record<string, Set<string>> = {
      Customer: customerIds,
      Policy: policyIds,
      Quotation: quotationIds,
      Inquiry: ids(fixtures.inquiries),
      Claim: claimIds,
      Deal: ids(fixtures.deals),
      // The paper behind an endorsement and behind an uploaded notice batch is a
      // document like any other, and its subject is the record it belongs to.
      Endorsement: endorsementIds,
      NoticeBatch: noticeBatchIds,
    }

    const dangling: string[] = []
    for (const row of [...fixtures.documents, ...fixtures.tasks, ...fixtures.messageLogs]) {
      const pool = subjects[row.subjectEntity]
      if (!pool) {
        dangling.push(`unknown subject entity ${row.subjectEntity}`)
        continue
      }
      if (!pool.has(row.subjectId)) dangling.push(`${row.subjectEntity} -> ${row.subjectId}`)
    }

    expect(dangling).toEqual([])
  })

  it('places every policy inside an agency that is appointed for its product', () => {
    const scopes = new Set(
      fixtures.agencyScopes.map((scope) => `${scope.agencyId}|${scope.productId}`),
    )
    const offside = fixtures.policies
      .filter((policy) => !scopes.has(`${policy.agencyId}|${policy.productId}`))
      .map((policy) => `${policy.systemNo} via ${policy.agencyId}`)

    expect(offside).toEqual([])
  })
})

describe('the invariants a fixture is capable of violating', () => {
  it('never carries a full Aadhaar number, in any field of any table', () => {
    /**
     * `containsFullAadhaar` looks for any run of twelve digits, which is the
     * right check and catches one thing that is not an Aadhaar: an insurer's own
     * policy number. The prototype prints HDFC Ergo's as "2825 1049 7731 00",
     * fourteen digits, and that number has to stay exactly as the client reads
     * it aloud. So the two insurer-issued identifier fields are named here, and
     * the assertion below proves neither of them exists on a person's record.
     */
    const insurerIssued = new Set([
      'policies.insurerNo',
      'claims.insurerNo',
      // Same shape, same reason: an insurer's endorsement number and the policy
      // number printed on its renewal notice are the company's own identifiers,
      // and they run past twelve digits exactly as the client reads them aloud.
      'endorsements.insurerEndorsementNo',
      'policyVersions.insurerEndorsementNo',
      'noticeMatches.noticePolicyNo',
    ])
    const offenders: string[] = []

    for (const [table, rows] of Object.entries(fixtures)) {
      for (const row of rows as readonly Record<string, unknown>[]) {
        for (const [field, value] of Object.entries(row)) {
          if (typeof value !== 'string') continue
          if (insurerIssued.has(`${table}.${field}`)) continue
          if (containsFullAadhaar(value)) offenders.push(`${table}.${field}`)
        }
      }
    }

    expect(offenders).toEqual([])

    for (const row of [...fixtures.customers, ...fixtures.members]) {
      expect(Object.keys(row)).not.toContain('insurerNo')
    }
  })

  it('gives every referred inquiry a referrer, and every other inquiry none', () => {
    for (const inquiry of fixtures.inquiries) {
      if (inquiry.source === 'referral') {
        expect(
          inquiry.referral,
          `${inquiry.systemNo} came from a referral and does not say who referred it.`,
        ).not.toBeNull()
      } else {
        expect(
          inquiry.referral,
          `${inquiry.systemNo} names a referrer but its source is "${inquiry.source}".`,
        ).toBeNull()
      }
    }
  })

  it('points every referrer at a record that exists, or names one that does not', () => {
    const tableFor = { customer: 'customers', sub_agent: 'agents', staff: 'users' } as const

    for (const inquiry of fixtures.inquiries) {
      const referral = inquiry.referral
      if (referral === null) continue

      if (referral.kind === 'external') {
        expect(referral.referrerId).toBeNull()
        expect(referral.referrerName?.trim()).toBeTruthy()
        continue
      }

      expect(referral.referrerName).toBeNull()
      const rows = fixtures[tableFor[referral.kind]] as readonly { id: string }[]
      expect(
        rows.some((row) => row.id === referral.referrerId),
        `${inquiry.systemNo} is attributed to ${referral.referrerId}, which is in no ${tableFor[referral.kind]} row.`,
      ).toBe(true)
    }
  })

  it('leaves the aadhaarNumber field null everywhere it exists', () => {
    for (const customer of fixtures.customers) expect(customer.aadhaarNumber).toBeNull()
    for (const member of fixtures.members) expect(member.aadhaarNumber).toBeNull()
  })

  it('holds no full amount without a currency, and no fractional paise', () => {
    const amounts = [
      ...fixtures.policies.flatMap((policy) => [
        policy.finalPremium,
        policy.netPremium,
        policy.gstAmount,
        policy.sumInsured,
      ]),
      ...fixtures.quotationLines.map((line) => line.finalPayablePremium),
      ...fixtures.instalments.map((instalment) => instalment.amount),
      ...fixtures.ledgerEntries.map((entry) => entry.amount),
    ].filter((amount) => amount !== null)

    for (const amount of amounts) {
      expect(Number.isInteger(amount.paise)).toBe(true)
      expect(amount.currency).toBe('INR')
    }
  })

  it('keeps Final equal to Net plus GST wherever all three are present', () => {
    // The only arithmetic on money the product allows. If a fixture drifts from
    // it, the roll-up on screen would contradict the figures beside it.
    for (const policy of fixtures.policies) {
      if (!policy.netPremium || !policy.gstAmount || !policy.finalPremium) continue
      expect(policy.finalPremium.paise).toBe(policy.netPremium.paise + policy.gstAmount.paise)
    }
  })

  it('gives every id in the set exactly one owner', () => {
    for (const [table, rows] of Object.entries(fixtures)) {
      const seen = new Set<string>()
      for (const row of rows as readonly { id: string }[]) {
        expect(seen.has(row.id), `${table} has a duplicate id: ${row.id}`).toBe(false)
        seen.add(row.id)
      }
    }
  })

  it('numbers every record kind the way the prototype prints it', () => {
    expect(fixtures.inquiries.map((row) => row.systemNo)).toContain('INQ-1041')
    expect(fixtures.quotations.map((row) => row.systemNo)).toContain('QTN-0332')
    expect(fixtures.deals.map((row) => row.systemNo)).toContain('APP-0774')
    expect(fixtures.policies.map((row) => row.systemNo)).toContain('POL-4388')
    expect(fixtures.policies.map((row) => row.systemNo)).toContain('POL-DRAFT-0219')
    expect(fixtures.claims.map((row) => row.systemNo)).toContain('CLM-0412')
  })
})

describe('the volume the plan asks for', () => {
  it('carries roughly 300 customers, 500 policies and 800 tasks', () => {
    expect(fixtures.customers.length).toBeGreaterThanOrEqual(300)
    expect(fixtures.policies.length).toBeGreaterThanOrEqual(500)
    expect(fixtures.tasks.length).toBeGreaterThanOrEqual(800)
  })

  it('seeds the config with eight insurers, twenty-four products and forty-plus benefits', () => {
    expect(fixtures.companies).toHaveLength(8)
    expect(fixtures.products).toHaveLength(24)
    expect(fixtures.benefitItems.length).toBeGreaterThanOrEqual(40)
    expect(fixtures.agencies).toHaveLength(4)
    expect(fixtures.agencies.filter((agency) => agency.type === 'individual')).toHaveLength(2)
    expect(fixtures.agencies.filter((agency) => agency.type === 'broker')).toHaveLength(2)
  })

  it('names the six personas from the prototype walkthrough', () => {
    const names = fixtures.users.map((user) => user.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'Vivek Jagad',
        'Nikunj Shah',
        'Kiran Solanki',
        'Priya Desai',
        'Amit Rana',
        'Sneha Patel',
      ]),
    )
  })

  it('gives Kiran Solanki a sub-agent reporting to him', () => {
    const kiran = fixtures.agents.find((agent) => agent.name === 'Kiran Solanki')
    expect(kiran?.canGrantSubAgents).toBe(true)
    const subAgents = fixtures.agents.filter((agent) => agent.parentAgentId === kiran?.id)
    expect(subAgents).toHaveLength(1)
    // Canvas 6.4: the team is built inside the cap, not beyond it.
    expect(subAgents[0].sharePercentBp).toBeLessThanOrEqual(kiran?.subAgentCapPercentBp ?? 0)
  })

  it('publishes no required choice a person could reach a dead end in', () => {
    /*
     * A select with neither inline options nor a master list renders as an empty
     * box that will not open. `validateFormSchema` calls that advisory on
     * purpose — a choice waiting on a master list somebody has not configured
     * yet is a form that still works — but advisory stops being true the moment
     * the field is required: there is then no value to give, so the form can
     * never be saved, and the screen says only that the field is needed. Two
     * seeded rows shipped in that state.
     */
    for (const schema of fixtures.formSchemas) {
      const required = new Set(
        schema.stages.flatMap((stage) =>
          stage.fields.filter((field) => field.required).map((field) => field.key),
        ),
      )
      const stuck = validateFormSchema(schema)
        .filter((problem) => problem.code === SCHEMA_PROBLEM_CODES.choiceWithoutOptions)
        .filter((problem) => problem.fieldKey !== null && required.has(problem.fieldKey))

      expect(
        stuck.map((problem) => `${schema.objectKey} v${schema.version}: ${problem.message}`),
      ).toEqual([])
    }
  })

  it('locks an Individual agency to one company and lets a Broker hold several', () => {
    for (const agency of fixtures.agencies) {
      if (agency.type === 'individual') expect(agency.companyIds).toHaveLength(1)
      else expect(agency.companyIds.length).toBeGreaterThan(1)
    }
  })
})
