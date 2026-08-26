/**
 * The seed catalogue — six published schemas across five objects.
 *
 * These are configuration, not code, and they live in the domain layer for one
 * reason worth stating plainly: the stored `FormSchema` row in
 * `src/data/repo/config.ts` cannot yet hold a roll-up or a repeating group, and
 * widening it belongs to the step that owns that file. Until then these are
 * declared here, checked by `defineFormSchema`, and served through
 * `resolveFormSchema` exactly as a repository would serve them — same lookup,
 * same version pinning, one line to move later.
 *
 * A stored row from P-04 is already a valid schema for this renderer (see
 * `stored-schema.test.ts`), so a screen can hold both sets in one catalogue.
 */
import type { FormSchema } from '../schema'
import { HEALTH_POLICY_ENTRY_V1, HEALTH_POLICY_ENTRY_V2 } from './policy-health'
import { INQUIRY_CAPTURE_V1 } from './inquiry'
import { KYC_CAPTURE_V1 } from './kyc'
import { LIFE_POLICY_ENTRY_V1 } from './policy-life'
import { MOTOR_POLICY_ENTRY_V1 } from './policy-motor'

export {
  HEALTH_POLICY_ENTRY_V1,
  HEALTH_POLICY_ENTRY_V2,
  INQUIRY_CAPTURE_V1,
  KYC_CAPTURE_V1,
  LIFE_POLICY_ENTRY_V1,
  MOTOR_POLICY_ENTRY_V1,
}

/**
 * Both health versions are in the list on purpose: a catalogue that only ever
 * holds the live version cannot answer what a record captured last January was.
 */
export const SEED_FORM_SCHEMAS: readonly FormSchema[] = [
  HEALTH_POLICY_ENTRY_V1,
  HEALTH_POLICY_ENTRY_V2,
  MOTOR_POLICY_ENTRY_V1,
  LIFE_POLICY_ENTRY_V1,
  INQUIRY_CAPTURE_V1,
  KYC_CAPTURE_V1,
]
