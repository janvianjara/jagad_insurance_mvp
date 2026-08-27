/**
 * What policy entry reads before it can render, and the one decision it makes
 * on the way: which form a product is captured under.
 *
 * Kept out of the screen for the usual reason — a screen that fetches inside its
 * own body cannot be reasoned about — and for one specific to this step. Schema
 * resolution here is a genuine rule, and it is short enough to read in full:
 *
 *   A product that names its own schema gets it. HDFC Ergo Optima Secure is
 *   configured with `frm-policy-entry-optima`, and a line-wide form must never
 *   quietly override an admin's product-specific one.
 *
 *   Otherwise the product's line decides: health, motor and life each have a
 *   published entry form of their own, because a motor proposal asks about a
 *   vehicle and a life proposal asks about a term, and canvas 6.2's promise is
 *   that this is configuration rather than three coded screens.
 *
 *   Failing both, the generic `policy_entry` form. Travel and property have no
 *   line-specific schema yet, and the fallback is a published schema rather than
 *   an apology.
 *
 * All three go through `resolveFormSchema`, which is what the catalogue was
 * built for: it already knows that a product-specific schema beats a generic one
 * regardless of publication order, and that a pinned version outranks `active`.
 * The only thing this file adds is one catalogue built from both sources — the
 * stored rows an admin edits in configuration, and the seeded line schemas that
 * hold roll-ups and repeating groups the stored row cannot express yet. Merging
 * them is the whole of the "one line to move later" the seeds file promises.
 *
 * There is no function below that returns a `Money`. The typed figures are read
 * out of form values by `readMoney`, which is `src/domain/forms`' own reader,
 * and handed straight to a command (D3).
 */

import type { SelectOption } from '../../ui/form'
import type { FormSchema, FormValues, MissingField } from '../../domain/forms'
import { allFields, missingRequiredFields, resolveFormSchema } from '../../domain/forms'
import { SEED_FORM_SCHEMAS } from '../../domain/forms'
import type {
  Customer,
  Deal,
  Product,
  Repositories,
  RetentionClass,
  StaffUser,
} from '../../data/repo'
import type { InsuranceLine } from '../../data/repo'
import type { MasterOptions } from '../../components/SchemaForm'

/** The generic policy-entry form, and the fallback for a line without its own. */
export const GENERIC_ENTRY_OBJECT = 'policy_entry'

/**
 * The line-specific entry forms, by line.
 *
 * Travel and property are deliberately absent rather than mapped to a key that
 * resolves to nothing: absence here reads as "this line has no form of its own
 * yet", which is the truth, and adding one is adding a seed and a line below.
 */
export const ENTRY_OBJECT_BY_LINE: Readonly<Partial<Record<InsuranceLine, string>>> = {
  health: 'policy_entry_health',
  motor: 'policy_entry_motor',
  life: 'policy_entry_life',
}

/**
 * Which retention class a line's records fall under, as configuration names them.
 * The years behind the class come from `RetentionClass`, never from here — §9 is
 * explicit that retention is read off the class rather than hard-coded.
 */
export const RETENTION_CLASS_BY_LINE: Readonly<Partial<Record<InsuranceLine, string>>> = {
  health: 'health',
  motor: 'motor',
}

export const FALLBACK_RETENTION_CLASS = 'standard'

/** One catalogue over both sources — see this file's opening note. */
export function entryCatalogue(stored: readonly FormSchema[]): readonly FormSchema[] {
  return [...stored, ...SEED_FORM_SCHEMAS]
}

/** The form a product is captured under. Null when nothing is published for it. */
export function schemaForProduct(
  catalogue: readonly FormSchema[],
  product: Product,
): FormSchema | null {
  const named = resolveFormSchema(catalogue, {
    objectKey: GENERIC_ENTRY_OBJECT,
    productId: product.id,
  })
  if (named !== null && named.productId === product.id) return named

  const forLine = ENTRY_OBJECT_BY_LINE[product.line]
  if (forLine !== undefined) {
    const lineSchema = resolveFormSchema(catalogue, { objectKey: forLine })
    if (lineSchema !== null) return lineSchema
  }

  return resolveFormSchema(catalogue, { objectKey: GENERIC_ENTRY_OBJECT })
}

export function retentionClassFor(
  classes: readonly RetentionClass[],
  line: InsuranceLine,
): string {
  const wanted = RETENTION_CLASS_BY_LINE[line] ?? FALLBACK_RETENTION_CLASS
  const found = classes.find((entry) => entry.key === wanted) ?? classes.find(
    (entry) => entry.key === FALLBACK_RETENTION_CLASS,
  )
  return found?.key ?? FALLBACK_RETENTION_CLASS
}

/**
 * Field key to the label a person saw, across every schema in the catalogue.
 *
 * The completion queue stores what is missing as bare keys, because that is what
 * a queue can sort and filter on. Showing `nomineeRelationship` to whoever has
 * to finish the entry would be showing them the database; this is how the row
 * says "Relationship" instead. Keys shared between schemas mean the same thing
 * by construction — `reserved.ts` is what makes that true of the ones that
 * matter — so the last label wins and nothing is lost.
 */
export function fieldLabelsFrom(catalogue: readonly FormSchema[]): Readonly<Record<string, string>> {
  const labels: Record<string, string> = {}
  for (const schema of catalogue) {
    for (const field of allFields(schema)) labels[field.key] = field.label
  }
  return labels
}

/** What `missingRequiredFields` found, as the flat key list a draft stores. */
export function missingKeysOf(schema: FormSchema, values: FormValues): readonly string[] {
  return missingRequiredFields(schema, values).map((field: MissingField) => field.fieldKey)
}

/* --------------------------------------------------------------- the reads */

export type EntryContext = {
  /** The deal `?dealId=` named, or null for an entry that starts from nothing. */
  readonly deal: Deal | null
  /** Present only when a deal named one; otherwise the screen asks. */
  readonly dealCustomer: Customer | null
  readonly customers: readonly Customer[]
  readonly catalogue: readonly FormSchema[]
  readonly retentionClasses: readonly RetentionClass[]
  readonly users: readonly StaffUser[]
  /** Master-backed select options, keyed by master type id as a schema names it. */
  readonly masterOptions: MasterOptions
}

/** Big enough to hold the whole in-memory set when a picker needs every row. */
const SCAN_SIZE = 10_000

export async function loadEntryContext(
  repositories: Repositories,
  dealId: string | null,
): Promise<EntryContext> {
  const [deal, stored, retentionClasses, users, customerPage, masterTypes] = await Promise.all([
    dealId === null ? Promise.resolve(null) : repositories.deals.get(dealId),
    repositories.config.formSchemas(),
    repositories.config.retentionClasses(),
    repositories.config.users(),
    repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
    repositories.config.masterTypes(),
  ])

  const optionsByType = await Promise.all(
    masterTypes.map(async (type) => {
      const values = await repositories.config.masterValues(type.key)
      const options: readonly SelectOption[] = values
        .filter((value) => value.active)
        .toSorted((a, b) => a.sortOrder - b.sortOrder)
        .map((value) => ({ value: value.key, label: value.label }))
      return [type.id, options] as const
    }),
  )

  return {
    deal,
    dealCustomer:
      deal === null ? null : await repositories.customers.get(deal.customerId),
    customers: customerPage.rows,
    catalogue: entryCatalogue(stored),
    retentionClasses,
    users,
    masterOptions: Object.fromEntries(optionsByType),
  }
}

/**
 * Every policy on file, for the completion queue.
 *
 * A `PolicyEntryDraft` carries a `policyId` and nothing a person can read: no
 * number, no customer, no product. The drafts queue therefore needs the policies
 * beside it, and it needs all of them rather than the ones on the current page,
 * because sorting by how much is missing reorders which drafts a page holds.
 */
export async function loadDraftContext(repositories: Repositories) {
  const [policies, customers, users, stored] = await Promise.all([
    repositories.policies.list({ page: 1, pageSize: SCAN_SIZE }),
    repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
    repositories.config.users(),
    repositories.config.formSchemas(),
  ])

  return {
    policies: policies.rows,
    customers: customers.rows,
    users,
    labels: fieldLabelsFrom(entryCatalogue(stored)),
  }
}
