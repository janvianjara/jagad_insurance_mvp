import type { ReactNode } from 'react'
import { MASK_CHAR, MaskedValue } from '../../ui/type'
import type { MaskKind } from '../../ui/type'
import styles from './MaskedField.module.css'

/** Aadhaar is twelve digits; the record holds four of them. */
const AADHAAR_LENGTH = 12
const LAST4 = 4

export type MaskedFieldProps = {
  label: ReactNode
  /**
   * The last four digits — which is the most this platform ever stores for an
   * Aadhaar. Anything longer handed in here is sliced before it can render; see
   * the note below on why that is a slice rather than an error.
   */
  last4?: string | null
  /**
   * A full identifier the component masks itself: PAN, a bank account, a phone.
   * NEVER an Aadhaar — the platform has no full Aadhaar to pass.
   */
  value?: string | null
  kind?: MaskKind
  /** One line under the value: where it came from, or why only four digits exist. */
  note?: ReactNode
  absentText?: string
  className?: string
}

/**
 * A labelled identifier the staff UI is only allowed to see the tail of.
 *
 * `<MaskedValue>` already guarantees that a full string handed to it renders as
 * its last four characters and nothing else. What this composite adds is the
 * Aadhaar half of the constitution's rule, which is a different shape of
 * problem: the platform never holds a full Aadhaar at all, so the value on hand
 * is already four digits, and rendering "4102" on its own reads like a whole
 * number rather than the tail of one. The field therefore pads to Aadhaar's real
 * width with mask characters before masking — the person sees
 * `•••• •••• 4102`, which says both what is known and what is deliberately not.
 *
 * `last4` is sliced rather than validated on purpose. A caller that reaches this
 * component with more than four digits has already made a mistake somewhere
 * upstream, and the two candidate responses are "render the full number" or
 * "render four digits". Throwing would be a third — a blank screen in the middle
 * of a KYC file — so the component takes the tail and renders. There is no prop
 * that reveals more, and no branch in this file that could produce one.
 */
export function MaskedField({
  label,
  last4,
  value,
  kind = 'generic',
  note,
  absentText = 'not on record',
  className,
}: MaskedFieldProps) {
  const tail = typeof last4 === 'string' ? last4.replace(/\D/g, '').slice(-LAST4) : null

  // Padded to the identifier's real width so the mask reads as a masked Aadhaar
  // rather than as a four-character value that happens to be short.
  const shown =
    tail !== null && tail !== ''
      ? `${MASK_CHAR.repeat(AADHAAR_LENGTH - tail.length)}${tail}`
      : (value ?? null)

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')} data-masked-field="">
      <span className={styles.label}>{label}</span>
      <MaskedValue
        value={shown}
        kind={tail !== null && tail !== '' ? 'aadhaar' : kind}
        absentText={absentText}
        className={styles.value}
      />
      {note ? <span className={styles.note}>{note}</span> : null}
    </div>
  )
}
