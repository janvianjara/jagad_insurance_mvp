import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useControlAria } from './field-context'
import { cx } from './cx'
import base from './controls.module.css'
import styles from './Combobox.module.css'

export type ComboboxOption = {
  value: string
  label: string
  /** Secondary text on the right of the row — a code, a city, a count. */
  hint?: string
  disabled?: boolean
}

export type ComboboxProps = {
  options: readonly ComboboxOption[]
  value?: string | null
  onValueChange?: (value: string | null) => void
  placeholder?: string
  /** Shown when the typed text matches nothing. */
  emptyText?: string
  name?: string
  id?: string
  invalid?: boolean
  required?: boolean
  disabled?: boolean
  /** Names the control when it is used outside a `<Field>`. */
  'aria-label'?: string
  className?: string
}

/**
 * Single select from a long list — insurer, product, agent, branch.
 *
 * Uses the ARIA 1.2 combobox pattern: the text field owns the focus throughout
 * and the active option is announced through `aria-activedescendant`, so the
 * caret never leaves the field and typing stays continuous.
 */
export function Combobox({
  options,
  value = null,
  onValueChange,
  placeholder,
  emptyText = 'No match',
  name,
  id,
  invalid,
  required,
  disabled,
  'aria-label': ariaLabel,
  className,
}: ComboboxProps) {
  const generated = useId()
  const wiring = useControlAria({ id, invalid, required, disabled })
  const listId = `${generated}-list`

  const [open, setOpen] = useState(false)
  /** null means "showing the chosen option"; a string means the person is typing. */
  const [query, setQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const selected = options.find((option) => option.value === value) ?? null
  const display = query ?? selected?.label ?? ''
  const needle = (query ?? '').trim().toLowerCase()
  const matches =
    needle === ''
      ? options
      : options.filter(
          (option) =>
            option.label.toLowerCase().includes(needle) ||
            (option.hint ?? '').toLowerCase().includes(needle),
        )

  function close() {
    setOpen(false)
    setQuery(null)
  }

  function choose(index: number) {
    const option = matches[index]
    if (!option || option.disabled) return
    onValueChange?.(option.value)
    close()
  }

  function move(delta: number) {
    if (matches.length === 0) return
    const next = (activeIndex + delta + matches.length) % matches.length
    setActiveIndex(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(0)
        return
      }
      move(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault()
      choose(activeIndex)
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
    }
  }

  return (
    <div className={cx(styles.root, className)}>
      <span
        className={base.control}
        data-invalid={wiring.invalid || undefined}
        data-disabled={wiring.disabled || undefined}
      >
        <input
          type="text"
          role="combobox"
          className={base.input}
          autoComplete="off"
          name={name}
          value={display}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          onBlur={close}
          {...wiring.props}
        />
        <span className={base.chevron} aria-hidden="true" />
      </span>
      {open ? (
        <ul
          className={styles.list}
          id={listId}
          role="listbox"
          // Keeping focus in the text field: a mousedown that moved focus would
          // blur the input and close the list before the click ever landed.
          onMouseDown={(event) => event.preventDefault()}
        >
          {matches.length === 0 ? (
            <li className={styles.empty}>{emptyText}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                className={styles.option}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                data-active={index === activeIndex || undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.hint ? <span className={styles.optionHint}>{option.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
