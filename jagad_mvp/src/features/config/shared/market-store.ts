/**
 * The market and channel working set — the second half of plan §5's config rows,
 * held the way P-10a holds the first half.
 *
 * Why a store and not repository writes, again: `CompanyRepository` and its four
 * siblings are read interfaces served by a mock adapter, and inventing a write
 * API for the whole data layer is not this step's job. So the screens read
 * through the repositories exactly like every other screen — no fixture is
 * imported anywhere — and hold their edits here, behind mutations named after the
 * act they perform. Each one gains an `await repositories.…` the day a write API
 * lands, and no screen changes.
 *
 * The rules live in the mutations rather than in the screens, because a screen
 * can forget and a store cannot:
 *
 *   1. An Individual agency locks to exactly one company. `saveAgency` and
 *      `saveAgencyScope` both call the guard, so the rule cannot be walked around
 *      by editing the appointment from the other screen.
 *   2. A sub-agent share is checked by P-03's `subAgentShareWithinCap` and by
 *      nothing else here. Two ceilings, one implementation.
 *   3. A commission percentage that nobody has agreed is null, never zero. A
 *      zero rate is a rate; "not set" is not.
 *
 * Every mutation that can refuse returns the `TransitionResult` it refused with,
 * so the screen shows the guard's own sentence instead of a second wording.
 */

import { create } from 'zustand'
import { allow, isValidBasisPoints, refuse, subAgentShareWithinCap } from '../../../domain/workflows'
import type { AgencyScope, TransitionResult } from '../../../domain/workflows'
import type {
  AgencyType,
  BenefitValueKind,
  ChecklistPurpose,
  InsuranceLine,
  Repositories,
} from '../../../data/repo'
import type { ConfigStatus } from './config-types'
import {
  companyLinesFormOneLicence,
  individualAgencyHoldsOneCompany,
  nextAgencyCode,
  nextAgentCode,
  percentIsValid,
  scopeInsideAppointedCompanies,
  subAgentTeamIsConsistent,
} from './market-rules'
import { LINE_LABELS } from './market-types'
import type {
  ConfigAgency,
  ConfigAgencyScope,
  ConfigAgent,
  ConfigBenefitItem,
  ConfigBenefitMap,
  ConfigChecklist,
  ConfigCompany,
  ConfigCompanyContact,
  ConfigProduct,
} from './market-types'

/* ------------------------------------------------------------------ helpers */

/** The five repositories this store reads. Never the whole bag. */
export type MarketRepositories = Pick<
  Repositories,
  'companies' | 'products' | 'benefits' | 'agencies' | 'agents'
>

/** Configuration is a few hundred rows; one read each, not a paged crawl. */
const ALL_ROWS = { pageSize: 500 } as const

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base
  let suffix = 2
  while (taken.includes(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function now(): string {
  return new Date().toISOString()
}

function reorder<T extends { readonly id: string; readonly sortOrder: number }>(
  rows: readonly T[],
  id: string,
  delta: number,
): readonly T[] {
  const ordered = [...rows].sort((a, b) => a.sortOrder - b.sortOrder)
  const index = ordered.findIndex((row) => row.id === id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= ordered.length) return rows

  const moved = [...ordered]
  const [row] = moved.splice(index, 1)
  moved.splice(target, 0, row)

  const positions = new Map(moved.map((entry, position) => [entry.id, position + 1]))
  return rows.map((entry) => {
    const position = positions.get(entry.id)
    return position === undefined || position === entry.sortOrder
      ? entry
      : { ...entry, sortOrder: position }
  })
}

/* -------------------------------------------------------------------- input */

export type CompanyInput = {
  readonly name: string
  readonly shortName: string
  readonly lines: readonly InsuranceLine[]
  readonly claimsEmail: string
}

export type ContactInput = {
  readonly companyId: string
  readonly name: string
  readonly role: string
  readonly mobile: string
  readonly email: string
  readonly categoryId: string | null
}

export type ProductInput = {
  readonly companyId: string
  readonly code: string
  readonly name: string
  readonly line: InsuranceLine
  readonly categoryId: string
}

export type BenefitInput = {
  readonly label: string
  readonly line: InsuranceLine
  readonly valueKind: BenefitValueKind
  readonly section: string
  readonly options: readonly string[]
  readonly defaultValue: string
}

export type AgencyInput = {
  readonly name: string
  readonly type: AgencyType
  readonly companyIds: readonly string[]
  readonly city: string
}

export type AgentInput = {
  readonly name: string
  readonly mobile: string
  readonly email: string
  readonly agencyId: string
  readonly city: string
  readonly parentAgentId: string | null
  readonly categoryIds: readonly string[]
  readonly sharePercentBp: number | null
  readonly canGrantSubAgents: boolean
  readonly subAgentCapPercentBp: number | null
  readonly directUpdatesEnabled: boolean
}

/** One row of a product's benefit sheet, as the editor drafts it. */
export type BenefitSheetRow = {
  readonly benefitItemId: string
  readonly defaultValue: string
}

/** One line of the per-agency policy scope, as the editor drafts it. */
export type ScopeDraftRow = {
  readonly productId: string
  readonly commissionPercentBp: number | null
}

/* -------------------------------------------------------------------- state */

export type MarketState = {
  readonly status: ConfigStatus
  readonly error: Error | null
  /** Bumped by every mutation; the screens remount their queue on it. */
  readonly revision: number

  readonly companies: readonly ConfigCompany[]
  readonly contacts: readonly ConfigCompanyContact[]
  readonly products: readonly ConfigProduct[]
  readonly checklists: readonly ConfigChecklist[]
  readonly benefitItems: readonly ConfigBenefitItem[]
  readonly benefitMaps: readonly ConfigBenefitMap[]
  readonly agencies: readonly ConfigAgency[]
  readonly scopes: readonly ConfigAgencyScope[]
  readonly agents: readonly ConfigAgent[]

  hydrate(repositories: MarketRepositories): Promise<void>
  reset(): void

  addCompany(input: CompanyInput): TransitionResult
  saveCompany(id: string, input: CompanyInput): TransitionResult
  setCompanyActive(id: string, active: boolean): void
  addContact(input: ContactInput): void
  saveContact(contact: ConfigCompanyContact): void
  removeContact(id: string): void

  addProduct(input: ProductInput): TransitionResult
  saveProduct(id: string, input: ProductInput): TransitionResult
  setProductActive(id: string, active: boolean): void
  setChecklistItems(productId: string, purpose: ChecklistPurpose, items: readonly string[]): void
  saveBenefitSheet(productId: string, rows: readonly BenefitSheetRow[]): TransitionResult

  addBenefitItem(input: BenefitInput): TransitionResult
  saveBenefitItem(id: string, input: BenefitInput): TransitionResult
  setBenefitItemActive(id: string, active: boolean): void
  moveBenefitItem(id: string, delta: number): void

  addAgency(input: AgencyInput): TransitionResult
  saveAgency(id: string, input: AgencyInput): TransitionResult
  setAgencyActive(id: string, active: boolean): void
  saveAgencyScope(agencyId: string, rows: readonly ScopeDraftRow[]): TransitionResult

  addAgent(input: AgentInput): TransitionResult
  saveAgent(id: string, input: AgentInput): TransitionResult
  setAgentActive(id: string, active: boolean): void
  setSubAgentShare(agentId: string, basisPoints: number | null): TransitionResult
}

const EMPTY = {
  status: 'idle' as ConfigStatus,
  error: null,
  revision: 0,
  companies: [],
  contacts: [],
  products: [],
  checklists: [],
  benefitItems: [],
  benefitMaps: [],
  agencies: [],
  scopes: [],
  agents: [],
}

export const useMarketStore = create<MarketState>((set, get) => ({
  ...EMPTY,

  /**
   * Reads the market and the channel through the repositories, once. Idempotent,
   * so all five screens can ask on mount without coordinating.
   */
  async hydrate(repositories) {
    const state = get()
    if (state.status === 'loading' || state.status === 'ready') return
    set({ status: 'loading', error: null })

    try {
      const [companyPage, productPage, benefitPage, agencyPage, agentPage, checklists] =
        await Promise.all([
          repositories.companies.list(ALL_ROWS),
          repositories.products.list(ALL_ROWS),
          repositories.benefits.list(ALL_ROWS),
          repositories.agencies.list(ALL_ROWS),
          repositories.agents.list(ALL_ROWS),
          repositories.products.checklists(),
        ])

      const [contactLists, mapLists, scopeLists] = await Promise.all([
        Promise.all(companyPage.rows.map((company) => repositories.companies.contacts(company.id))),
        Promise.all(productPage.rows.map((product) => repositories.benefits.mapsForProduct(product.id))),
        Promise.all(agencyPage.rows.map((agency) => repositories.agencies.scopes(agency.id))),
      ])

      const benefitMaps = mapLists.flat()

      set({
        status: 'ready',
        error: null,
        revision: get().revision + 1,
        companies: companyPage.rows,
        contacts: contactLists.flat().map((contact) => ({ ...contact, categoryId: null })),
        products: productPage.rows,
        checklists,
        benefitMaps,
        // The catalogue's section starts as the line it belongs to, and its
        // options start as the readings the product maps already carry — both
        // are what configuration has on file, neither is invented here.
        benefitItems: benefitPage.rows.map((item) => ({
          ...item,
          section: LINE_LABELS[item.line],
          options: [
            ...new Set(
              benefitMaps
                .filter((row) => row.benefitItemId === item.id)
                .map((row) => row.defaultValue),
            ),
          ],
          defaultValue: '',
        })),
        agencies: agencyPage.rows,
        scopes: scopeLists.flat(),
        agents: agentPage.rows,
      })
    } catch (cause) {
      set({
        status: 'error',
        error:
          cause instanceof Error ? cause : new Error('The market configuration could not be read.'),
      })
    }
  },

  reset() {
    set({ ...EMPTY })
  },

  /* -------------------------------------------------------------- companies */

  addCompany(input) {
    const state = get()
    const name = input.name.trim()
    if (name === '') return refuse('Give the company its registered name.')

    const licence = companyLinesFormOneLicence(input.lines)
    if (!licence.ok) return licence

    const key = slug(name)
    if (state.companies.some((company) => company.key === key)) {
      return refuse(`"${name}" is already on file. A company is recorded once per licensed entity.`)
    }

    set({
      revision: state.revision + 1,
      companies: [
        ...state.companies,
        {
          id: uniqueId(`cmp-${key}`, state.companies.map((company) => company.id)),
          key,
          name,
          shortName: input.shortName.trim() || name,
          lines: input.lines,
          claimsEmail: input.claimsEmail.trim(),
          active: true,
        },
      ],
    })
    return allow()
  },

  saveCompany(id, input) {
    const state = get()
    const licence = companyLinesFormOneLicence(input.lines)
    if (!licence.ok) return licence
    if (input.name.trim() === '') return refuse('Give the company its registered name.')

    set({
      revision: state.revision + 1,
      companies: state.companies.map((company) =>
        company.id === id
          ? {
              ...company,
              name: input.name.trim(),
              shortName: input.shortName.trim() || input.name.trim(),
              lines: input.lines,
              claimsEmail: input.claimsEmail.trim(),
            }
          : company,
      ),
    })
    return allow()
  },

  setCompanyActive(id, active) {
    const state = get()
    set({
      revision: state.revision + 1,
      companies: state.companies.map((company) =>
        company.id === id ? { ...company, active } : company,
      ),
    })
  },

  addContact(input) {
    const state = get()
    if (input.name.trim() === '') return

    set({
      revision: state.revision + 1,
      contacts: [
        ...state.contacts,
        {
          id: uniqueId(
            `cnt-${slug(input.name)}`,
            state.contacts.map((contact) => contact.id),
          ),
          companyId: input.companyId,
          name: input.name.trim(),
          role: input.role.trim(),
          mobile: input.mobile.trim(),
          email: input.email.trim(),
          categoryId: input.categoryId,
        },
      ],
    })
  },

  saveContact(contact) {
    const state = get()
    set({
      revision: state.revision + 1,
      contacts: state.contacts.map((row) => (row.id === contact.id ? contact : row)),
    })
  },

  removeContact(id) {
    const state = get()
    set({
      revision: state.revision + 1,
      contacts: state.contacts.filter((contact) => contact.id !== id),
    })
  },

  /* --------------------------------------------------------------- products */

  addProduct(input) {
    const state = get()
    const name = input.name.trim()
    const code = input.code.trim().toUpperCase()

    if (name === '') return refuse('Give the product the name the brochure prints.')
    if (code === '') return refuse('Give the product the code the insurer files it under.')
    if (state.products.some((product) => product.code === code)) {
      return refuse(`"${code}" is already a product code.`)
    }
    if (!state.companies.some((company) => company.id === input.companyId)) {
      return refuse('Choose the company whose product this is.')
    }

    set({
      revision: state.revision + 1,
      products: [
        ...state.products,
        {
          id: uniqueId(`prd-${slug(code)}`, state.products.map((product) => product.id)),
          companyId: input.companyId,
          code,
          name,
          line: input.line,
          categoryId: input.categoryId,
          formSchemaId: null,
          active: true,
        },
      ],
    })
    return allow()
  },

  /**
   * Saving a product drops any benefit row that no longer belongs to its line.
   * A health sheet on a product that has become a motor product is not a sheet,
   * it is a set of rows the comparison would print under the wrong headings.
   */
  saveProduct(id, input) {
    const state = get()
    if (input.name.trim() === '') return refuse('Give the product the name the brochure prints.')
    if (!state.companies.some((company) => company.id === input.companyId)) {
      return refuse('Choose the company whose product this is.')
    }

    set({
      revision: state.revision + 1,
      benefitMaps: state.benefitMaps.filter((row) => {
        if (row.productId !== id) return true
        const item = state.benefitItems.find((candidate) => candidate.id === row.benefitItemId)
        return item?.line === input.line
      }),
      products: state.products.map((product) =>
        product.id === id
          ? {
              ...product,
              companyId: input.companyId,
              name: input.name.trim(),
              line: input.line,
              categoryId: input.categoryId,
            }
          : product,
      ),
    })
    return allow()
  },

  setProductActive(id, active) {
    const state = get()
    set({
      revision: state.revision + 1,
      products: state.products.map((product) =>
        product.id === id ? { ...product, active } : product,
      ),
    })
  },

  /**
   * Writes the checklist onto the product itself.
   *
   * A company-wide checklist is the fallback every product of that company
   * inherits; editing one product's list creates the product's own row rather
   * than rewriting the company's, so the other products are untouched — which is
   * what `ProductRepository.checklist` already resolves in that order.
   */
  setChecklistItems(productId, purpose, items) {
    const state = get()
    const product = state.products.find((candidate) => candidate.id === productId)
    if (!product) return

    const cleaned = items.map((item) => item.trim()).filter((item) => item !== '')
    const existing = state.checklists.find(
      (entry) => entry.productId === productId && entry.purpose === purpose,
    )

    set({
      revision: state.revision + 1,
      checklists: existing
        ? state.checklists.map((entry) =>
            entry.id === existing.id ? { ...entry, items: cleaned } : entry,
          )
        : [
            ...state.checklists,
            {
              id: uniqueId(
                `chk-${slug(product.code)}-${purpose}`,
                state.checklists.map((entry) => entry.id),
              ),
              companyId: product.companyId,
              productId,
              purpose,
              items: cleaned,
            },
          ],
    })
  },

  /* --------------------------------------------- policy to benefit map, FR-05.7 */

  /**
   * The whole sheet at once — FR-05.7's policy-to-benefit map.
   *
   * One mutation rather than three, because the screen previews the sheet as one
   * change: which benefits this product carries and what each row reads. Rows
   * that survive keep their id and their position; the rest are dropped, and new
   * ones are appended in the order the catalogue offers them.
   */
  saveBenefitSheet(productId, rows) {
    const state = get()
    const product = state.products.find((candidate) => candidate.id === productId)
    if (!product) return refuse('That product is no longer on file.')

    const offside = rows.filter((row) => {
      const item = state.benefitItems.find((candidate) => candidate.id === row.benefitItemId)
      return !item || item.line !== product.line
    })
    if (offside.length > 0) {
      return refuse(
        `A ${LINE_LABELS[product.line]} product carries ${LINE_LABELS[product.line]} benefits only. Move the benefit to this line first, or drop it from the sheet.`,
      )
    }

    const existing = state.benefitMaps.filter((row) => row.productId === productId)
    const taken = state.benefitMaps.map((row) => row.id)

    const next: ConfigBenefitMap[] = rows.map((row, index) => {
      const kept = existing.find((candidate) => candidate.benefitItemId === row.benefitItemId)
      const item = state.benefitItems.find((candidate) => candidate.id === row.benefitItemId)
      return kept
        ? { ...kept, defaultValue: row.defaultValue, sortOrder: index + 1 }
        : {
            id: uniqueId(`pbm-${slug(product.code)}-${slug(item?.key ?? row.benefitItemId)}`, taken),
            productId,
            benefitItemId: row.benefitItemId,
            defaultValue: row.defaultValue,
            sortOrder: index + 1,
          }
    })

    set({
      revision: state.revision + 1,
      benefitMaps: [...state.benefitMaps.filter((row) => row.productId !== productId), ...next],
    })
    return allow()
  },

  /* --------------------------------------------------------------- benefits */

  addBenefitItem(input) {
    const state = get()
    const label = input.label.trim()
    if (label === '') return refuse('Give the benefit the label the sheet will print.')

    const key = slug(label)
    if (state.benefitItems.some((item) => item.key === key && item.line === input.line)) {
      return refuse(`"${label}" is already in the ${LINE_LABELS[input.line]} catalogue.`)
    }

    set({
      revision: state.revision + 1,
      benefitItems: [
        ...state.benefitItems,
        {
          id: uniqueId(`ben-${key}`, state.benefitItems.map((item) => item.id)),
          key,
          label,
          line: input.line,
          valueKind: input.valueKind,
          section: input.section.trim() || LINE_LABELS[input.line],
          options: input.options,
          defaultValue: input.defaultValue,
          sortOrder: state.benefitItems.length + 1,
          active: true,
        },
      ],
    })
    return allow()
  },

  saveBenefitItem(id, input) {
    const state = get()
    if (input.label.trim() === '') return refuse('Give the benefit the label the sheet will print.')

    set({
      revision: state.revision + 1,
      benefitItems: state.benefitItems.map((item) =>
        item.id === id
          ? {
              ...item,
              label: input.label.trim(),
              line: input.line,
              valueKind: input.valueKind,
              section: input.section.trim() || LINE_LABELS[input.line],
              options: input.options,
              defaultValue: input.defaultValue,
            }
          : item,
      ),
    })
    return allow()
  },

  setBenefitItemActive(id, active) {
    const state = get()
    set({
      revision: state.revision + 1,
      benefitItems: state.benefitItems.map((item) =>
        item.id === id ? { ...item, active } : item,
      ),
    })
  },

  moveBenefitItem(id, delta) {
    const state = get()
    const item = state.benefitItems.find((candidate) => candidate.id === id)
    if (!item) return

    const siblings = state.benefitItems.filter((candidate) => candidate.line === item.line)
    const moved = reorder(siblings, id, delta)
    const byId = new Map(moved.map((entry) => [entry.id, entry]))

    set({
      revision: state.revision + 1,
      benefitItems: state.benefitItems.map((entry) => byId.get(entry.id) ?? entry),
    })
  },

  /* --------------------------------------------------------------- agencies */

  addAgency(input) {
    const state = get()
    const name = input.name.trim()
    if (name === '') return refuse('Give the agency the name on its appointment letter.')

    const verdict = individualAgencyHoldsOneCompany({
      type: input.type,
      companyIds: input.companyIds,
      agencyName: name,
    })
    if (!verdict.ok) return verdict

    // The code is generated, never typed: an Individual appointment is named by
    // the company that issued it, a Broker by itself.
    const seed =
      input.type === 'individual'
        ? (state.companies.find((company) => company.id === input.companyIds[0])?.shortName ?? name)
        : name

    set({
      revision: state.revision + 1,
      agencies: [
        ...state.agencies,
        {
          id: uniqueId(`agy-${slug(name)}`, state.agencies.map((agency) => agency.id)),
          code: nextAgencyCode(input.type, seed, state.agencies.map((agency) => agency.code)),
          name,
          type: input.type,
          companyIds: input.companyIds,
          city: input.city.trim(),
          active: true,
        },
      ],
    })
    return allow()
  },

  /**
   * Saving an agency re-checks the Individual lock, and drops any scope row for a
   * company the agency is no longer appointed to — a scope that outlived its
   * appointment would keep offering that company at placement.
   */
  saveAgency(id, input) {
    const state = get()
    const name = input.name.trim()
    if (name === '') return refuse('Give the agency the name on its appointment letter.')

    const verdict = individualAgencyHoldsOneCompany({
      type: input.type,
      companyIds: input.companyIds,
      agencyName: name,
    })
    if (!verdict.ok) return verdict

    const stillAppointed = (companyId: string) => input.companyIds.includes(companyId)

    set({
      revision: state.revision + 1,
      agencies: state.agencies.map((agency) =>
        agency.id === id
          ? {
              ...agency,
              name,
              type: input.type,
              companyIds: input.companyIds,
              city: input.city.trim(),
            }
          : agency,
      ),
      scopes: state.scopes.filter(
        (scope) => scope.agencyId !== id || stillAppointed(scope.companyId),
      ),
    })
    return allow()
  },

  setAgencyActive(id, active) {
    const state = get()
    set({
      revision: state.revision + 1,
      agencies: state.agencies.map((agency) =>
        agency.id === id ? { ...agency, active } : agency,
      ),
    })
  },

  /**
   * The per-agency policy scope and the rate that came with each line — FR-07.2
   * and FR-07.4. What survives here is exactly what placement will offer.
   */
  saveAgencyScope(agencyId, rows) {
    const state = get()
    const agency = state.agencies.find((candidate) => candidate.id === agencyId)
    if (!agency) return refuse('That agency is no longer on file.')

    const chosen = rows.map((row) => {
      const product = state.products.find((candidate) => candidate.id === row.productId)
      return {
        row,
        product,
        companyId: product?.companyId ?? '',
        label: product ? `${product.name} (${product.code})` : row.productId,
      }
    })

    const missing = chosen.filter((entry) => !entry.product)
    if (missing.length > 0) {
      return refuse(`No product on file for: ${missing.map((entry) => entry.label).join(', ')}.`)
    }

    const inside = scopeInsideAppointedCompanies({
      appointedCompanyIds: agency.companyIds,
      chosen: chosen.map((entry) => ({ companyId: entry.companyId, label: entry.label })),
    })
    if (!inside.ok) return inside

    for (const entry of chosen) {
      if (entry.row.commissionPercentBp === null) continue
      if (!isValidBasisPoints(entry.row.commissionPercentBp)) {
        return refuse(
          `The commission on ${entry.label} has to be a percentage between 0 and 100, in whole hundredths.`,
        )
      }
    }

    const existing = state.scopes.filter((scope) => scope.agencyId === agencyId)
    const timestamp = now()

    const next: ConfigAgencyScope[] = chosen.map((entry) => {
      const kept = existing.find((scope) => scope.productId === entry.row.productId)
      return kept
        ? { ...kept, commissionPercentBp: entry.row.commissionPercentBp, active: true }
        : {
            id: uniqueId(
              `aps-${slug(agencyId)}-${slug(entry.row.productId)}`,
              state.scopes.map((scope) => scope.id),
            ),
            agencyId,
            companyId: entry.companyId,
            productId: entry.row.productId,
            commissionPercentBp: entry.row.commissionPercentBp,
            effectiveFrom: timestamp,
            active: true,
          }
    })

    set({
      revision: state.revision + 1,
      scopes: [...state.scopes.filter((scope) => scope.agencyId !== agencyId), ...next],
    })
    return allow()
  },

  /* ----------------------------------------------------------------- agents */

  addAgent(input) {
    const state = get()
    const name = input.name.trim()
    if (name === '') return refuse('Give the agent their name.')
    if (!state.agencies.some((agency) => agency.id === input.agencyId)) {
      return refuse('Choose the agency this agent writes under.')
    }

    const share = percentIsValid(input.sharePercentBp, "the agent's own percentage")
    if (!share.ok) return share

    const id = uniqueId(`agt-${slug(name)}`, state.agents.map((agent) => agent.id))
    const candidate: ConfigAgent = {
      id,
      code: nextAgentCode(state.agents.map((agent) => agent.code)),
      name,
      mobile: input.mobile.trim(),
      email: input.email.trim(),
      agencyId: input.agencyId,
      userId: null,
      parentAgentId: input.parentAgentId,
      city: input.city.trim(),
      categoryIds: input.categoryIds,
      sharePercentBp: input.sharePercentBp ?? 0,
      canGrantSubAgents: input.canGrantSubAgents,
      subAgentCapPercentBp: input.subAgentCapPercentBp,
      directUpdatesEnabled: input.directUpdatesEnabled,
      active: true,
    }

    if (candidate.parentAgentId) {
      const verdict = checkSubAgentShare(state.agents, candidate.parentAgentId, candidate.sharePercentBp)
      if (!verdict.ok) return verdict
    }

    set({ revision: state.revision + 1, agents: [...state.agents, candidate] })
    return allow()
  },

  saveAgent(id, input) {
    const state = get()
    const current = state.agents.find((agent) => agent.id === id)
    if (!current) return refuse('That agent is no longer on file.')

    const share = percentIsValid(input.sharePercentBp, "the agent's own percentage")
    if (!share.ok) return share

    if (input.subAgentCapPercentBp !== null) {
      const cap = percentIsValid(input.subAgentCapPercentBp, 'the sub-agent cap')
      if (!cap.ok) return cap
    }

    const team = subAgentTeamIsConsistent({
      agentName: current.name,
      canGrantSubAgents: input.canGrantSubAgents,
      capPercentBp: input.subAgentCapPercentBp,
      reporting: state.agents
        .filter((agent) => agent.parentAgentId === id)
        .map((agent) => ({ name: agent.name, sharePercentBp: agent.sharePercentBp })),
    })
    if (!team.ok) return team

    if (current.parentAgentId) {
      const verdict = checkSubAgentShare(state.agents, current.parentAgentId, input.sharePercentBp ?? 0)
      if (!verdict.ok) return verdict
    }

    set({
      revision: state.revision + 1,
      agents: state.agents.map((agent) =>
        agent.id === id
          ? {
              ...agent,
              name: input.name.trim(),
              mobile: input.mobile.trim(),
              email: input.email.trim(),
              agencyId: input.agencyId,
              city: input.city.trim(),
              categoryIds: input.categoryIds,
              sharePercentBp: input.sharePercentBp ?? 0,
              canGrantSubAgents: input.canGrantSubAgents,
              subAgentCapPercentBp: input.subAgentCapPercentBp,
              directUpdatesEnabled: input.directUpdatesEnabled,
            }
          : agent,
      ),
    })
    return allow()
  },

  setAgentActive(id, active) {
    const state = get()
    set({
      revision: state.revision + 1,
      agents: state.agents.map((agent) => (agent.id === id ? { ...agent, active } : agent)),
    })
  },

  /**
   * §9's cap rule, and the only place a sub-agent share is written. The check is
   * P-03's guard — two ceilings, one implementation.
   */
  setSubAgentShare(agentId, basisPoints) {
    const state = get()
    const agent = state.agents.find((candidate) => candidate.id === agentId)
    if (!agent) return refuse('That agent is no longer on file.')
    if (!agent.parentAgentId) {
      return refuse(`${agent.name} is not a sub-agent, so no share is carved out of anybody's cut.`)
    }

    const verdict = checkSubAgentShare(state.agents, agent.parentAgentId, basisPoints)
    if (!verdict.ok) return verdict

    set({
      revision: state.revision + 1,
      agents: state.agents.map((candidate) =>
        candidate.id === agentId
          ? { ...candidate, sharePercentBp: basisPoints ?? candidate.sharePercentBp }
          : candidate,
      ),
    })
    return allow()
  },
}))

/* ------------------------------------------------------------------- guards */

/**
 * The share check every write goes through, delegating to P-03.
 *
 * `capPercentBp` is passed as `undefined` when no cap is set, which is what makes
 * §9's second sentence work: with no cap, the agent's own percentage is still the
 * ceiling, and `subAgentShareWithinCap` is the thing that says so.
 */
export function checkSubAgentShare(
  agents: readonly ConfigAgent[],
  parentAgentId: string,
  basisPoints: number | null,
): TransitionResult {
  const parent = agents.find((candidate) => candidate.id === parentAgentId)
  if (!parent) return refuse('The agent this share is carved from is no longer on file.')
  if (!parent.canGrantSubAgents) {
    return refuse(
      `${parent.name} is not granted sub-agents, so no share can be carved out of their cut. Grant sub-agents on ${parent.name} first.`,
    )
  }

  return subAgentShareWithinCap({
    agentSharePercentBp: parent.sharePercentBp,
    subAgentSharePercentBp: basisPoints ?? undefined,
    capPercentBp: parent.subAgentCapPercentBp ?? undefined,
  })
}

/* ---------------------------------------------------------------- selectors */

/**
 * Every selector below takes the slice it reads rather than the whole state.
 *
 * That is not a style preference: a `useMarketStore(selector)` whose selector
 * builds a new array or object every call re-renders forever, because the store
 * compares snapshots by identity. Components subscribe to the raw arrays and
 * call these in render, which is cheap, correct, and leaves the functions usable
 * from a test with nothing mounted.
 */

export function companyById(
  companies: readonly ConfigCompany[],
  id: string,
): ConfigCompany | null {
  return companies.find((company) => company.id === id) ?? null
}

export function productById(
  products: readonly ConfigProduct[],
  id: string,
): ConfigProduct | null {
  return products.find((product) => product.id === id) ?? null
}

export function contactsOfCompany(
  contacts: readonly ConfigCompanyContact[],
  companyId: string,
): readonly ConfigCompanyContact[] {
  return contacts.filter((contact) => contact.companyId === companyId)
}

export function productsOfCompany(
  products: readonly ConfigProduct[],
  companyId: string,
): readonly ConfigProduct[] {
  return products.filter((product) => product.companyId === companyId)
}

export function mapsOfProduct(
  benefitMaps: readonly ConfigBenefitMap[],
  productId: string,
): readonly ConfigBenefitMap[] {
  return benefitMaps
    .filter((row) => row.productId === productId)
    .toSorted((a, b) => a.sortOrder - b.sortOrder)
}

export function benefitById(
  benefitItems: readonly ConfigBenefitItem[],
  id: string,
): ConfigBenefitItem | null {
  return benefitItems.find((item) => item.id === id) ?? null
}

export function benefitsForLine(
  benefitItems: readonly ConfigBenefitItem[],
  line: InsuranceLine,
): readonly ConfigBenefitItem[] {
  return benefitItems
    .filter((item) => item.line === line)
    .toSorted((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * The checklist a product resolves to: its own row, else the company-wide one —
 * the same order `ProductRepository.checklist` resolves in, so the screen shows
 * what the rest of the product will read.
 */
export function checklistFor(
  checklists: readonly ConfigChecklist[],
  product: ConfigProduct,
  purpose: ChecklistPurpose,
): { readonly items: readonly string[]; readonly ownedByProduct: boolean } {
  const own = checklists.find(
    (entry) => entry.productId === product.id && entry.purpose === purpose,
  )
  if (own) return { items: own.items, ownedByProduct: true }

  const company = checklists.find(
    (entry) =>
      entry.companyId === product.companyId &&
      entry.productId === null &&
      entry.purpose === purpose,
  )
  return { items: company?.items ?? [], ownedByProduct: false }
}

export function scopesOfAgency(
  scopes: readonly ConfigAgencyScope[],
  agencyId: string,
): readonly ConfigAgencyScope[] {
  return scopes.filter((scope) => scope.agencyId === agencyId)
}

export function agencyById(
  agencies: readonly ConfigAgency[],
  id: string,
): ConfigAgency | null {
  return agencies.find((agency) => agency.id === id) ?? null
}

export function agentsOfAgency(
  agents: readonly ConfigAgent[],
  agencyId: string,
): readonly ConfigAgent[] {
  return agents.filter((agent) => agent.agencyId === agencyId)
}

export function subAgentsOf(
  agents: readonly ConfigAgent[],
  agentId: string,
): readonly ConfigAgent[] {
  return agents.filter((agent) => agent.parentAgentId === agentId)
}

export function parentAgentOf(
  agents: readonly ConfigAgent[],
  agent: ConfigAgent,
): ConfigAgent | null {
  if (!agent.parentAgentId) return null
  return agents.find((candidate) => candidate.id === agent.parentAgentId) ?? null
}

/**
 * FR-07.4: what placement may offer for this agency, in exactly the shape
 * `placementInsideAgencyScope` reads. Active scope rows only — a deactivated
 * appointment stops being offered the moment it is deactivated.
 */
export function placementOptionsFor(
  scopes: readonly ConfigAgencyScope[],
  agencyId: string,
): AgencyScope {
  const active = scopes.filter((scope) => scope.agencyId === agencyId && scope.active)
  return {
    agencyId,
    companyIds: [...new Set(active.map((scope) => scope.companyId))],
    productIds: [...new Set(active.map((scope) => scope.productId))],
  }
}
