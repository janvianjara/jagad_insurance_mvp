/**
 * The Assistant boundary test — plan §14.1, layer 3 of three.
 *
 * "Layer 3 is the one that matters in eighteen months." Layers 1 and 2 are a
 * classification registry and an allow-list, and both are only as good as the
 * attention of whoever last edited them. This file is what keeps them honest
 * after everybody has forgotten the conversation that produced them: it re-derives
 * the guarantee from the registries on every CI run, for every entity, and it
 * proves on every run that it is still capable of failing.
 *
 * The guarantee, stated once:
 *
 *   No field classed `sensitive` or `document-content`, in EITHER classification
 *   registry, can reach the Assistant — not the value, not the masked form, not
 *   through a projection written for an entity nobody classified.
 *
 * Why both registries. `FIELD_CLASSES` in `src/domain/dataclass.ts` classifies the
 * seven M0 domain entities. `DATA_FIELD_CLASSES` in `src/data/repo/classification.ts`
 * classifies the ~36 data-layer entities and cannot be folded into the domain one
 * without inverting the domain/data dependency. A boundary test written against
 * `FIELD_CLASSES` alone would pass while `Mandate.reference`, `Mandate.bankName`,
 * `ConsentRecord.token`, `CustomerCredential.username` and `Claim.companyRemark`
 * walked straight through it. The red-team section below proves exactly that, so
 * nobody is ever tempted to "simplify" this file back down to one registry.
 */

import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_FORBIDDEN_CLASSES,
  ENTITY_NAMES,
  FIELD_CLASSES,
} from '../../domain/dataclass'
import type { DataClass } from '../../domain/dataclass'
import { STARTER_TEMPLATES, canSeeClass } from '../../domain/permissions'
import type { User } from '../../domain/permissions'
import { DATA_ENTITY_NAMES, DATA_FIELD_CLASSES } from '../repo/classification'
import { NO_LATENCY, createMockRepositories, rowsOf } from '../mock'
import type { MockStore, MockTables } from '../mock'
import {
  ALL_ENTITY_NAMES,
  ASSISTANT_ALLOW,
  ASSISTANT_ENTITY_NAMES,
  assertAllowListIsClean,
  auditAllowList,
  classOfField,
  forbiddenFieldsOf,
  isClassifiedEntity,
  project,
} from './projection'
import type { AllowListShape, AssistantEntityName } from './projection'
import { createAssistantRepository } from './repository'

/* ------------------------------------------------------------------- setup */

const allowOf = (entity: AssistantEntityName): readonly string[] =>
  ASSISTANT_ALLOW[entity] as readonly string[]

const asShape = ASSISTANT_ALLOW as unknown as AllowListShape

/** A copy of the real allow-list with one extra field bolted on. The red team's tool. */
function poison(entity: string, field: string): AllowListShape {
  const copy: Record<string, readonly string[]> = { ...asShape }
  copy[entity] = [...(copy[entity] ?? []), field]
  return copy
}

/**
 * What a boundary test written against the domain registry alone would report.
 * Kept here deliberately as the counter-example, not as a helper anything uses.
 */
function domainRegistryOnlyAudit(allow: AllowListShape): string[] {
  const registry = FIELD_CLASSES as unknown as Record<string, Record<string, DataClass>>
  const leaks: string[] = []

  for (const entity of Object.keys(allow)) {
    const fields = registry[entity]
    // The bug, in one line: an entity this registry has never heard of is waved
    // through instead of refused.
    if (!fields) continue

    for (const field of allow[entity]) {
      const dataClass = fields[field]
      if (dataClass === 'sensitive' || dataClass === 'document-content') {
        leaks.push(`${entity}.${field}`)
      }
    }
  }

  return leaks
}

function userOf(key: keyof typeof STARTER_TEMPLATES, extra: Partial<User> = {}): User {
  return {
    id: `usr-${key}`,
    name: key,
    templateKey: key,
    template: STARTER_TEMPLATES[key],
    ...extra,
  }
}

function build() {
  return createMockRepositories({ latency: NO_LATENCY })
}

/** Every string anywhere inside a projected value, however deeply nested. */
function stringsIn(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') found.push(value)
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, found)
  else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) stringsIn(item, found)
  }
  return found
}

const FULL_AADHAAR = /\b\d{12}\b/
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/

/** Which fixture table holds each projected entity, for the live-output sweep. */
const TABLE_OF: Readonly<Record<AssistantEntityName, keyof MockTables>> = {
  Customer: 'customers',
  Member: 'members',
  Household: 'households',
  ConsentRecord: 'consentRecords',
  Inquiry: 'inquiries',
  Quotation: 'quotations',
  QuotationLine: 'quotationLines',
  Deal: 'deals',
  Policy: 'policies',
  PolicyVersion: 'policyVersions',
  PolicyEntryDraft: 'policyDrafts',
  PremiumSchedule: 'premiumSchedules',
  InstalmentDue: 'instalments',
  Mandate: 'mandates',
  MandateEvent: 'mandateEvents',
  CollectionRecord: 'collections',
  Document: 'documents',
  Task: 'tasks',
  RenewalTask: 'renewalTasks',
  Claim: 'claims',
  MessageLog: 'messageLogs',
  Company: 'companies',
  Product: 'products',
  BenefitItem: 'benefitItems',
  PolicyBenefitMap: 'policyBenefitMaps',
  Agency: 'agencies',
  Agent: 'agents',
  StaffUser: 'users',
  Team: 'teams',
  InquiryCategory: 'categories',
}

/**
 * The rows of whichever table holds an entity. The cast is the price of indexing
 * a table map with a variable key: every fixture row is an object, and the sweep
 * below only ever asks for its keys and its strings.
 */
function tableRows(store: MockStore, entity: AssistantEntityName): readonly object[] {
  return rowsOf(store.tables[TABLE_OF[entity]] as Map<string, object>)
}

/* ------------------------------------------------------ the merged registry */

describe('the boundary spans both classification registries', () => {
  it('unions the domain and data registries without a key collision', () => {
    const domain = Object.keys(FIELD_CLASSES)
    const data = Object.keys(DATA_FIELD_CLASSES)

    expect(domain).toEqual(ENTITY_NAMES)
    expect(data).toEqual(DATA_ENTITY_NAMES)
    // A collision would mean one registry silently overwrote the other's classes.
    expect(new Set([...domain, ...data]).size).toBe(domain.length + data.length)
    expect(ALL_ENTITY_NAMES).toHaveLength(domain.length + data.length)
  })

  it('projects every one of the seven domain entities', () => {
    for (const entity of ENTITY_NAMES) {
      expect(ASSISTANT_ENTITY_NAMES).toContain(entity)
    }
  })

  it('projects entities the domain registry has never heard of', () => {
    // If this ever drops to zero the test above stops being the harder one, and
    // a domain-only boundary check would look sufficient again.
    const fromData = ASSISTANT_ENTITY_NAMES.filter((entity) =>
      (DATA_ENTITY_NAMES as readonly string[]).includes(entity),
    )
    expect(fromData.length).toBeGreaterThan(0)
    expect(fromData).toEqual(expect.arrayContaining(['Mandate', 'ConsentRecord', 'Claim']))
  })

  it('names both forbidden classes and nothing else', () => {
    expect([...ASSISTANT_FORBIDDEN_CLASSES]).toEqual(['sensitive', 'document-content'])
  })
})

/* ------------------------------------------------- the guarantee, per entity */

describe('every allow-list is disjoint from sensitive and document-content', () => {
  it.each(ASSISTANT_ENTITY_NAMES)(
    '%s allows no field the Assistant must never receive',
    (entity) => {
      const forbidden = forbiddenFieldsOf(entity)
      const intersection = allowOf(entity).filter((field) => forbidden.includes(field))

      expect(intersection).toEqual([])
    },
  )

  it.each(ASSISTANT_ENTITY_NAMES)('%s allows only operational or contact fields', (entity) => {
    for (const field of allowOf(entity)) {
      const dataClass = classOfField(entity, field)
      expect(dataClass).not.toBeNull()
      expect(['operational', 'contact']).toContain(dataClass)
    }
  })

  it('audits clean as a whole', () => {
    expect(auditAllowList(asShape)).toEqual([])
    expect(() => assertAllowListIsClean()).not.toThrow()
  })
})

/* ------------------------------------------------------ the masked identifier */

describe('a masked identifier is still an identifier', () => {
  it('classes the last-4 as sensitive in both registries that carry one', () => {
    expect(classOfField('Customer', 'aadhaarLast4')).toBe('sensitive')
    expect(classOfField('Member', 'aadhaarLast4')).toBe('sensitive')
    expect(classOfField('Policy', 'nomineeAadhaarLast4')).toBe('sensitive')
  })

  it('excludes the last-4 from every allow-list that could carry it', () => {
    expect(allowOf('Customer')).not.toContain('aadhaarLast4')
    expect(allowOf('Member')).not.toContain('aadhaarLast4')
    expect(allowOf('Policy')).not.toContain('nomineeAadhaarLast4')
  })

  it('excludes anything that reads like an identity, bank or health field', () => {
    // Belt and braces over the class check: a field misclassified `operational`
    // by mistake would pass the audit and still be caught by its own name.
    const suspicious =
      /(aadhaar|^pan$|panNumber|bankAccount|bankIfsc|^ifsc$|health|diagnosis|preExisting|extractedText|ocrFields|fileName|fileUrl|mimeType|medicalReport|^token$|companyRemark)/i

    for (const entity of ASSISTANT_ENTITY_NAMES) {
      for (const field of allowOf(entity)) {
        expect(`${entity}.${field}`).not.toMatch(suspicious)
      }
    }
  })
})

/* ---------------------------------------- no projection without a registry */

describe('a projection cannot be written for an unclassified entity', () => {
  it.each(ASSISTANT_ENTITY_NAMES)('%s is classified by one of the two registries', (entity) => {
    expect(isClassifiedEntity(entity)).toBe(true)
  })

  it('refuses an allow-list for an entity neither registry classifies', () => {
    const findings = auditAllowList({ ...asShape, AuditLogEntry: ['id', 'payload'] })

    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('unknown-entity')
    expect(findings[0].entity).toBe('AuditLogEntry')
  })

  it('refuses a field the entity does not actually have', () => {
    const findings = auditAllowList(poison('Customer', 'nickname'))

    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('unknown-field')
    expect(findings[0].field).toBe('nickname')
  })
})

/* -------------------------------------------------------------- the red team */

/**
 * A test that cannot fail is decoration. Everything below runs the real audit —
 * the same function the projection module calls at load — over a deliberately
 * poisoned copy of the real allow-list, and asserts it is rejected. If somebody
 * weakens `auditAllowList`, these go red before anything ships.
 */
describe('red team: the boundary is demonstrably capable of failing', () => {
  const leaks: readonly [string, string, DataClass][] = [
    ['Customer', 'aadhaarNumber', 'sensitive'],
    ['Customer', 'aadhaarLast4', 'sensitive'],
    ['Customer', 'panNumber', 'sensitive'],
    ['Customer', 'bankAccountNumber', 'sensitive'],
    ['Member', 'healthDeclaration', 'sensitive'],
    ['Member', 'diagnosis', 'sensitive'],
    ['Member', 'preExistingConditions', 'sensitive'],
    ['Policy', 'nomineeAadhaarLast4', 'sensitive'],
    ['Policy', 'medicalReportSummary', 'document-content'],
    ['Document', 'extractedText', 'document-content'],
    ['Document', 'fileUrl', 'document-content'],
    ['Quotation', 'documentId', 'document-content'],
    // Data-registry entries. A domain-only check misses every one of these.
    ['Mandate', 'reference', 'sensitive'],
    ['Mandate', 'bankName', 'sensitive'],
    ['MandateEvent', 'reference', 'sensitive'],
    ['CollectionRecord', 'reference', 'sensitive'],
    ['ConsentRecord', 'token', 'sensitive'],
    ['CustomerCredential', 'username', 'sensitive'],
    ['Claim', 'companyRemark', 'document-content'],
    ['PolicyVersion', 'documentId', 'document-content'],
  ]

  it.each(leaks)('rejects %s.%s (%s) if somebody adds it to an allow-list', (entity, field, dataClass) => {
    const findings = auditAllowList(poison(entity, field))

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ entity, field, kind: 'forbidden-class', dataClass })
  })

  it.each(leaks)('takes the module down at load for %s.%s', (entity, field) => {
    expect(() => assertAllowListIsClean(poison(entity, field))).toThrow(
      new RegExp(`${entity}\\.${field}`),
    )
  })

  it('proves the union of both registries is what does the work', () => {
    const dataLayerOnly = leaks.filter(
      ([entity]) => !(ENTITY_NAMES as readonly string[]).includes(entity),
    )
    expect(dataLayerOnly.length).toBeGreaterThan(0)

    for (const [entity, field] of dataLayerOnly) {
      const poisoned = poison(entity, field)

      // A boundary test written against FIELD_CLASSES alone: silent.
      expect(domainRegistryOnlyAudit(poisoned)).toEqual([])
      // The real one, reading both registries: caught.
      expect(auditAllowList(poisoned)).toHaveLength(1)
    }
  })

  it('proves the counter-example is not simply broken', () => {
    // The domain-only audit does catch domain-entity leaks; it is incomplete,
    // not inert. Without this, the assertion above would pass for the wrong reason.
    expect(domainRegistryOnlyAudit(poison('Customer', 'aadhaarLast4'))).toEqual([
      'Customer.aadhaarLast4',
    ])
  })
})

/* ------------------------------------------------- what actually comes out */

describe('the projected output of a real store', () => {
  const { store } = build()

  it.each(ASSISTANT_ENTITY_NAMES)('%s projects only its allow-listed keys', (entity) => {
    const rows = tableRows(store, entity)
    expect(rows.length).toBeGreaterThan(0)

    const allowed = allowOf(entity)
    const forbidden = forbiddenFieldsOf(entity)

    for (const row of rows) {
      const keys = Object.keys(project(entity, row))
      for (const key of keys) {
        expect(allowed).toContain(key)
        expect(forbidden).not.toContain(key)
      }
    }
  })

  it('carries no full Aadhaar and no PAN anywhere in its projected values', () => {
    for (const entity of ASSISTANT_ENTITY_NAMES) {
      const rows = tableRows(store, entity)

      for (const row of rows) {
        for (const text of stringsIn(project(entity, row))) {
          expect(text).not.toMatch(FULL_AADHAAR)
          expect(text).not.toMatch(PAN)
        }
      }
    }
  })

  it('would notice: the unprojected records do carry a PAN and a masked Aadhaar', () => {
    // Without this, the sweep above could be passing because the fixtures happen
    // to hold nothing worth catching.
    const customers = rowsOf(store.tables.customers)

    expect(customers.some((row) => row.panNumber !== null && PAN.test(row.panNumber))).toBe(true)
    expect(customers.some((row) => row.aadhaarLast4 !== null)).toBe(true)
  })

  it('would notice: the unprojected documents do carry file names', () => {
    const documents = rowsOf(store.tables.documents)
    expect(documents.some((row) => row.fileName !== null)).toBe(true)
  })
})

/* --------------------------------------------------------------- the facade */

describe('the Assistant repository facade', () => {
  it('gives an admin no Aadhaar, though the admin holds the sensitive grant', async () => {
    const repos = build()
    const admin = userOf('admin')
    const assistant = createAssistantRepository(repos, admin)

    // can() says yes to the class; the projection has no opinion about who asks.
    expect(canSeeClass(admin, 'sensitive')).toBe(true)

    const source = rowsOf(repos.store.tables.customers).find((row) => row.aadhaarLast4 !== null)
    expect(source).toBeDefined()

    const view = await assistant.customer(source!.id)
    expect(view).not.toBeNull()
    expect(view!.fullName).toBe(source!.fullName)
    expect(Object.keys(view!)).not.toContain('aadhaarLast4')
    expect(Object.keys(view!)).not.toContain('panNumber')
    expect(Object.keys(view!)).not.toContain('bankAccountNumber')
  })

  it('gives a role with no Assistant grant nothing at all (FR-22.3)', async () => {
    const repos = build()
    const assistant = createAssistantRepository(repos, userOf('subAgent'))

    expect(assistant.enabled).toBe(false)
    expect((await assistant.customers()).total).toBe(0)
    expect((await assistant.policies()).total).toBe(0)
    expect(await assistant.customer(rowsOf(repos.store.tables.customers)[0].id)).toBeNull()
  })

  it('scopes reads by module grant, as the requesting user', async () => {
    const repos = build()
    const admin = createAssistantRepository(repos, userOf('admin'))
    // The renewals desk holds no inquiries grant at all.
    const renewals = createAssistantRepository(repos, userOf('renewals'))

    expect((await admin.inquiries()).total).toBeGreaterThan(0)
    expect((await renewals.inquiries()).total).toBe(0)
    expect((await renewals.renewals()).total).toBeGreaterThan(0)
  })

  it('returns document presence and never document content (FR-22.14)', async () => {
    const repos = build()
    const assistant = createAssistantRepository(repos, userOf('admin'))

    const source = rowsOf(repos.store.tables.documents).find(
      (row) => row.subjectEntity === 'Customer' && row.fileName !== null,
    )
    expect(source).toBeDefined()

    const views = await assistant.documents('Customer', source!.subjectId)
    expect(views.length).toBeGreaterThan(0)

    for (const view of views) {
      const keys = Object.keys(view)
      expect(keys).toContain('reviewState')
      expect(keys).toContain('isPresent')
      expect(keys).not.toContain('fileName')
      expect(keys).not.toContain('fileUrl')
      expect(keys).not.toContain('mimeType')
      expect(keys).not.toContain('extractedText')
      expect(keys).not.toContain('ocrFields')
    }
  })

  it('returns a consent state and never the consent token', async () => {
    const repos = build()
    const assistant = createAssistantRepository(repos, userOf('admin'))

    const source = rowsOf(repos.store.tables.consentRecords)[0]
    expect(source.token.length).toBeGreaterThan(0)

    const view = await assistant.consent(source.customerId)
    expect(view).not.toBeNull()
    expect(Object.keys(view!)).not.toContain('token')
    expect(view!.state).toBe(source.state)
  })

  it('returns a mandate state and never the bank behind it', async () => {
    const repos = build()
    const assistant = createAssistantRepository(repos, userOf('admin'))

    const source = rowsOf(repos.store.tables.mandates)[0]
    const view = await assistant.mandate(source.policyId)

    expect(view).not.toBeNull()
    expect(view!.state).toBe(source.state)
    expect(Object.keys(view!)).not.toContain('reference')
    expect(Object.keys(view!)).not.toContain('bankName')
  })

  it('returns a claim state and never the insurer remark that carries the diagnosis', async () => {
    const repos = build()
    const assistant = createAssistantRepository(repos, userOf('admin'))

    const source = rowsOf(repos.store.tables.claims)[0]
    const view = await assistant.claim(source.id)

    expect(view).not.toBeNull()
    expect(view!.state).toBe(source.state)
    expect(Object.keys(view!)).not.toContain('companyRemark')
  })
})
