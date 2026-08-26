import { useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { Field, Input } from '../../ui/form'
import type { Currency, Money } from '../../domain/money'
import { amountDraft, isAmountDraft, parseAmountDraft, sameAmount } from './amount-entry'
import styles from './RecordOnlyAmount.module.css'

/**
 * The props, in full. Read this list as the guarantee it is: there is no
 * `defaultValue`, no `suggestedValue`, no `calculateFrom`, no `formula`. A PR
 * that computes a premium has nowhere to put the number, which is the whole
 * mechanism — `record-only-props.ts` mirrors these names under a `satisfies`
 * check and `record-only-amount.test.tsx` fails the build if a computed path
 * ever appears here.
 */
export type RecordOnlyAmountProps = {
  label: ReactNode
  /** What has been recorded so far. `null` is unrecorded, which is not zero. */
  value: Money | null
  /** Fires on every keystroke with what the person has typed, never with a result. */
  onValueChange: (value: Money | null) => void
  currency?: Currency
  /** Supply when the control needs a stable id, e.g. a schema field key. */
  id?: string
  name?: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  disabled?: boolean
  className?: string
}

/**
 * The placeholder is a constant, not a prop.
 *
 * A caller-supplied placeholder is an auto-fill path wearing a disguise: it puts
 * a figure in front of the user that the system chose. The prototype's affordance
 * is an instruction, and it stays one.
 */
const AFFORDANCE = 'Type the figure'

const CURRENCY_MARK: Record<Currency, string> = { INR: '₹' }

/**
 * D3 made physical: the platform records money, it never calculates it.
 *
 * The final premium, the settlement, the refund and the endorsement delta are
 * all figures a person reads off an insurer's document and types. This control
 * exists so that there is exactly one way an amount enters the system, and so
 * that way has no seam a computation could be threaded through.
 *
 * Roll-ups are the other component in this file's pair, `<RollUp>`: Net is the
 * sum of typed components and Final is Net plus a typed GST figure. That is the
 * only arithmetic the product allows, and it renders as read-only derived text
 * so no one can mistake it for something that was entered.
 */
export function RecordOnlyAmount({
  label,
  value,
  onValueChange,
  currency = 'INR',
  id,
  name,
  hint,
  error,
  required = false,
  disabled = false,
  className,
}: RecordOnlyAmountProps) {
  // The draft is the keystrokes; the value is the record. They differ only while
  // a figure is half-typed ("1204."), which is why the control cannot simply
  // print the value back on every render.
  const [draft, setDraft] = useState(() => amountDraft(value))
  const [recorded, setRecorded] = useState<Money | null>(value)

  if (!sameAmount(recorded, value)) {
    // The amount changed from outside — a draft reload, a reset. Adopt it, unless
    // it is merely the echo of what is already in the control.
    setRecorded(value)
    if (!sameAmount(parseAmountDraft(draft, currency), value)) setDraft(amountDraft(value))
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value.trim()
    // Refuse the keystroke rather than silently repairing it: a rejected letter
    // is honest, a "corrected" amount is a change nobody made.
    if (!isAmountDraft(next)) return

    const typed = parseAmountDraft(next, currency)
    setDraft(next)
    setRecorded(typed)
    onValueChange(typed)
  }

  return (
    <Field
      label={label}
      id={id}
      hint={hint}
      error={error}
      required={required}
      disabled={disabled}
      className={className}
    >
      <Input
        mono
        name={name}
        value={draft}
        onChange={handleChange}
        placeholder={AFFORDANCE}
        inputMode="decimal"
        autoComplete="off"
        className={styles.entry}
        leading={<span className={styles.mark}>{CURRENCY_MARK[currency]}</span>}
      />
    </Field>
  )
}
