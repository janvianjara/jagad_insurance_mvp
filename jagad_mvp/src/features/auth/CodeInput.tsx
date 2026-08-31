import { useRef } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { useField } from '../../ui/form'
import { CODE_LENGTH, digitsOf } from './two-factor'
import styles from './auth.module.css'

/**
 * The code with one position written or cleared.
 *
 * The value is a compact string of digits — six boxes with a hole in the middle
 * is not a code anybody can submit, so a digit typed past the end lands at the
 * end and a cleared digit closes up behind it.
 */
function withDigitAt(value: string, index: number, digit: string): string {
  const slots = value.split('')
  const at = Math.min(index, slots.length)

  if (digit === '') {
    slots.splice(at, 1)
    return slots.join('')
  }

  slots[at] = digit
  return slots.join('').slice(0, CODE_LENGTH)
}

/**
 * Six boxes, one code.
 *
 * Six inputs rather than one because a person reading a code off a phone types
 * it in bursts and needs to see where they are — but six inputs are only usable
 * if every keyboard habit works, so all of them do: a digit advances, backspace
 * on an empty box goes back and clears the one behind it, the arrows and
 * Home/End move without editing, and pasting the whole code anywhere in the row
 * fills the row. `autocomplete="one-time-code"` lets the platform offer it.
 *
 * The group reads its label, its error and its invalid flag from the surrounding
 * `<Field>` through field context, so the boxes cannot end up unlabelled and the
 * error is announced against them rather than floating beside them.
 */
export function CodeInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const field = useField()
  const boxes = useRef<(HTMLInputElement | null)[]>([])

  function focusAt(index: number) {
    const next = boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]
    next?.focus()
    next?.select()
  }

  function change(index: number, raw: string) {
    const typed = digitsOf(raw)

    // More than one digit in one box means a paste the browser routed here.
    if (typed.length > 1) {
      onChange(digitsOf(value.slice(0, index) + typed))
      focusAt(index + typed.length)
      return
    }

    onChange(digitsOf(withDigitAt(value, index, typed)))
    if (typed !== '') focusAt(index + 1)
  }

  function keyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      if ((value[index] ?? '') === '' && index > 0) {
        event.preventDefault()
        onChange(digitsOf(withDigitAt(value, index - 1, '')))
        focusAt(index - 1)
      }
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusAt(index - 1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusAt(index + 1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      focusAt(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      focusAt(CODE_LENGTH - 1)
    }
  }

  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = digitsOf(event.clipboardData.getData('text'))
    if (pasted === '') return
    event.preventDefault()
    onChange(pasted)
    focusAt(pasted.length)
  }

  return (
    <div
      className={styles.code}
      role="group"
      aria-labelledby={field?.labelId}
      aria-describedby={field?.errorId}
    >
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            boxes.current[index] = node
          }}
          className={styles.digit}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
          aria-invalid={field?.invalid ? 'true' : undefined}
          value={value[index] ?? ''}
          onChange={(event) => change(index, event.target.value)}
          onKeyDown={(event) => keyDown(index, event)}
          onPaste={paste}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  )
}
