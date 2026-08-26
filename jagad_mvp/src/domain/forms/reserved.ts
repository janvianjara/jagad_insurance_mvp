/**
 * Reserved system fields — the ones a configured schema may never remove.
 *
 * Flow 6 lets an admin edit forms. Some of those fields are not decoration:
 * `expiryDate` is what the renewal machine counts down to, `finalPremium` is
 * what §9 gates issuance on, `contactMobile` is the address every notice goes
 * to, `source` is what routing reads. Delete one in the schema editor and the
 * platform does not render a slightly shorter form — it renders a policy that
 * can never come up for renewal.
 *
 * So reserved-ness lives here rather than as a flag on the field. A flag in the
 * schema is a flag the schema editor can clear; a registry outside the schema
 * is a rule the schema cannot argue with. Removal fails three ways:
 *
 *   1. `defineFormSchema` refuses the definition at compile time — the missing
 *      key shows up in the type error by name.
 *   2. `validateFormSchema` reports it, and `defineFormSchema` throws.
 *   3. `<SchemaForm>` refuses to render a schema with problems, so a row that
 *      reached storage some other way still cannot quietly drop the field.
 *
 * `kinds` is a set rather than one kind because the concept is what is
 * reserved, not the control: `finalPremium` may be a typed money leaf on the
 * generic form and a `<RollUp>` on the health form, and both are the final
 * premium. Renaming the key, or turning it into a text note, is removal.
 */
import type { FieldKind, FormSchema } from './schema'

export type ReservedField = {
  readonly key: string
  readonly kinds: readonly FieldKind[]
  /** Why the platform depends on it. Read this before proposing a removal. */
  readonly because: string
}

/**
 * Every policy-entry form, whatever the line, owes the platform these three.
 * The health, motor and life schemas each declare their own cover fields; these
 * are the ones the machines in §9 read by name.
 */
const POLICY_ENTRY_RESERVED = [
  {
    key: 'startDate',
    kinds: ['date'],
    because: 'Risk start is the anniversary the premium schedule and renewal task count from (§9).',
  },
  {
    key: 'expiryDate',
    kinds: ['date'],
    because: 'Expiry is what the renewal machine counts down to; without it a policy can never come up for renewal (§9).',
  },
  {
    key: 'finalPremium',
    kinds: ['money', 'rollup'],
    because: 'Issuance is gated on a recorded Final Premium (§9 policy guard), and commission is booked against it.',
  },
  // `as const`, not a widened annotation: `defineFormSchema` reads the keys out
  // of this tuple as literal types, so a removed field is named in the compile
  // error rather than discovered at runtime.
] as const satisfies readonly ReservedField[]

/**
 * Object key to the fields the platform reads by name.
 *
 * The three policy-entry variants share one list on purpose: a line-specific
 * form is still a policy, and the renewal machine does not care which line it
 * was sold on. `policy_entry` is the generic stored schema from P-04.
 */
export const RESERVED_FIELDS = {
  policy_entry: POLICY_ENTRY_RESERVED,
  policy_entry_health: POLICY_ENTRY_RESERVED,
  policy_entry_motor: POLICY_ENTRY_RESERVED,
  policy_entry_life: POLICY_ENTRY_RESERVED,
  inquiry: [
    {
      key: 'contactName',
      kinds: ['text'],
      because: 'The inquiry queue, the assignment trail and every outward message address a person by name.',
    },
    {
      key: 'contactMobile',
      kinds: ['text'],
      because: 'WhatsApp and SMS are the channels flow 1 promises; the mobile is the address they go to.',
    },
    {
      key: 'source',
      kinds: ['select'],
      because: 'Source drives routing to the category group and the FR-2 source report.',
    },
  ],
  kyc: [
    {
      key: 'aadhaarLast4',
      kinds: ['text'],
      because: 'The last four digits are the identity evidence KYC completion is recorded against — and the maximum the staff UI may ever hold.',
    },
    {
      key: 'panNumber',
      kinds: ['text'],
      because: 'PAN is the second KYC identifier; `kyc.completed` cannot be emitted without it (§9).',
    },
    {
      key: 'addressLine',
      kinds: ['text', 'textarea'],
      because: 'The address on the proposal is what the insurer and the policy document print.',
    },
  ],
  claim_intimation: [
    {
      key: 'claimType',
      kinds: ['select'],
      because: 'Cashless and reimbursement are different journeys; the claim machine branches on this (§9).',
    },
    {
      key: 'occurredOn',
      kinds: ['date'],
      because: 'The date of event decides intimation lateness and which policy version was in force.',
    },
  ],
} as const satisfies Record<string, readonly ReservedField[]>

export type ReservedObjectKey = keyof typeof RESERVED_FIELDS

/** The reserved list for an object, or an empty list for one with no rules yet. */
export function reservedFieldsFor(objectKey: string): readonly ReservedField[] {
  const known = RESERVED_FIELDS as Record<string, readonly ReservedField[] | undefined>
  return known[objectKey] ?? []
}

export type ReservedBreach = {
  readonly field: ReservedField
  /** `missing` when the key is gone or renamed; `kind` when it changed meaning. */
  readonly reason: 'missing' | 'kind'
  readonly foundKind: FieldKind | null
}

/**
 * Which reserved fields this schema has dropped or repurposed.
 *
 * Only top-level fields count. A reserved field pushed inside a repeating group
 * is a reserved field the platform can no longer read, which is removal by
 * another route.
 */
export function reservedBreaches(schema: FormSchema): readonly ReservedBreach[] {
  const present = new Map<string, FieldKind>()
  for (const stage of schema.stages) {
    for (const field of stage.fields) present.set(field.key, field.kind)
  }

  const breaches: ReservedBreach[] = []
  for (const field of reservedFieldsFor(schema.objectKey)) {
    const foundKind = present.get(field.key)
    if (foundKind === undefined) {
      breaches.push({ field, reason: 'missing', foundKind: null })
      continue
    }
    if (!field.kinds.includes(foundKind)) {
      breaches.push({ field, reason: 'kind', foundKind })
    }
  }
  return breaches
}
