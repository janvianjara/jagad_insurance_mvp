/**
 * The bridge from a generated zod schema to react-hook-form.
 *
 * `@hookform/resolvers` is not a dependency of this project, and adding one for
 * forty lines would be a poor trade — especially as the resolver here has to do
 * something the packaged one cannot: rebuild the validator from the CURRENT
 * values on every run, because which fields are being asked about depends on
 * what has been answered so far.
 *
 * react-hook-form is v7.86: a resolver takes the values and returns either
 * `{ values, errors: {} }` or `{ values: {}, errors }`, with error keys as dot
 * paths (`cashflow.0.premiumDue`). Checked against the installed
 * `dist/types/resolvers.d.ts` rather than recalled.
 */
import type { FieldError, FieldErrors, Resolver } from 'react-hook-form'
import { buildFormZodSchema } from '../../domain/forms'
import type { FormSchema, FormValues } from '../../domain/forms'

type Values = Record<string, unknown>

/** `['cashflow', 0, 'premiumDue']` as react-hook-form names it. */
function pathOf(parts: readonly PropertyKey[]): string {
  return parts.map((part) => String(part)).join('.')
}

/**
 * Nested error objects, built by hand.
 *
 * react-hook-form reads `errors.cashflow[0].premiumDue`, not
 * `errors['cashflow.0.premiumDue']`, so a flat map would render an error nobody
 * ever sees under the field that caused it.
 */
function setNested(errors: Record<string, unknown>, parts: readonly PropertyKey[], error: FieldError): void {
  const [head, ...rest] = parts.map((part) => String(part))
  if (head === undefined) return

  if (rest.length === 0) {
    if (errors[head] === undefined) errors[head] = error
    return
  }

  const existing = errors[head]
  const next = typeof existing === 'object' && existing !== null ? existing : {}
  errors[head] = next
  setNested(next as Record<string, unknown>, rest, error)
}

/**
 * The resolver for one schema. Regenerates the validator per run, so a field
 * that has branched away is never validated and never blocks a submit.
 */
export function schemaResolver(schema: FormSchema): Resolver<Values> {
  return (values) => {
    const formValues = values as FormValues
    const result = buildFormZodSchema(schema, formValues).safeParse(values)

    if (result.success) return { values, errors: {} }

    const errors: Record<string, unknown> = {}
    for (const issue of result.error.issues) {
      setNested(errors, issue.path, {
        type: issue.code ?? 'invalid',
        message: issue.message,
        ref: undefined,
      })
    }

    return { values: {}, errors: errors as FieldErrors<Values> }
  }
}

export { pathOf }
