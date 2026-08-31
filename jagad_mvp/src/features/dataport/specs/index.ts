/**
 * The importable entities — one spec each.
 *
 * The specs live here rather than in `src/domain/dataport/` for a layering
 * reason: each one names the enumerations of the entity it imports, and those
 * constants belong to `src/data/repo`. `src/domain` may not depend on
 * `src/data`, and inverting that dependency to keep the specs "pure" would put a
 * cycle in the module graph for no gain. The domain holds the machinery; this
 * folder holds the contracts.
 *
 * A spec knows nothing about repositories. Whether an entity can be *written* is
 * a fact about the MVP's data layer, so the spec carries only the honest
 * `writable` flag and the sentence to say; the desk in `../data/import-desk.ts`
 * is where a commit actually happens.
 */

import type { ImportSpec } from '../../../domain/dataport'
import { CUSTOMER_SPEC } from './customers'
import { INQUIRY_SPEC } from './inquiries'
import { POLICY_SPEC } from './policies'
import { MASTER_VALUE_SPEC } from './masters'
import { CLAIM_SPEC } from './claims'

export { CUSTOMER_SPEC } from './customers'
export { INQUIRY_SPEC } from './inquiries'
export { POLICY_SPEC } from './policies'
export { MASTER_VALUE_SPEC } from './masters'
export { CLAIM_SPEC } from './claims'

/** In the order the hub lists them: the front of the book first. */
export const IMPORT_SPECS: readonly ImportSpec[] = [
  CUSTOMER_SPEC,
  INQUIRY_SPEC,
  POLICY_SPEC,
  MASTER_VALUE_SPEC,
  CLAIM_SPEC,
]

export function importSpec(key: string): ImportSpec | undefined {
  return IMPORT_SPECS.find((spec) => spec.key === key)
}
