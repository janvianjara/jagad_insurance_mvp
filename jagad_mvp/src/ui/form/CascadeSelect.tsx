import { useId } from 'react'
import { Select } from './Select'
import type { SelectOption } from './Select'
import { useField } from './field-context'
import { cx } from './cx'
import styles from './CascadeSelect.module.css'

export type CascadeNode = {
  value: string
  label: string
  children?: readonly CascadeNode[]
}

export type CascadeSelectProps = {
  nodes: readonly CascadeNode[]
  /** One caption per level, e.g. ["Company", "Product", "Plan"]. */
  levels: readonly string[]
  /** The chosen path, outermost first. A short path means the rest is unchosen. */
  value?: readonly string[]
  onValueChange?: (path: string[]) => void
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}

function childrenAt(nodes: readonly CascadeNode[], path: readonly string[]): readonly CascadeNode[] {
  let level = nodes
  for (const step of path) {
    const node = level.find((candidate) => candidate.value === step)
    if (!node?.children) return []
    level = node.children
  }
  return level
}

function toOptions(nodes: readonly CascadeNode[]): SelectOption[] {
  return nodes.map((node) => ({ value: node.value, label: node.label }))
}

/**
 * A choice made in dependent steps — company then product then plan, or
 * category then sub-category.
 *
 * Picking at one level truncates everything below it, because a product that
 * belonged to the previous company is not a product of this one.
 */
export function CascadeSelect({
  nodes,
  levels,
  value = [],
  onValueChange,
  placeholder = 'Select',
  invalid,
  disabled,
  className,
}: CascadeSelectProps) {
  const generated = useId()
  const field = useField()

  function handleChange(index: number, next: string) {
    const path = value.slice(0, index)
    onValueChange?.(next === '' ? [...path] : [...path, next])
  }

  return (
    <div className={cx(styles.group, className)} role="group" aria-labelledby={field?.labelId}>
      {levels.map((levelLabel, index) => {
        const options = childrenAt(nodes, value.slice(0, index))
        const locked = index > 0 && value.length < index
        // The first level answers to the field's label; the rest name themselves.
        const controlId = index === 0 ? (field?.controlId ?? `${generated}-0`) : `${generated}-${index}`

        return (
          <div key={levelLabel} className={styles.level} data-locked={locked || undefined}>
            <label className={styles.levelLabel} htmlFor={controlId}>
              {levelLabel}
            </label>
            <Select
              id={controlId}
              options={toOptions(options)}
              placeholder={placeholder}
              value={value[index] ?? ''}
              invalid={invalid}
              disabled={disabled || locked || options.length === 0}
              onChange={(event) => handleChange(index, event.target.value)}
            />
          </div>
        )
      })}
    </div>
  )
}
