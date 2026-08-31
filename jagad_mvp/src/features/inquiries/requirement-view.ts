/**
 * Which requirement form an inquiry gets — FR-06.16.
 *
 * Two functions and no component, which is the point: `RequirementPanel` renders
 * one of these schemas, `QuotationNewScreen` reads a captured record back under
 * the same rules, and neither should have to import the other's module to do it.
 */

import { SEED_FORM_SCHEMAS, resolveFormSchema } from '../../domain/forms'
import type { FormSchema } from '../../domain/forms'
import type { InquiryCategory } from '../../data/repo'

/**
 * The object key holding the questions for one line of business.
 *
 * One key per line rather than one shared `inquiry_requirement`, exactly as
 * `policy_entry_health` and `policy_entry_motor` already are: the form engine
 * keeps one live version per object, and two live schemas under one key would
 * make "render this record under the schema it was captured with" a question
 * with two answers.
 */
export function requirementObjectKey(line: string): string {
  return `inquiry_requirement_${line}`
}

/** The live form for this inquiry's line, or null where none is configured. */
export function requirementSchemaFor(
  category: InquiryCategory | null,
  catalogue: readonly FormSchema[] = SEED_FORM_SCHEMAS,
): FormSchema | null {
  if (!category) return null
  return resolveFormSchema(catalogue, { objectKey: requirementObjectKey(category.line) })
}
