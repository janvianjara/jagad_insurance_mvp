/**
 * How a schema is declared — and where removing a reserved field stops being a
 * convention and starts being a failure.
 *
 * Every seed in `seeds/` goes through this function, and so should every schema
 * a later step hard-codes. Two gates, deliberately redundant:
 *
 *   1. The compiler. `ReservedGuard` reads the reserved keys for the schema's
 *      object out of `RESERVED_FIELDS` as literal types and compares them with
 *      the keys the definition actually declares. Drop `expiryDate` from the
 *      health schema and the call no longer type-checks — the missing key is in
 *      the error text, before anything runs.
 *   2. `assertValidFormSchema`, which throws with every problem named. That is
 *      what catches a schema built at runtime from stored rows, where there is
 *      no literal type to inspect.
 *
 * The type-level gate cannot see a schema assembled at runtime, and the runtime
 * gate cannot fail a build. Between them there is no way to ship a form the
 * renewal machine cannot read.
 */
import { RESERVED_FIELDS } from './reserved'
import type { ReservedObjectKey } from './reserved'
import type { FormSchema } from './schema'
import { assertValidFormSchema } from './validate'

type StagesOf<S> = S extends { readonly stages: readonly (infer Stage)[] } ? Stage : never
type FieldsOf<Stage> = Stage extends { readonly fields: readonly (infer Field)[] } ? Field : never
type KeysOf<Field> = Field extends { readonly key: infer Key }
  ? Key extends string
    ? Key
    : never
  : never

/** Every top-level field key the definition declares, as literal types. */
type DeclaredKeys<S> = KeysOf<FieldsOf<StagesOf<S>>>

type ObjectKeyOf<S> = S extends { readonly objectKey: infer Key }
  ? Key extends string
    ? Key
    : never
  : never

type ReservedKeysFor<Key extends string> = Key extends ReservedObjectKey
  ? (typeof RESERVED_FIELDS)[Key][number]['key']
  : never

type MissingReserved<S> = Exclude<ReservedKeysFor<ObjectKeyOf<S>>, DeclaredKeys<S>>

/**
 * Nothing extra to satisfy when the schema is complete; an impossible property
 * to satisfy when it is not. The missing key is spelled out in the type, so the
 * compiler error names the field that was removed.
 */
type ReservedGuard<S> = [MissingReserved<S>] extends [never]
  ? unknown
  : {
      readonly reservedSystemFieldRemoved: `This schema may not remove: ${MissingReserved<S> &
        string}`
    }

/**
 * Declares a form schema, checked both ways.
 *
 * Returns the same object — this is a gate, not a builder. Nothing is defaulted
 * in, because a schema that quietly gained a field it did not declare is the
 * first step towards a form nobody can account for.
 */
export function defineFormSchema<const S extends FormSchema>(
  schema: S & ReservedGuard<S>,
): FormSchema {
  return assertValidFormSchema(schema)
}
