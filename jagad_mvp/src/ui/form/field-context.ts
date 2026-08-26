/**
 * The wiring a `<Field>` hands down to whatever control sits inside it.
 *
 * A control never has to be told its own id, its error id or whether the field
 * is required: it reads them here. That is what keeps every input labelled and
 * described without the caller repeating four props at every call site.
 *
 * Lives in a `.ts` file of its own because a module that exports a context
 * cannot also export a component (fast refresh, lint-enforced).
 */
import { createContext, useContext } from 'react'

export type FieldContextValue = {
  /** Id of the control the field's label points at. */
  controlId: string
  /** Id of the label element, for controls that are a group rather than an input. */
  labelId: string
  /** Id of the hint paragraph, when there is one. */
  hintId?: string
  /** Id of the error paragraph, when the field is in error. */
  errorId?: string
  invalid: boolean
  required: boolean
  disabled: boolean
}

export const FieldContext = createContext<FieldContextValue | null>(null)

/** The surrounding field, or null when a control is used on its own. */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext)
}

export type ControlOwnProps = {
  id?: string
  describedBy?: string
  invalid?: boolean
  required?: boolean
  disabled?: boolean
}

export type ControlWiring = {
  invalid: boolean
  disabled: boolean
  props: {
    id?: string
    required?: boolean
    disabled?: boolean
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }
}

/**
 * Merges a control's own props with the field around it. Props passed directly
 * to the control win; anything left unsaid falls back to the field.
 */
export function useControlAria(own: ControlOwnProps = {}): ControlWiring {
  const field = useField()

  const id = own.id ?? field?.controlId
  const invalid = own.invalid ?? field?.invalid ?? false
  const required = own.required ?? field?.required ?? false
  const disabled = own.disabled ?? field?.disabled ?? false

  const described = [own.describedBy, field?.hintId, field?.errorId].filter(Boolean).join(' ')

  return {
    invalid,
    disabled,
    props: {
      id,
      required: required || undefined,
      disabled: disabled || undefined,
      'aria-describedby': described === '' ? undefined : described,
      'aria-invalid': invalid || undefined,
    },
  }
}
