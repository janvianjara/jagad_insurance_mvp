import { useId, useReducer } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Icon } from '../../ui/Icon'
import {
  EMPTY_REGISTRY,
  OcrFormContext,
  ocrRegistryReducer,
  unconfirmedNames,
  useOcrForm,
} from './ocr-context'
import type { OcrFormApi } from './ocr-context'
import { cx } from './cx'
import styles from './OcrFormProvider.module.css'

export type OcrFormProviderProps = {
  children: ReactNode
  /** Runs only when every extraction inside the form has been confirmed. */
  onSubmit: () => void
  className?: string
}

/**
 * The hard half of FR-16: a form containing an unconfirmed extraction cannot
 * submit.
 *
 * The refusal lives on the form's own submit handler, not only on the button's
 * disabled attribute. A disabled button is a hint — Enter in a text field, a
 * `requestSubmit()` from elsewhere, or a future screen that forgets to use
 * `<OcrSubmit>` would all walk straight past it. Refusing in the handler means
 * the block holds however the submit arrives.
 */
export function OcrFormProvider({ children, onSubmit, className }: OcrFormProviderProps) {
  const [registry, notify] = useReducer(ocrRegistryReducer, EMPTY_REGISTRY)

  const unconfirmed = unconfirmedNames(registry)
  const api: OcrFormApi = { notify, unconfirmed, canSubmit: unconfirmed.length === 0 }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!api.canSubmit) return
    onSubmit()
  }

  return (
    <OcrFormContext value={api}>
      <form className={cx(styles.form, className)} onSubmit={handleSubmit} noValidate>
        {children}
      </form>
    </OcrFormContext>
  )
}

export type OcrSubmitProps = {
  children: ReactNode
  /** Blocks the submit for the caller's own reasons, on top of the OCR block. */
  disabled?: boolean
  className?: string
}

function blockedMessage(count: number): string {
  const noun = count === 1 ? 'extracted value needs' : 'extracted values need'
  return `${count} ${noun} confirming before this can be saved.`
}

/**
 * The form's submit control, and the visible half of the block: it says how many
 * extractions are still waiting rather than leaving a dead button on the screen.
 */
export function OcrSubmit({ children, disabled = false, className }: OcrSubmitProps) {
  const form = useOcrForm()
  const messageId = useId()

  const waiting = form?.unconfirmed.length ?? 0
  const blocked = waiting > 0

  return (
    <div className={cx(styles.submitRow, className)}>
      {blocked ? (
        <p className={styles.blocked} id={messageId} role="status">
          <Icon name="alert" size="sm" />
          {blockedMessage(waiting)}
        </p>
      ) : null}
      <button
        type="submit"
        className={styles.submit}
        disabled={disabled || blocked}
        aria-describedby={blocked ? messageId : undefined}
      >
        {children}
      </button>
    </div>
  )
}
