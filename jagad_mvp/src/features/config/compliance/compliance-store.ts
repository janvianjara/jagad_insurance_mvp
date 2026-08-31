/**
 * The compliance register's working set — plan §4, `/config/compliance`, and the
 * §12 obligations that live on it: consent, retention, data-principal rights,
 * breaches, processors and the audit trail.
 *
 * One store, one read. The retention classes are the only thing here an admin
 * edits against a repository, and editing them is the point: §9 says retention
 * comes from the class rather than from a constant, `retentionWindowElapsed`
 * reads the years off it, and "ten years" appears nowhere in code precisely so
 * this screen can be the place it is decided.
 *
 * Everything read from a repository is read-only and deliberately so. A consent
 * record moves only through `consentMachine`, and a document's review state moves
 * only through the KYC and back-office screens; a configuration screen that could
 * set either behind a machine's back would be a configuration screen that can
 * forge an audit trail.
 *
 * ## Three kinds of record this store holds itself, and why
 *
 * Rights requests, breaches and consent withdrawals have no repository. There is
 * no table for a data-principal request, `ConsentState` has no `withdrawn`
 * member, and there is no incident register. Rather than invent a write into a
 * repository that does not have one, they are held here — in the shape a
 * repository would hold them, so the day one exists this store reads it instead
 * and no screen changes. What that costs is honest and is said on screen: they
 * live for the session, and the register says so rather than implying a durable
 * record.
 *
 * ## What is NOT read is as decided as what is
 *
 * Documents are read for their metadata — type, review state, timestamps,
 * retention class — and never for `fileName`, `extractedText` or `ocrFields`,
 * which are document-content class. Consent records are read without their
 * tokens: a token is a live credential to a login-free page, and an audit trail
 * is not where one belongs. Members are read for name, relationship and date of
 * birth, and never for `healthDeclaration`, `preExistingConditions` or
 * `diagnosis`.
 */

import { create } from 'zustand'
import type {
  ConsentRecord,
  Customer,
  DocumentRecord,
  IntegrationConfig,
  Member,
  MessageLog,
  Policy,
  RecipeRun,
  Repositories,
  RetentionClass,
} from '../../../data/repo'
import type { ConfigStatus } from '../shared'
import type { BreachRecord, BreachStepEntry } from './breach-runbook'
import type { DataPrincipalRequest, RightsDecision, RightKind } from './rights-requests'
import type { ConsentWithdrawal } from './withdrawal-register'

/** The repositories this store reads. Never the whole bag. */
export type ComplianceRepositories = Pick<
  Repositories,
  'config' | 'customers' | 'documents' | 'policies' | 'integrations' | 'recipeRuns'
>

/** Compliance is a few hundred rows; one read each, not a paged crawl. */
const ALL_ROWS = { pageSize: 500 } as const

/** Message logs are addressed by subject, and the subject entity is capitalised. */
const CUSTOMER_SUBJECT = 'Customer'

/** What a configuration export would carry, counted at read time. */
export type ConfigCounts = {
  readonly masterTypes: number
  readonly masterValues: number
  readonly inquiryStages: number
  readonly dispositions: number
  readonly categories: number
  readonly teams: number
  readonly messageTemplates: number
  readonly recipes: number
  readonly formSchemas: number
}

const NO_COUNTS: ConfigCounts = {
  masterTypes: 0,
  masterValues: 0,
  inquiryStages: 0,
  dispositions: 0,
  categories: 0,
  teams: 0,
  messageTemplates: 0,
  recipes: 0,
  formSchemas: 0,
}

export type RightsRequestInput = {
  readonly customerId: string
  readonly kind: RightKind
  readonly receivedAt: string
  readonly note: string
  readonly recordedBy: string
}

export type BreachInput = {
  readonly detectedAt: string
  readonly summary: string
  readonly affectedCount: number | null
  readonly recordedAt: string
  readonly recordedBy: string
}

export type ComplianceState = {
  readonly status: ConfigStatus
  readonly error: Error | null
  /** Bumped by every mutation; the screen remounts its queue on it. */
  readonly revision: number

  readonly retentionClasses: readonly RetentionClass[]
  readonly customers: readonly Customer[]
  readonly members: readonly Member[]
  readonly consents: readonly ConsentRecord[]
  readonly documents: readonly DocumentRecord[]
  readonly policies: readonly Policy[]
  readonly messages: readonly MessageLog[]
  readonly integrations: readonly IntegrationConfig[]
  /** The declined runs only. FR-17.3's skip log, as the register reads it. */
  readonly skippedRuns: readonly RecipeRun[]
  readonly configCounts: ConfigCounts

  /** Held here because no repository holds them. See the note at the top. */
  readonly rightsRequests: readonly DataPrincipalRequest[]
  readonly breaches: readonly BreachRecord[]
  readonly withdrawals: readonly ConsentWithdrawal[]

  hydrate(repositories: ComplianceRepositories): Promise<void>
  reset(): void

  /** The years a class holds records for. The key is what records store, so it never moves. */
  saveRetentionClass(id: string, label: string, years: number): void

  recordRightsRequest(input: RightsRequestInput): void
  decideRightsRequest(id: string, decision: RightsDecision): void

  recordBreach(input: BreachInput): void
  recordBreachStep(breachId: string, stepKey: string, entry: BreachStepEntry): void

  recordWithdrawal(withdrawal: ConsentWithdrawal): void
}

const EMPTY = {
  status: 'idle' as ConfigStatus,
  error: null,
  revision: 0,
  retentionClasses: [] as readonly RetentionClass[],
  customers: [] as readonly Customer[],
  members: [] as readonly Member[],
  consents: [] as readonly ConsentRecord[],
  documents: [] as readonly DocumentRecord[],
  policies: [] as readonly Policy[],
  messages: [] as readonly MessageLog[],
  integrations: [] as readonly IntegrationConfig[],
  skippedRuns: [] as readonly RecipeRun[],
  configCounts: NO_COUNTS,
  rightsRequests: [] as readonly DataPrincipalRequest[],
  breaches: [] as readonly BreachRecord[],
  withdrawals: [] as readonly ConsentWithdrawal[],
}

/** A number a person can read out over the phone. Sequential within the session. */
function nextNo(prefix: string, held: number): string {
  return `${prefix}-${String(held + 1).padStart(4, '0')}`
}

export const useComplianceStore = create<ComplianceState>((set, get) => ({
  ...EMPTY,

  async hydrate(repositories) {
    const state = get()
    if (state.status === 'loading' || state.status === 'ready') return
    set({ status: 'loading', error: null })

    try {
      const [
        retentionClasses,
        customerPage,
        documentPage,
        policyPage,
        integrationPage,
        masterTypes,
        inquiryStages,
        dispositions,
        categories,
        teams,
        messageTemplates,
        recipes,
        formSchemas,
      ] = await Promise.all([
        repositories.config.retentionClasses(),
        repositories.customers.list(ALL_ROWS),
        repositories.documents.list(ALL_ROWS),
        repositories.policies.list(ALL_ROWS),
        repositories.integrations.list(ALL_ROWS),
        repositories.config.masterTypes(),
        repositories.config.inquiryStages(),
        repositories.config.dispositions(),
        repositories.config.categories(),
        repositories.config.teams(),
        repositories.config.templates(),
        repositories.config.recipes(),
        repositories.config.formSchemas(),
      ])

      const [consentReads, messageReads, memberReads, masterValueReads, runPage] =
        await Promise.all([
          Promise.all(
            customerPage.rows.map((customer) => repositories.customers.consent(customer.id)),
          ),
          Promise.all(
            customerPage.rows.map((customer) =>
              repositories.config.messages(CUSTOMER_SUBJECT, customer.id),
            ),
          ),
          Promise.all(
            customerPage.rows.map((customer) => repositories.customers.members(customer.id)),
          ),
          Promise.all(masterTypes.map((type) => repositories.config.masterValues(type.key))),
          // The skip log, pinned to the declined runs. A wider read would be a
          // list of everything the platform did, which is a different screen.
          repositories.recipeRuns.list({ ...ALL_ROWS, filters: { decision: ['skipped'] } }),
        ])

      set({
        status: 'ready',
        error: null,
        revision: get().revision + 1,
        retentionClasses,
        customers: customerPage.rows,
        documents: documentPage.rows,
        policies: policyPage.rows,
        integrations: integrationPage.rows,
        consents: consentReads.filter((record): record is ConsentRecord => record !== null),
        messages: messageReads.flat(),
        members: memberReads.flat(),
        skippedRuns: runPage.rows,
        configCounts: {
          masterTypes: masterTypes.length,
          masterValues: masterValueReads.flat().length,
          inquiryStages: inquiryStages.length,
          dispositions: dispositions.length,
          categories: categories.length,
          teams: teams.length,
          messageTemplates: messageTemplates.length,
          recipes: recipes.length,
          formSchemas: formSchemas.length,
        },
      })
    } catch (cause) {
      set({
        status: 'error',
        error:
          cause instanceof Error ? cause : new Error('The compliance record could not be read.'),
      })
    }
  },

  reset() {
    set({ ...EMPTY })
  },

  saveRetentionClass(id, label, years) {
    const state = get()
    set({
      revision: state.revision + 1,
      retentionClasses: state.retentionClasses.map((entry) =>
        entry.id === id
          ? // The key stays: it is what every document and policy row already
            // holds, and a renamed key would orphan every record that names it.
            { ...entry, label: label.trim() || entry.label, years: Math.max(0, years) }
          : entry,
      ),
    })
  },

  recordRightsRequest(input) {
    const state = get()
    const request: DataPrincipalRequest = {
      id: nextNo('DPR', state.rightsRequests.length),
      customerId: input.customerId,
      kind: input.kind,
      receivedAt: input.receivedAt,
      note: input.note.trim(),
      recordedBy: input.recordedBy,
      decision: null,
    }
    set({ revision: state.revision + 1, rightsRequests: [...state.rightsRequests, request] })
  },

  /**
   * The decision is written whole and never edited afterwards. A rights decision
   * that could be revised in place would be a rights decision nobody could rely
   * on having been made; a changed mind is a new request.
   */
  decideRightsRequest(id, decision) {
    const state = get()
    set({
      revision: state.revision + 1,
      rightsRequests: state.rightsRequests.map((request) =>
        request.id === id && request.decision === null ? { ...request, decision } : request,
      ),
    })
  },

  recordBreach(input) {
    const state = get()
    const record: BreachRecord = {
      id: nextNo('BRE', state.breaches.length),
      detectedAt: input.detectedAt,
      summary: input.summary.trim(),
      affectedCount: input.affectedCount,
      recordedAt: input.recordedAt,
      recordedBy: input.recordedBy,
      steps: {},
    }
    set({ revision: state.revision + 1, breaches: [...state.breaches, record] })
  },

  /** A step is recorded once. A runbook entry that could be re-timed is not evidence. */
  recordBreachStep(breachId, stepKey, entry) {
    const state = get()
    set({
      revision: state.revision + 1,
      breaches: state.breaches.map((record) =>
        record.id === breachId && record.steps[stepKey] === undefined
          ? { ...record, steps: { ...record.steps, [stepKey]: entry } }
          : record,
      ),
    })
  },

  recordWithdrawal(withdrawal) {
    const state = get()
    set({ revision: state.revision + 1, withdrawals: [...state.withdrawals, withdrawal] })
  },
}))

/* ---------------------------------------------------------------- selectors */

export function customerName(customers: readonly Customer[], id: string): string {
  return customers.find((customer) => customer.id === id)?.fullName ?? 'A customer no longer on file'
}

export function customerById(customers: readonly Customer[], id: string): Customer | null {
  return customers.find((customer) => customer.id === id) ?? null
}

/** How many records a retention class is currently holding, by kind. */
export function recordsInClass(
  state: Pick<ComplianceState, 'documents' | 'policies'>,
  key: string,
): { readonly documents: number; readonly policies: number; readonly closed: number } {
  const policies = state.policies.filter((policy) => policy.retentionClass === key)
  return {
    documents: state.documents.filter((document) => document.retentionClass === key).length,
    policies: policies.length,
    closed: policies.filter(
      (policy) => policy.status === 'closed' || policy.status === 'locked',
    ).length,
  }
}
