import { useRef, useState } from 'react'
import { Button } from '../../../ui/Button'
import { Field, Input } from '../../../ui/form'
import { useConfigStore } from './config-store'
import type { ConfigMasterValue } from './config-types'
import { useEnsureConfig, useMasterOptions } from './use-config'
import styles from './InlineMasterAdd.module.css'

export type InlineMasterAddProps = {
  /** The master's key — `inquiry_source`, `city`, `vehicle_model`. */
  masterTypeKey: string
  /** Required when the master cascades: the Make a new Model belongs to. */
  parentValueId?: string | null
  /** The new value, once it exists. A form selects it here without navigating. */
  onAdded?: (value: ConfigMasterValue) => void
  /** Overrides the collapsed button's wording. */
  label?: string
  disabled?: boolean
  className?: string
}

/**
 * FR-02.2 — add a master value without leaving the form.
 *
 * The requirement is small and the reason it exists is not: a person filling in
 * a policy at four in the afternoon meets a dropdown missing the one option they
 * need, and every second of that detour is a half-typed form they are afraid to
 * lose. So this never navigates, never opens a modal over the work, and never
 * unmounts the form around it. It expands one row, takes a name, writes the
 * value through the same store the masters screen edits, and hands it straight
 * back to the field that asked.
 *
 * Three refusals are deliberate:
 *   - a platform master (`editable: false`) offers no inline add at all — the
 *     product's own logic reads those by key;
 *   - a cascading master with no parent chosen says which parent to choose
 *     first, rather than adding an orphan;
 *   - a duplicate name is refused by the store and reported here, because two
 *     values with the same key would make every record holding it ambiguous.
 */
export function InlineMasterAdd({
  masterTypeKey,
  parentValueId,
  onAdded,
  label,
  disabled,
  className,
}: InlineMasterAddProps) {
  useEnsureConfig()

  const { type, parentType } = useMasterOptions(masterTypeKey, parentValueId)
  const addMasterValue = useConfigStore((state) => state.addMasterValue)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  if (!type) return null

  const needsParent = parentType !== null && !parentValueId

  if (!type.editable) {
    return (
      <p className={[styles.note, className].filter(Boolean).join(' ')}>
        {type.label} is a platform master, so its values are fixed.
      </p>
    )
  }

  function close(returnFocus: boolean) {
    setOpen(false)
    setDraft('')
    setError(null)
    if (returnFocus) triggerRef.current?.focus()
  }

  function submit() {
    const name = draft.trim()
    if (name === '') {
      setError('Give the new value a name.')
      return
    }
    if (!type) return

    const created = addMasterValue({
      masterTypeId: type.id,
      label: name,
      parentValueId: parentValueId ?? null,
    })

    if (!created) {
      setError(`"${name}" is already a ${type.label.toLowerCase()}.`)
      return
    }

    onAdded?.(created)
    close(true)
  }

  if (!open) {
    return (
      <Button
        ref={triggerRef}
        type="button"
        variant="quiet"
        size="sm"
        icon="plus"
        disabled={disabled || needsParent}
        className={className}
        onClick={() => setOpen(true)}
      >
        {label ?? `Add ${type.label.toLowerCase()}`}
        {needsParent && parentType ? ` — choose a ${parentType.label.toLowerCase()} first` : ''}
      </Button>
    )
  }

  return (
    <div className={[styles.row, className].filter(Boolean).join(' ')}>
      <Field
        label={`New ${type.label.toLowerCase()}`}
        error={error}
        className={styles.field}
        required
      >
        <Input
          autoFocus
          value={draft}
          invalid={error !== null}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // The form around this one must not submit because a master was
              // added inside it.
              event.preventDefault()
              submit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close(true)
            }
          }}
        />
      </Field>

      <div className={styles.actions}>
        <Button type="button" variant="quiet" size="sm" onClick={() => close(true)}>
          Cancel
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={submit}>
          Add
        </Button>
      </div>
    </div>
  )
}
