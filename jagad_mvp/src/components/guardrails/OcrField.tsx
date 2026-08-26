import { useEffect, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { Field, Input } from '../../ui/form'
import { Icon } from '../../ui/Icon'
import { useOcrForm } from './ocr-context'
import { readOcrState } from './ocr-state'
import type { OcrExtraction, OcrFieldState } from './ocr-state'
import { cx } from './cx'
import styles from './OcrField.module.css'

export type OcrFieldProps = {
  /** Unique within the form; it is how the form tracks whether this one is confirmed. */
  name: string
  label: ReactNode
  extraction: OcrExtraction
  hint?: ReactNode
  disabled?: boolean
  /** Fires on each human act — an edit or a confirmation — never on mount. */
  onChange?: (state: OcrFieldState) => void
  className?: string
}

const PERCENT = 100

/**
 * FR-16 / charter U10 made physical: an extraction never silent-commits.
 *
 * The extracted value is shown, and shown in the control, because retyping what
 * the machine already read correctly is the waste OCR exists to remove. What it
 * is not is accepted. Until a person presses Confirm the field is flagged in
 * lime — the charter's "needs a person" colour, which is not an error colour —
 * and `<OcrFormProvider>` refuses to submit the form around it.
 *
 * Editing withdraws confirmation rather than granting it: typing over a read is
 * a correction, and a correction still wants a second look. The original read is
 * kept and displayed either way, because when a policy number is later disputed
 * the question asked is what the document actually said.
 */
export function OcrField({
  name,
  label,
  extraction,
  hint,
  disabled = false,
  onChange,
  className,
}: OcrFieldProps) {
  const [value, setValue] = useState(extraction.value)
  const [confirmed, setConfirmed] = useState(false)

  const form = useOcrForm()
  const notify = form?.notify

  const state = readOcrState(value, extraction.value, confirmed)
  const confidence = Math.round(extraction.confidence * PERCENT)

  // `notify` is a reducer dispatch, so its identity is stable and this runs only
  // when the confirmation actually changes.
  useEffect(() => {
    notify?.({ kind: 'report', name, confirmed })
  }, [notify, name, confirmed])

  useEffect(() => {
    if (notify === undefined) return
    return () => notify({ kind: 'release', name })
  }, [notify, name])

  function report(nextValue: string, nextConfirmed: boolean) {
    onChange?.({
      name,
      state: readOcrState(nextValue, extraction.value, nextConfirmed),
      value: nextValue,
      extracted: extraction.value,
      confidence: extraction.confidence,
      confirmed: nextConfirmed,
    })
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setValue(next)
    setConfirmed(false)
    report(next, false)
  }

  function handleConfirm() {
    if (confirmed) return
    setConfirmed(true)
    report(value, true)
  }

  return (
    <div
      className={cx(styles.field, className)}
      data-ocr-field={name}
      data-state={state}
      data-confirmed={confirmed ? 'true' : 'false'}
      data-tone={confirmed ? 'ok' : 'attn'}
      data-extracted={extraction.value}
    >
      <Field label={label} hint={hint} disabled={disabled}>
        <Input value={value} onChange={handleChange} autoComplete="off" />
      </Field>

      <div className={styles.meta}>
        <span className={styles.flag}>
          <Icon name={confirmed ? 'check' : 'alert'} size="sm" />
          {confirmed ? 'Confirmed' : 'Extracted, needs a person'}
        </span>

        <span className={styles.confidence}>{confidence}% confidence</span>

        {confirmed ? null : (
          <button type="button" className={styles.confirm} onClick={handleConfirm} disabled={disabled}>
            Confirm
          </button>
        )}
      </div>

      {state === 'edited' ? (
        <p className={styles.original}>
          OCR read <span className={styles.originalValue}>{extraction.value}</span>
        </p>
      ) : null}
    </div>
  )
}
