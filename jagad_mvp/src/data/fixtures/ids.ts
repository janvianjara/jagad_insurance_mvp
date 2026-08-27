/**
 * Fixture numbering helpers — plan §8, dual numbering.
 *
 * `src/domain/ids.ts` owns the numbers the platform generates for the record
 * kinds §8 names: inquiry, quotation, deal, policy, policy draft, claim,
 * endorsement, task. Fixtures go through `formatSystemNo` for every one of those,
 * so the story cast keeps the numbers the client recognises from the prototype
 * walkthrough and the generated set continues the same sequence.
 *
 * A customer number joined that list once `customers.create` landed: the counter
 * generates it, so it belongs in the registry rather than beside it.
 *
 * A document, a collection and a renewal task also carry a readable number in the
 * prototype, and those prefixes stay out of the domain registry because the
 * platform does not generate them through the sequence counter. `localNo` formats
 * those at the same width so the two kinds sit together in a table without one
 * looking like a mistake.
 */

import { SEQUENCE_WIDTH, formatSystemNo } from '../../domain/ids'
import type { RecordKind } from '../../domain/ids'
import { RECORD_PREFIXES } from '../../domain/ids'

/** A system number for one of the record kinds the domain registry names. */
export function systemNo(kind: RecordKind, sequence: number): string {
  return formatSystemNo(RECORD_PREFIXES[kind], sequence)
}

/** A readable number for a record kind the sequence counter does not own. */
export function localNo(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`
}

/** `cus-v0001` and friends: a stable, sortable id for a generated record. */
export function volumeId(prefix: string, sequence: number): string {
  return `${prefix}-v${String(sequence).padStart(4, '0')}`
}
