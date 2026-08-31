/**
 * The feature's data layer — the established "desk" pattern (see
 * `src/features/collections/data/collection-desk.ts`).
 *
 * A desk composes reads the repositories already offer instead of asking for new
 * repository methods. That is exactly what an importer needs: resolving `HDFC
 * ERGO General` to a company id is a lookup over a list every screen already
 * reads, and duplicate detection is a scan of the same list. No repository
 * interface was widened for this feature.
 *
 * A binding is one spec plus the two things only the data layer can supply:
 * `prepare()`, which reads the lookups the file will be validated against, and
 * `commit`, which is **null where the MVP genuinely cannot write the entity**.
 * Null rather than a function that throws, because the screens branch on it and
 * a Commit step that exists but refuses is the kind of lie this build is trying
 * not to tell.
 *
 * Writes go one row at a time through the ordinary repository command, so every
 * imported record passes the same machine, emits the same events and lands in
 * the same initial state as one typed in by hand. There is no bulk path into the
 * store, and a row the machine refuses comes back with the machine's own sentence
 * on the receipt.
 */

import type {
  CreateCustomerCommand,
  CreateInquiryCommand,
  CreatePolicyCommand,
  CustomerSource,
  CustomerStatus,
  Repositories,
} from '../../../data/repo'
import { CUSTOMER_SOURCES, CUSTOMER_STATUSES } from '../../../data/repo'
import { PREMIUM_MODES } from '../../../domain/workflows'
import type { PremiumMode } from '../../../domain/workflows'
import { fromPaise } from '../../../domain/money'
import type { ImportSpec, RowVerdict, ValidationContext } from '../../../domain/dataport'
import {
  ROW_OUTCOMES,
  comparisonKey,
  digitsOf,
  identityFromValues,
  isoOf,
  paiseOf,
  textOf,
} from '../../../domain/dataport'
import { useConfigStore, masterKeyFrom } from '../../config/shared'
import {
  CLAIM_SPEC,
  CUSTOMER_SPEC,
  IMPORT_SPECS,
  INQUIRY_SPEC,
  MASTER_VALUE_SPEC,
  POLICY_SPEC,
} from '../specs'

/** Big enough to hold the whole in-memory set the lookups are built from. */
const SCAN_SIZE = 10_000

export type CommitFailure = {
  readonly rowNumber: number
  /** The machine's or the repository's own sentence. Rendered as written. */
  readonly reason: string
}

export type CommitReceipt = {
  readonly created: number
  readonly skipped: number
  readonly failures: readonly CommitFailure[]
}

export type CommitFn = (
  rows: readonly RowVerdict[],
  actorId: string,
  batchRef: string,
) => Promise<CommitReceipt>

export type ImportBinding = {
  readonly spec: ImportSpec
  /** The lookups and the duplicate set, read once when the wizard opens. */
  prepare(): Promise<ValidationContext>
  /** Null where the MVP has no way to write this entity. The screens branch on it. */
  readonly commit: CommitFn | null
}

export type ImportDesk = {
  readonly specs: readonly ImportSpec[]
  binding(specKey: string): ImportBinding | null
}

/* ------------------------------------------------------------- resolvers */

type Lookup = Map<string, string>

function add(lookup: Lookup, alias: string | null | undefined, id: string): void {
  if (alias === null || alias === undefined) return
  const key = comparisonKey(alias)
  if (key === '' || lookup.has(key)) return
  lookup.set(key, id)
}

function resolverOver(lookups: Readonly<Record<string, Lookup>>) {
  return (resolverKey: string, raw: string): string | null =>
    lookups[resolverKey]?.get(comparisonKey(raw)) ?? null
}

/** Rows that will actually be written: ready, and not a duplicate of anything. */
function creatable(rows: readonly RowVerdict[]): readonly RowVerdict[] {
  return rows.filter((row) => row.outcome === ROW_OUTCOMES.ready)
}

function skippedCount(rows: readonly RowVerdict[]): number {
  return rows.filter((row) => row.outcome !== ROW_OUTCOMES.ready).length
}

/* --------------------------------------------------------------- the desk */

export function importDesk(repositories: Repositories): ImportDesk {
  /* ------------------------------------------------------------ customers */

  const customerBinding: ImportBinding = {
    spec: CUSTOMER_SPEC,

    async prepare() {
      const [staff, customers] = await Promise.all([
        repositories.config.users(),
        repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
      ])

      const byStaff: Lookup = new Map()
      for (const person of staff) {
        if (!person.active) continue
        add(byStaff, person.name, person.id)
        add(byStaff, person.email, person.id)
        add(byStaff, person.id, person.id)
      }

      return {
        resolve: resolverOver({ staff: byStaff }),
        existingIdentities: new Set(
          customers.rows.map((customer) => identityFromValues([digitsOf(customer.mobile)])),
        ),
      }
    },

    async commit(rows, actorId) {
      const failures: CommitFailure[] = []
      let created = 0

      for (const row of creatable(rows)) {
        const command: CreateCustomerCommand = {
          actorId,
          fullName: textOf(row.values, 'fullName') ?? '',
          mobile: textOf(row.values, 'mobile') ?? '',
          city: textOf(row.values, 'city') ?? '',
          state: textOf(row.values, 'state') ?? '',
          source: (textOf(row.values, 'source') ?? CUSTOMER_SOURCES.walkIn) as CustomerSource,
          // Stated in the confirmation: rows with no owner column become yours.
          ownerId: textOf(row.values, 'ownerId') ?? actorId,
          status: (textOf(row.values, 'status') ?? CUSTOMER_STATUSES.prospect) as CustomerStatus,
          altMobile: textOf(row.values, 'altMobile'),
          email: textOf(row.values, 'email'),
          addressLine: textOf(row.values, 'addressLine'),
          pincode: textOf(row.values, 'pincode'),
          dateOfBirth: isoOf(row.values, 'dateOfBirth'),
          panNumber: textOf(row.values, 'panNumber'),
        }

        const result = await repositories.customers.create(command)
        if (result.ok) created += 1
        else failures.push({ rowNumber: row.rowNumber, reason: result.reason })
      }

      return { created, skipped: skippedCount(rows), failures }
    },
  }

  /* ------------------------------------------------------------ inquiries */

  const inquiryBinding: ImportBinding = {
    spec: INQUIRY_SPEC,

    async prepare() {
      const [categories, inquiries] = await Promise.all([
        repositories.config.categories(),
        repositories.inquiries.list({ page: 1, pageSize: SCAN_SIZE }),
      ])

      const byCategory: Lookup = new Map()
      for (const category of categories) {
        add(byCategory, category.label, category.id)
        add(byCategory, category.key, category.id)
        add(byCategory, category.id, category.id)
      }

      return {
        resolve: resolverOver({ category: byCategory }),
        existingIdentities: new Set(
          inquiries.rows.map((inquiry) => identityFromValues([digitsOf(inquiry.contactMobile)])),
        ),
      }
    },

    async commit(rows, actorId) {
      const failures: CommitFailure[] = []
      let created = 0

      for (const row of creatable(rows)) {
        const source = (textOf(row.values, 'source') ?? CUSTOMER_SOURCES.walkIn) as CustomerSource
        const referrerName = textOf(row.values, 'referrerName')

        const command: CreateInquiryCommand = {
          actorId,
          contactName: textOf(row.values, 'contactName') ?? '',
          contactMobile: textOf(row.values, 'contactMobile') ?? '',
          source,
          categoryId: textOf(row.values, 'categoryId'),
          contactEmail: textOf(row.values, 'contactEmail'),
          notes: textOf(row.values, 'notes'),
          // §9's biconditional: a referral carries a referrer, and nothing else
          // does. A referral row with the column empty is refused by the
          // repository and the receipt prints why.
          referral:
            source === CUSTOMER_SOURCES.referral && referrerName !== null
              ? { kind: 'external', referrerName }
              : null,
        }

        const result = await repositories.inquiries.create(command)
        if (result.ok) created += 1
        else failures.push({ rowNumber: row.rowNumber, reason: result.reason })
      }

      return { created, skipped: skippedCount(rows), failures }
    },
  }

  /* ------------------------------------------------------------- policies */

  const policyBinding: ImportBinding = {
    spec: POLICY_SPEC,

    async prepare() {
      const [customers, companies, products, agencies, retention, policies] = await Promise.all([
        repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
        repositories.companies.list({ page: 1, pageSize: SCAN_SIZE }),
        repositories.products.list({ page: 1, pageSize: SCAN_SIZE }),
        repositories.agencies.list({ page: 1, pageSize: SCAN_SIZE }),
        repositories.config.retentionClasses(),
        repositories.policies.list({ page: 1, pageSize: SCAN_SIZE }),
      ])

      const byCustomer: Lookup = new Map()
      for (const customer of customers.rows) {
        add(byCustomer, digitsOf(customer.mobile), customer.id)
        add(byCustomer, customer.systemNo, customer.id)
        add(byCustomer, customer.id, customer.id)
      }

      const byCompany: Lookup = new Map()
      for (const company of companies.rows) {
        add(byCompany, company.name, company.id)
        add(byCompany, company.shortName, company.id)
        add(byCompany, company.key, company.id)
        add(byCompany, company.id, company.id)
      }

      const byProduct: Lookup = new Map()
      for (const product of products.rows) {
        add(byProduct, product.name, product.id)
        add(byProduct, product.code, product.id)
        add(byProduct, product.id, product.id)
      }

      const byAgency: Lookup = new Map()
      for (const agency of agencies.rows) {
        add(byAgency, agency.name, agency.id)
        add(byAgency, agency.code, agency.id)
        add(byAgency, agency.id, agency.id)
      }

      const byRetention: Lookup = new Map()
      for (const retentionClass of retention) {
        add(byRetention, retentionClass.label, retentionClass.key)
        add(byRetention, retentionClass.key, retentionClass.key)
      }

      return {
        resolve: resolverOver({
          customer: byCustomer,
          company: byCompany,
          product: byProduct,
          agency: byAgency,
          retention: byRetention,
        }),
        // One contract per customer, product and start date. A book re-uploaded
        // does not produce a second copy of every policy in it.
        existingIdentities: new Set(
          policies.rows.map((policy) =>
            identityFromValues([policy.customerId, policy.productId, policy.startDate]),
          ),
        ),
      }
    },

    async commit(rows, actorId, batchRef) {
      const [agencies, products, schemas] = await Promise.all([
        repositories.agencies.list({ page: 1, pageSize: SCAN_SIZE }),
        repositories.products.list({ page: 1, pageSize: SCAN_SIZE }),
        repositories.config.formSchemas(),
      ])

      const fallbackSchema =
        schemas.find((schema) => schema.objectKey === 'policy_entry' && schema.active) ??
        schemas.find((schema) => schema.objectKey.startsWith('policy_entry')) ??
        schemas[0] ??
        null

      const agenciesFor = (companyId: string): readonly { id: string }[] =>
        agencies.rows.filter((agency: { companyIds: readonly string[] }) =>
          agency.companyIds.includes(companyId),
        )

      const failures: CommitFailure[] = []
      let created = 0

      for (const row of creatable(rows)) {
        const companyId = textOf(row.values, 'companyId') ?? ''
        const productId = textOf(row.values, 'productId') ?? ''

        let agencyId = textOf(row.values, 'agencyId')
        if (agencyId === null) {
          const appointed = agenciesFor(companyId)
          if (appointed.length === 1 && appointed[0]) agencyId = appointed[0].id
          else {
            failures.push({
              rowNumber: row.rowNumber,
              reason:
                appointed.length === 0
                  ? 'No agency in this system is appointed for that insurer, so there is nothing to book the policy under. Add an Agency column.'
                  : 'More than one agency is appointed for that insurer, so which one to book under cannot be decided here. Add an Agency column.',
            })
            continue
          }
        }

        const product = products.rows.find((candidate: { id: string }) => candidate.id === productId)
        const productSchemaId = (product as { formSchemaId?: string | null } | undefined)?.formSchemaId ?? null
        const schema =
          schemas.find((candidate) => candidate.id === productSchemaId) ?? fallbackSchema

        if (schema === null) {
          failures.push({
            rowNumber: row.rowNumber,
            reason: 'No policy entry form is configured, so there is no schema to record this policy under.',
          })
          continue
        }

        const sumInsured = paiseOf(row.values, 'sumInsured')
        const netPremium = paiseOf(row.values, 'netPremium')
        const gstAmount = paiseOf(row.values, 'gstAmount')
        const finalPremium = paiseOf(row.values, 'finalPremium')
        const startDate = isoOf(row.values, 'startDate')
        const expiryDate = isoOf(row.values, 'expiryDate')

        const command: CreatePolicyCommand = {
          actorId,
          customerId: textOf(row.values, 'customerId') ?? '',
          companyId,
          productId,
          agencyId,
          // A policy loaded from an old book is one the insurer already issued,
          // so it takes the direct path; `migrated` is the provenance the data
          // layer already has for exactly this.
          entryPath: 'direct',
          provenance: { origin: 'migrated', batchRef },
          formSchemaId: schema.id,
          schemaVersion: schema.version,
          savedBy: actorId,
          premiumMode: (textOf(row.values, 'premiumMode') ?? PREMIUM_MODES.annual) as PremiumMode,
          retentionClass: textOf(row.values, 'retentionClass') ?? 'standard',
          // Every figure exactly as the file typed it. Absent stays absent: an
          // amount nobody recorded is not an amount of nothing, and none of the
          // four is ever derived from another (D3).
          ...(sumInsured === null ? {} : { sumInsured: fromPaise(sumInsured) }),
          ...(netPremium === null ? {} : { netPremium: fromPaise(netPremium) }),
          ...(gstAmount === null ? {} : { gstAmount: fromPaise(gstAmount) }),
          ...(finalPremium === null ? {} : { finalPremium: fromPaise(finalPremium) }),
          ...(startDate === null ? {} : { startDate }),
          ...(expiryDate === null ? {} : { expiryDate }),
        }

        const result = await repositories.policies.create(command)
        if (result.ok) created += 1
        else failures.push({ rowNumber: row.rowNumber, reason: result.reason })
      }

      return { created, skipped: skippedCount(rows), failures }
    },
  }

  /* --------------------------------------------------------- master values */

  const masterBinding: ImportBinding = {
    spec: MASTER_VALUE_SPEC,

    async prepare() {
      // Configuration is held in the feature working set rather than behind
      // repository writes (see `config-store`), so the same store the /config
      // screens edit is the one an import fills. `hydrate` is idempotent.
      await useConfigStore.getState().hydrate(repositories.config)
      const state = useConfigStore.getState()

      const byType: Lookup = new Map()
      for (const type of state.masterTypes) {
        if (!type.editable) continue
        add(byType, type.label, type.id)
        add(byType, type.key, type.id)
        add(byType, type.id, type.id)
      }

      return {
        resolve: resolverOver({ masterType: byType }),
        existingIdentities: new Set(
          state.masterValues.map((value) =>
            identityFromValues([value.masterTypeId, value.label]),
          ),
        ),
      }
    },

    async commit(rows) {
      const store = useConfigStore.getState()
      const failures: CommitFailure[] = []
      let created = 0

      for (const row of creatable(rows)) {
        const masterTypeId = textOf(row.values, 'masterTypeId') ?? ''
        const label = textOf(row.values, 'label') ?? ''
        const key = textOf(row.values, 'key')

        const value = store.addMasterValue({
          masterTypeId,
          label,
          ...(key === null ? {} : { key: masterKeyFrom(key) }),
        })

        if (value === null) {
          failures.push({
            rowNumber: row.rowNumber,
            reason:
              'That set already holds a value with this key, so adding it would give two records the same meaning.',
          })
        } else {
          created += 1
        }
      }

      return { created, skipped: skippedCount(rows), failures }
    },
  }

  /* ------------------------------------------------------------- claims */

  const claimBinding: ImportBinding = {
    spec: CLAIM_SPEC,

    async prepare() {
      const policies = await repositories.policies.list({ page: 1, pageSize: SCAN_SIZE })

      const byPolicy: Lookup = new Map()
      for (const policy of policies.rows) {
        add(byPolicy, policy.systemNo, policy.id)
        add(byPolicy, policy.insurerNo, policy.id)
        add(byPolicy, policy.id, policy.id)
      }

      return { resolve: resolverOver({ policy: byPolicy }) }
    },

    // Null, not a stub. `ClaimRepository` has no create, and the Commit step is
    // never offered for a binding that says so.
    commit: null,
  }

  const bindings: readonly ImportBinding[] = [
    customerBinding,
    inquiryBinding,
    policyBinding,
    masterBinding,
    claimBinding,
  ]

  return {
    specs: IMPORT_SPECS,
    binding: (specKey) => bindings.find((entry) => entry.spec.key === specKey) ?? null,
  }
}
