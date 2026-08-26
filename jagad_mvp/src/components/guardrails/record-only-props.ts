/**
 * The prop surface of `<RecordOnlyAmount>`, as data.
 *
 * "The component has no auto-fill API" is a claim, and a claim nobody can run is
 * a comment. This module turns it into something the test suite executes: the
 * literal below is checked against `keyof RecordOnlyAmountProps` with `satisfies`,
 * which fails to compile if a prop is missing from it AND fails to compile if a
 * name here is not a real prop. The list therefore cannot drift from the type.
 *
 * `record-only-amount.test.tsx` then asserts that no name in it matches the
 * vocabulary of computation — default, suggest, calculate, derive, estimate,
 * prefill, total. Adding `defaultValue` to the component means adding it here,
 * which turns that test red. That is the trap, and it is the point (D3).
 */
import type { RecordOnlyAmountProps } from './RecordOnlyAmount'

const PROP_SURFACE = {
  label: true,
  value: true,
  onValueChange: true,
  currency: true,
  id: true,
  name: true,
  hint: true,
  error: true,
  required: true,
  disabled: true,
  className: true,
} satisfies Record<keyof RecordOnlyAmountProps, true>

export const RECORD_ONLY_AMOUNT_PROPS = Object.keys(PROP_SURFACE) as Array<
  keyof RecordOnlyAmountProps
>
