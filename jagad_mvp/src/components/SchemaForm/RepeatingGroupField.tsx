/**
 * A repeating group — the LI cashflow table, the riders, the covered members.
 *
 * Rows are held by react-hook-form's `useFieldArray` (v7.86), so each row's
 * fields are ordinary registered values at `group.0.premiumDue` and the zod
 * schema generated in the domain validates them at exactly that path.
 *
 * Two behaviours worth naming:
 *
 *   - a row's conditions read that ROW, not the form. Two rows of the same
 *     group can legitimately show different fields, which is what makes a
 *     "declaration made" tick per member work.
 *   - removing a row is a plain button and not a `<ConfirmGate>`: nothing has
 *     left the building yet. The gate belongs on the submit that follows, and
 *     the draft in localStorage means a mis-click is recoverable.
 */
import { useFieldArray } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import { Button } from '../../ui/Button'
import { FormRow } from '../../ui/form'
import { emptyRow, isFieldVisible } from '../../domain/forms'
import type { FormRow as RowValues, FormValues, GroupFieldDef } from '../../domain/forms'
import { SchemaField } from './SchemaField'
import type { MasterOptions } from './SchemaField'
import styles from './SchemaForm.module.css'

export type RepeatingGroupFieldProps = {
  group: GroupFieldDef
  control: Control<Record<string, unknown>>
  name: string
  values: FormValues
  labels: Readonly<Record<string, string>>
  masterOptions?: MasterOptions
}

function rowValuesAt(values: FormValues, name: string, index: number): RowValues {
  const rows = values[name]
  if (!Array.isArray(rows)) return {}
  const row = rows[index]
  return typeof row === 'object' && row !== null ? (row as RowValues) : {}
}

/**
 * The array view of a control that is otherwise a bag of loose values.
 *
 * `useFieldArray` needs a values type whose paths are arrays, and the form's is
 * deliberately open (`Record<string, unknown>`) because a schema decides its own
 * shape at runtime. This is that same control, read as rows — the one cast in
 * the engine, and it buys the whole repeating-group feature.
 */
type RowArrayControl = Control<Record<string, Record<string, unknown>[]>>

export function RepeatingGroupField({
  group,
  control,
  name,
  values,
  labels,
  masterOptions,
}: RepeatingGroupFieldProps) {
  const array = useFieldArray({ control: control as unknown as RowArrayControl, name })
  const rowLabel = group.rowLabel ?? group.label
  const atMaximum = group.maxRows !== undefined && array.fields.length >= group.maxRows

  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupLegend}>
        {group.label}
        {group.required ? <span className={styles.required}>required</span> : null}
      </legend>
      {group.hint ? <p className={styles.groupHint}>{group.hint}</p> : null}

      {array.fields.length === 0 ? (
        <p className={styles.groupEmpty}>No rows recorded yet.</p>
      ) : null}

      {array.fields.map((row, index) => {
        const rowValues = rowValuesAt(values, name, index)

        return (
          <div className={styles.groupRow} key={row.id} data-row={index}>
            <div className={styles.groupRowHead}>
              <span className={styles.groupRowTitle}>{`${rowLabel} ${index + 1}`}</span>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                icon="close"
                label={`Remove ${rowLabel} ${index + 1}`}
                onClick={() => array.remove(index)}
              />
            </div>
            <FormRow columns={2}>
              {group.fields
                .filter((child) => isFieldVisible(child, rowValues as FormValues))
                .map((child) => (
                  <SchemaField
                    key={child.key}
                    field={child}
                    control={control}
                    name={`${name}.${index}.${child.key}`}
                    values={rowValues as FormValues}
                    labels={labels}
                    masterOptions={masterOptions}
                  />
                ))}
            </FormRow>
          </div>
        )
      })}

      <div className={styles.groupActions}>
        <Button
          type="button"
          variant="quiet"
          size="sm"
          icon="plus"
          disabled={atMaximum}
          onClick={() => array.append({ ...emptyRow(group.fields) })}
        >
          {group.addLabel ?? `Add a ${rowLabel.toLowerCase()}`}
        </Button>
        {atMaximum ? (
          <span className={styles.groupNote}>{`At most ${group.maxRows} rows.`}</span>
        ) : null}
      </div>
    </fieldset>
  )
}
