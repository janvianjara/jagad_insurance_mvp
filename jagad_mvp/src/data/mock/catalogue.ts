/**
 * The read-only clusters: configuration, market, channel, money and records.
 *
 * Nothing in here has a workflow, so nothing in here has a machine. These are the
 * rows an admin edits on canvas flow 6 and every other screen reads: companies
 * and their contacts, products, the benefit catalogue, agencies and their scopes,
 * agents and their splits, commission rules and the ledger, document metadata.
 *
 * Two reads are worth naming. `placementScope` returns exactly the shape the deal
 * machine's `placementInsideAgencyScope` guard wants, so a screen can disable a
 * line item with the same sentence the transition would have refused with. And
 * `presence` on documents returns booleans only — the Assistant may know a file
 * exists and may never learn what it says (§14.1).
 */

import type { AgencyRepository } from '../repo/agencies'
import type { AgentRepository } from '../repo/agents'
import type { BenefitRepository } from '../repo/benefits'
import type { CommissionRepository } from '../repo/commission'
import type { CompanyRepository } from '../repo/companies'
import type { ConfigRepository } from '../repo/config'
import type { DocumentRepository } from '../repo/documents'
import type { ProductRepository } from '../repo/products'
import { runQuery } from './list'

import type { Latency } from './latency'
import { rowsOf } from './store'
import type { MockStore } from './store'

export type CatalogueDeps = {
  readonly store: MockStore
  readonly latency: Latency
}

export function createCatalogueRepositories(deps: CatalogueDeps): {
  config: ConfigRepository
  companies: CompanyRepository
  products: ProductRepository
  benefits: BenefitRepository
  agencies: AgencyRepository
  agents: AgentRepository
  commission: CommissionRepository
  documents: DocumentRepository
} {
  const { store, latency } = deps
  const t = store.tables
  const wait = () => latency.wait()

  const config: ConfigRepository = {
    async users() {
      await wait()
      return rowsOf(t.users)
    },
    async user(id) {
      await wait()
      return t.users.get(id) ?? null
    },
    async teams() {
      await wait()
      return rowsOf(t.teams)
    },
    async categories() {
      await wait()
      return rowsOf(t.categories)
    },
    async masterTypes() {
      await wait()
      return rowsOf(t.masterTypes)
    },
    async masterValues(masterTypeKey) {
      await wait()
      const type = rowsOf(t.masterTypes).find((candidate) => candidate.key === masterTypeKey)
      if (!type) return []
      return rowsOf(t.masterValues).filter((value) => value.masterTypeId === type.id)
    },
    async retentionClasses() {
      await wait()
      return rowsOf(t.retentionClasses)
    },
    async formSchema(objectKey, productId, version) {
      await wait()
      const candidates = rowsOf(t.formSchemas).filter(
        (schema) => schema.objectKey === objectKey,
      )
      // A pinned version wins over everything: a record captured under version 1
      // keeps rendering under version 1 (canvas 6.2), whatever is live today.
      if (version !== undefined) {
        const forProduct = candidates.find(
          (schema) => schema.productId === (productId ?? null) && schema.version === version,
        )
        return forProduct ?? candidates.find((schema) => schema.version === version) ?? null
      }
      const productSpecific = candidates.find(
        (schema) => productId !== undefined && schema.productId === productId && schema.active,
      )
      return productSpecific ?? candidates.find((schema) => schema.productId === null && schema.active) ?? null
    },
    async formSchemas() {
      await wait()
      return rowsOf(t.formSchemas)
    },
    async recipes() {
      await wait()
      return rowsOf(t.recipes)
    },
    async recipe(key) {
      await wait()
      return rowsOf(t.recipes).find((candidate) => candidate.key === key) ?? null
    },
    async templates() {
      await wait()
      return rowsOf(t.messageTemplates)
    },
    async messages(subjectEntity, subjectId) {
      await wait()
      return rowsOf(t.messageLogs).filter(
        (message) => message.subjectEntity === subjectEntity && message.subjectId === subjectId,
      )
    },
  }

  const companies: CompanyRepository = {
    async list(query) {
      await wait()
      return runQuery(
        rowsOf(t.companies),
        {
          search: [(row) => row.name, (row) => row.shortName],
          filters: { active: (row) => row.active },
          sorts: { name: (row) => row.name },
          defaultSort: { field: 'name', direction: 'asc' },
        },
        query,
      )
    },
    async get(id) {
      await wait()
      return t.companies.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.companies.get(id)).filter((row) => row !== undefined)
    },
    async byKey(key) {
      await wait()
      return rowsOf(t.companies).find((company) => company.key === key) ?? null
    },
    async contacts(companyIdValue) {
      await wait()
      return rowsOf(t.companyContacts).filter((contact) => contact.companyId === companyIdValue)
    },
    async forLine(line) {
      await wait()
      return rowsOf(t.companies).filter((company) => company.lines.includes(line))
    },
  }

  const products: ProductRepository = {
    async list(query) {
      await wait()
      return runQuery(
        rowsOf(t.products),
        {
          search: [(row) => row.name, (row) => row.code],
          filters: {
            line: (row) => row.line,
            companyId: (row) => row.companyId,
            active: (row) => row.active,
          },
          sorts: { name: (row) => row.name, code: (row) => row.code },
          defaultSort: { field: 'name', direction: 'asc' },
        },
        query,
      )
    },
    async get(id) {
      await wait()
      return t.products.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.products.get(id)).filter((row) => row !== undefined)
    },
    async forCompany(companyIdValue) {
      await wait()
      return rowsOf(t.products).filter((product) => product.companyId === companyIdValue)
    },
    async forLine(line) {
      await wait()
      return rowsOf(t.products).filter((product) => product.line === line)
    },
    async checklist(productIdValue, purpose) {
      await wait()
      const product = t.products.get(productIdValue)
      if (!product) return null
      const all = rowsOf(t.docChecklists).filter((entry) => entry.purpose === purpose)
      return (
        all.find((entry) => entry.productId === productIdValue) ??
        all.find((entry) => entry.companyId === product.companyId && entry.productId === null) ??
        null
      )
    },
    async checklists() {
      await wait()
      return rowsOf(t.docChecklists)
    },
  }

  const benefits: BenefitRepository = {
    async list(query) {
      await wait()
      return runQuery(
        rowsOf(t.benefitItems),
        {
          search: [(row) => row.label],
          filters: { line: (row) => row.line, active: (row) => row.active },
          sorts: { sortOrder: (row) => row.sortOrder, label: (row) => row.label },
          defaultSort: { field: 'sortOrder', direction: 'asc' },
        },
        query,
      )
    },
    async get(id) {
      await wait()
      return t.benefitItems.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.benefitItems.get(id)).filter((row) => row !== undefined)
    },
    async forLine(line) {
      await wait()
      return rowsOf(t.benefitItems).filter((item) => item.line === line)
    },
    async mapsForProduct(productIdValue) {
      await wait()
      return rowsOf(t.policyBenefitMaps).filter((entry) => entry.productId === productIdValue)
    },
    async unionForProducts(productIds) {
      await wait()
      // The composer opens on the union of the mapped rows, in catalogue order,
      // with each benefit appearing once however many products carry it.
      const wanted = new Set(productIds)
      const seen = new Set<string>()
      const union = rowsOf(t.policyBenefitMaps).filter((entry) => {
        if (!wanted.has(entry.productId)) return false
        if (seen.has(entry.benefitItemId)) return false
        seen.add(entry.benefitItemId)
        return true
      })
      return [...union].sort((a, b) => a.sortOrder - b.sortOrder)
    },
  }

  const agencies: AgencyRepository = {
    async list(query) {
      await wait()
      return runQuery(
        rowsOf(t.agencies),
        {
          search: [(row) => row.name, (row) => row.code],
          filters: { type: (row) => row.type, active: (row) => row.active },
          sorts: { name: (row) => row.name },
          defaultSort: { field: 'name', direction: 'asc' },
        },
        query,
      )
    },
    async get(id) {
      await wait()
      return t.agencies.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.agencies.get(id)).filter((row) => row !== undefined)
    },
    async byCode(code) {
      await wait()
      return rowsOf(t.agencies).find((agency) => agency.code === code) ?? null
    },
    async scopes(agencyId) {
      await wait()
      return rowsOf(t.agencyScopes).filter((scope) => scope.agencyId === agencyId)
    },
    async placementScope(agencyId) {
      await wait()
      if (!t.agencies.has(agencyId)) return null
      const scopes = rowsOf(t.agencyScopes).filter(
        (scope) => scope.agencyId === agencyId && scope.active,
      )
      return {
        agencyId,
        companyIds: [...new Set(scopes.map((scope) => scope.companyId))],
        productIds: [...new Set(scopes.map((scope) => scope.productId))],
      }
    },
  }

  const agents: AgentRepository = {
    async list(query) {
      await wait()
      return runQuery(
        rowsOf(t.agents),
        {
          search: [(row) => row.name, (row) => row.code, (row) => row.mobile],
          filters: {
            agencyId: (row) => row.agencyId,
            active: (row) => row.active,
            isSubAgent: (row) => row.parentAgentId !== null,
          },
          sorts: { name: (row) => row.name, code: (row) => row.code },
          defaultSort: { field: 'name', direction: 'asc' },
        },
        query,
      )
    },
    async get(id) {
      await wait()
      return t.agents.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.agents.get(id)).filter((row) => row !== undefined)
    },
    async byCode(code) {
      await wait()
      return rowsOf(t.agents).find((agent) => agent.code === code) ?? null
    },
    async subAgentsOf(agentId) {
      await wait()
      return rowsOf(t.agents).filter((agent) => agent.parentAgentId === agentId)
    },
    async forAgency(agencyId) {
      await wait()
      return rowsOf(t.agents).filter((agent) => agent.agencyId === agencyId)
    },
    async splits(agentId) {
      await wait()
      return rowsOf(t.commissionSplits).filter(
        (split) => split.agentId === agentId || split.subAgentId === agentId,
      )
    },
  }

  const commission: CommissionRepository = {
    async list(query) {
      await wait()
      return runQuery(
        rowsOf(t.ledgerEntries),
        {
          search: [(row) => row.note],
          filters: { kind: (row) => row.kind, agencyId: (row) => row.agencyId },
          sorts: { bookedAt: (row) => row.bookedAt, amount: (row) => row.amount.paise },
          defaultSort: { field: 'bookedAt', direction: 'desc' },
        },
        query,
      )
    },
    async get(id) {
      await wait()
      return t.ledgerEntries.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.ledgerEntries.get(id)).filter((row) => row !== undefined)
    },
    async rules(agencyId) {
      await wait()
      return rowsOf(t.commissionRules).filter((rule) => rule.agencyId === agencyId)
    },
    async ruleFor(agencyId, companyIdValue, productIdValue) {
      await wait()
      return (
        rowsOf(t.commissionRules).find(
          (rule) =>
            rule.agencyId === agencyId &&
            rule.companyId === companyIdValue &&
            rule.productId === productIdValue &&
            rule.active,
        ) ?? null
      )
    },
    async forPolicy(policyId) {
      await wait()
      return rowsOf(t.ledgerEntries).filter((entry) => entry.policyId === policyId)
    },
    async forAgent(agentId, query) {
      await wait()
      return runQuery(
        rowsOf(t.ledgerEntries).filter(
          (entry) => entry.agentId === agentId || entry.subAgentId === agentId,
        ),
        {
          sorts: { bookedAt: (row) => row.bookedAt },
          defaultSort: { field: 'bookedAt', direction: 'desc' },
        },
        query,
      )
    },
  }

  const documents: DocumentRepository = {
    async list(query) {
      await wait()
      return runQuery(
        rowsOf(t.documents),
        {
          search: [(row) => row.systemNo, (row) => row.docType],
          filters: {
            docType: (row) => row.docType,
            reviewState: (row) => row.reviewState,
            subjectEntity: (row) => row.subjectEntity,
          },
          sorts: { submittedAt: (row) => row.submittedAt, docType: (row) => row.docType },
          defaultSort: { field: 'submittedAt', direction: 'desc' },
        },
        query,
      )
    },
    async get(id) {
      await wait()
      return t.documents.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.documents.get(id)).filter((row) => row !== undefined)
    },
    async forSubject(subjectEntity, subjectId) {
      await wait()
      return rowsOf(t.documents).filter(
        (doc) => doc.subjectEntity === subjectEntity && doc.subjectId === subjectId,
      )
    },
    async awaitingReview(query) {
      await wait()
      return runQuery(
        rowsOf(t.documents).filter(
          (doc) => doc.reviewState === 'submitted' || doc.reviewState === 'awaiting',
        ),
        {
          filters: { docType: (row) => row.docType },
          sorts: { submittedAt: (row) => row.submittedAt },
          defaultSort: { field: 'submittedAt', direction: 'asc' },
        },
        query,
      )
    },
    async presence(subjectEntity, subjectId) {
      await wait()
      // Presence, never content. This is the one document fact §14.1 lets the
      // Assistant projection carry, so the read that produces it returns
      // booleans and cannot accidentally return more.
      const presence: Record<string, boolean> = {}
      for (const doc of rowsOf(t.documents)) {
        if (doc.subjectEntity !== subjectEntity || doc.subjectId !== subjectId) continue
        presence[doc.docType] = doc.isPresent
      }
      return presence
    },
  }

  return { config, companies, products, benefits, agencies, agents, commission, documents }
}
