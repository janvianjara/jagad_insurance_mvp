/**
 * One field of a schema, rendered.
 *
 * The whole file is a switch on `kind`, and that is the point: adding a field
 * type to the product means adding a case here and a case in the domain's
 * validator, not writing another form. Nothing in this file knows what a policy
 * is, what a vehicle is or what KYC means.
 *
 * Two cases are not free choices:
 *
 *   - `money` renders `<RecordOnlyAmount>`, never an `<Input>` with a number in
 *     it. There is no other way for an amount to enter this product (D3).
 *   - `rollup` renders `<RollUp>`, read-only, and is never registered as a form
 *     value at all — a derived figure is not something anybody submits.
 */
import { useController } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import {
  CascadeSelect,
  Checkbox,
  DatePicker,
  Field,
  FieldError,
  FileDrop,
  Input,
  NumberInput,
  Select,
  Textarea,
} from '../../ui/form'
import { RecordOnlyAmount, RollUp } from '../guardrails'
import type { RollUpComponent } from '../guardrails'
import { isGroupField, isRollUpField, readMoney } from '../../domain/forms'
import type {
  FieldOption,
  FormFieldDef,
  FormValues,
  LeafFieldDef,
  RollUpFieldDef,
} from '../../domain/forms'
import type { Money } from '../../domain/money'
import { RepeatingGroupField } from './RepeatingGroupField'
import styles from './SchemaForm.module.css'

export type MasterOptions = Readonly<Record<string, readonly FieldOption[]>>

export type SchemaFieldProps = {
  field: FormFieldDef
  control: Control<Record<string, unknown>>
  /** The dotted path react-hook-form knows this value by; also its control id. */
  name: string
  /** Every value in scope, for the roll-up to read its typed components from. */
  values: FormValues
  /** Field key to label, so a roll-up prints its components by their names. */
  labels: Readonly<Record<string, string>>
  masterOptions?: MasterOptions
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((part): part is string => typeof part === 'string') : []
}

function fileList(value: unknown): readonly File[] {
  return Array.isArray(value) ? value.filter((item): item is File => item instanceof File) : []
}

function optionsFor(field: LeafFieldDef, masters?: MasterOptions): readonly FieldOption[] {
  if (field.options !== undefined) return field.options
  if (field.masterTypeId !== null) return masters?.[field.masterTypeId] ?? []
  return []
}

/**
 * The derived block. Components that have not been typed yet are named rather
 * than counted as zero: a Net that quietly assumed an unrecorded figure was
 * nothing would be the platform asserting a total nobody gave it.
 */
function RollUpBlock({
  field,
  values,
  labels,
}: {
  field: RollUpFieldDef
  values: FormValues
  labels: Readonly<Record<string, string>>
}) {
  const components: RollUpComponent[] = []
  const unrecorded: string[] = []

  for (const key of field.components) {
    const amount = readMoney(values[key])
    if (amount === null) {
      unrecorded.push(labels[key] ?? key)
      continue
    }
    components.push({ key, label: labels[key] ?? key, amount })
  }

  const note =
    unrecorded.length === 0
      ? undefined
      : `Net and Final are derived from the figures above, and cannot be typed. Not yet recorded: ${unrecorded.join(', ')}.`

  return (
    <div className={styles.rollUpField} data-field={field.key}>
      <span className={styles.rollUpLabel}>{field.label}</span>
      <RollUp
        components={components}
        gst={field.gstField === null ? null : readMoney(values[field.gstField])}
        note={note}
      />
    </div>
  )
}

export function SchemaField({
  field,
  control,
  name,
  values,
  labels,
  masterOptions,
}: SchemaFieldProps) {
  if (isRollUpField(field)) return <RollUpBlock field={field} values={values} labels={labels} />

  if (isGroupField(field)) {
    return (
      <RepeatingGroupField
        group={field}
        control={control}
        name={name}
        values={values}
        labels={labels}
        masterOptions={masterOptions}
      />
    )
  }

  return (
    <LeafField
      field={field}
      control={control}
      name={name}
      masterOptions={masterOptions}
    />
  )
}

type LeafFieldProps = {
  field: LeafFieldDef
  control: Control<Record<string, unknown>>
  name: string
  masterOptions?: MasterOptions
}

function LeafField({ field, control, name, masterOptions }: LeafFieldProps) {
  const { field: entry, fieldState } = useController({ control, name })
  // `entry.ref` is deliberately not passed on. It exists so react-hook-form can
  // focus a field it failed; these controls are fully controlled and the
  // missing-field summary focuses by id, so wiring the ref would buy nothing
  // and would mean reading a ref during render.
  const error = fieldState.error?.message
  const value = entry.value

  const common = {
    label: field.label,
    id: name,
    hint: field.hint,
    error,
    required: field.required,
  }

  switch (field.kind) {
    case 'money':
      // No `<Input type="number">` here, ever. The amount control is the only
      // way money enters, and it has no default, no placeholder and no formula.
      return (
        <RecordOnlyAmount
          label={field.label}
          id={name}
          name={name}
          hint={field.hint}
          error={error}
          required={field.required}
          value={readMoney(value as Money | null)}
          onValueChange={entry.onChange}
        />
      )

    case 'textarea':
      return (
        <Field {...common}>
          <Textarea
            name={name}
            value={text(value)}
            onChange={(event) => entry.onChange(event.target.value)}
            onBlur={entry.onBlur}
            rows={3}
          />
        </Field>
      )

    case 'number':
      return (
        <Field {...common}>
          <NumberInput
            name={name}
            value={typeof value === 'number' ? value : null}
            onValueChange={entry.onChange}
            onBlur={entry.onBlur}
            min={field.min}
            max={field.max}
          />
        </Field>
      )

    case 'date':
      return (
        <Field {...common}>
          <DatePicker
            name={name}
            value={text(value)}
            onChange={(event) => entry.onChange(event.target.value)}
            onBlur={entry.onBlur}
          />
        </Field>
      )

    case 'select':
      return (
        <Field {...common}>
          <Select
            name={name}
            options={optionsFor(field, masterOptions)}
            value={text(value)}
            onChange={(event) => entry.onChange(event.target.value)}
            onBlur={entry.onBlur}
          />
        </Field>
      )

    case 'cascade':
      return (
        <Field {...common} control="group">
          <CascadeSelect
            nodes={field.cascade?.nodes ?? []}
            levels={field.cascade?.levels ?? []}
            value={stringList(value)}
            onValueChange={entry.onChange}
          />
        </Field>
      )

    case 'boolean':
      // A checkbox rather than a toggle: nothing here takes effect until the
      // form is submitted, and a switch that looks immediate would lie.
      return (
        <div className={styles.checkboxField}>
          <Checkbox
            id={name}
            name={name}
            label={field.label}
            description={field.hint}
            checked={value === true}
            onChange={(event) => entry.onChange(event.target.checked)}
            onBlur={entry.onBlur}
            invalid={error !== undefined}
            required={field.required}
          />
          <FieldError>{error}</FieldError>
        </div>
      )

    case 'file':
      return (
        <Field {...common} control="group">
          <FileDrop
            id={name}
            accept={field.accept}
            multiple={field.multiple}
            files={fileList(value)}
            onFiles={(files) => entry.onChange(field.multiple === true ? files : files.slice(0, 1))}
          />
        </Field>
      )

    default:
      return (
        <Field {...common}>
          <Input
            name={name}
            value={text(value)}
            onChange={(event) => entry.onChange(event.target.value)}
            onBlur={entry.onBlur}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
          />
        </Field>
      )
  }
}
