/**
 * One field of a schema, as a person configures it.
 *
 * This component is where two product invariants stop being prose. Both are
 * expressed the same way — by there being no control:
 *
 *   A reserved field has no Remove button, and its key is never an input. The
 *   registry in `src/domain/forms/reserved.ts` says why the platform depends on
 *   it, and that sentence is printed here rather than paraphrased, because the
 *   person about to try is the person who needs to read it.
 *
 *   No field of any kind has a default, a prefill or a formula, because the
 *   grammar has nowhere to put one (D3). A money field carries no placeholder
 *   and no bounds either — `validateFormSchema` rejects them, on the grounds
 *   that a figure shown in an amount box is a suggestion. The only arithmetic
 *   on offer is the roll-up below: the typed components it sums, the typed GST
 *   figure it adds, and nothing else.
 */

import { Button } from '../../../ui/Button'
import { Checkbox, Field, Input, NumberInput, Select, Textarea, Toggle } from '../../../ui/form'
import type { SelectOption } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import { LEAF_FIELD_KINDS, isGroupField, isLeafField, isRollUpField } from '../../../domain/forms'
import type {
  FieldKind,
  FieldOption,
  FormFieldDef,
  GroupFieldDef,
  LeafFieldDef,
  ReservedField,
  RollUpFieldDef,
} from '../../../domain/forms'
import {
  KIND_LABELS,
  OFFERED_KINDS,
  changeKind,
  kindOptions,
  patchBase,
} from './field-kinds'
import { draftKeyFrom, equalsRule, isSimpleRule, newField, ruleSummary } from './schema-draft'
import layout from '../shared/config-layout.module.css'
import styles from './builder.module.css'

function optionLines(options: readonly FieldOption[] | undefined): string {
  return (options ?? []).map((option) => `${option.value}|${option.label}`).join('\n')
}

function parseOptionLines(text: string): readonly FieldOption[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const divider = line.indexOf('|')
      if (divider < 0) return { value: draftKeyFrom(line, []), label: line }
      return {
        value: line.slice(0, divider).trim(),
        label: line.slice(divider + 1).trim() || line.slice(0, divider).trim(),
      }
    })
}

export type FieldEditorProps = {
  field: FormFieldDef
  /** From `reservedFieldsFor` — null when the platform does not read this key. */
  reserved: ReservedField | null
  labels: Readonly<Record<string, string>>
  /** Keys a condition may read. Amounts are never among them (D3). */
  conditionSources: readonly string[]
  /** Keys of typed money leaves — the only things a roll-up may name. */
  moneyKeys: readonly string[]
  masterTypeOptions: readonly SelectOption[]
  first: boolean
  last: boolean
  onChange: (next: FormFieldDef) => void
  onRemove: () => void
  onMove: (delta: number) => void
}

export function FieldEditor({
  field,
  reserved,
  labels,
  conditionSources,
  moneyKeys,
  masterTypeOptions,
  first,
  last,
  onChange,
  onRemove,
  onMove,
}: FieldEditorProps) {
  const derived = isRollUpField(field)
  const kinds = reserved ? reserved.kinds : OFFERED_KINDS
  const rule = field.visibleWhen
  const simple = isSimpleRule(rule)

  return (
    <li
      className={styles.field}
      data-field-key={field.key}
      data-reserved={reserved ? '' : undefined}
      data-derived={derived ? '' : undefined}
    >
      <div className={styles.fieldHead}>
        <span className={styles.fieldName}>
          <span>{field.label}</span>
          <span className={layout.mono}>{field.key}</span>
          <Badge tone={derived ? 'info' : 'neutral'}>{KIND_LABELS[field.kind]}</Badge>
          {reserved ? <Badge tone="idle">Reserved</Badge> : null}
        </span>

        <span className={layout.rowActions}>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            disabled={first}
            onClick={() => onMove(-1)}
          >
            Move up
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            disabled={last}
            onClick={() => onMove(1)}
          >
            Move down
          </Button>
          {reserved ? null : (
            <Button type="button" variant="quiet" size="sm" onClick={onRemove}>
              Remove field
            </Button>
          )}
        </span>
      </div>

      {reserved ? (
        <p className={styles.locked} data-reserved-note={field.key}>
          The platform reads <code>{field.key}</code> by name, so this builder offers no way to
          remove or rename it. {reserved.because} Its kind is limited to{' '}
          {reserved.kinds.map((kind) => KIND_LABELS[kind]).join(' or ')}, because changing the
          control changes what the field means.
        </p>
      ) : null}

      <div className={styles.controls}>
        <Field label="Label" required>
          <Input
            value={field.label}
            onChange={(event) => onChange(patchBase(field, { label: event.target.value }))}
          />
        </Field>

        <Field
          label="Kind"
          hint={reserved ? 'Limited by the platform.' : undefined}
        >
          <Select
            value={field.kind}
            options={kindOptions(kinds)}
            disabled={reserved !== null && reserved.kinds.length === 1}
            onChange={(event) => onChange(changeKind(field, event.target.value as FieldKind))}
          />
        </Field>

        <Field label="Hint" hint="Shown under the control. Never a figure.">
          <Input
            value={field.hint ?? ''}
            onChange={(event) =>
              onChange(
                patchBase(field, {
                  hint: event.target.value.trim() === '' ? undefined : event.target.value,
                }),
              )
            }
          />
        </Field>

        {derived ? null : (
          <Toggle
            checked={field.required}
            label="Required"
            description="A hidden field is never counted as missing."
            onCheckedChange={(checked) => onChange(patchBase(field, { required: checked }))}
          />
        )}
      </div>

      {/* ------------------------------------------------------- branching */}
      <div className={styles.controls}>
        <Field
          label="Shown when"
          hint="Amounts are not offered: a form may not branch on money it was given (D3)."
        >
          <Select
            value={simple ? rule.field : ''}
            placeholder="Always shown"
            options={conditionSources.map((key) => ({ value: key, label: labels[key] ?? key }))}
            disabled={rule !== null && !simple}
            onChange={(event) =>
              onChange(
                patchBase(field, {
                  visibleWhen:
                    event.target.value === ''
                      ? null
                      : equalsRule(event.target.value, simple ? rule.equals : ''),
                }),
              )
            }
          />
        </Field>

        <Field label="…equals" hint="The stored value, not the label.">
          <Input
            value={simple ? rule.equals : ''}
            disabled={!simple}
            onChange={(event) =>
              simple
                ? onChange(
                    patchBase(field, { visibleWhen: equalsRule(rule.field, event.target.value) }),
                  )
                : undefined
            }
          />
        </Field>

        <p className={styles.note}>{ruleSummary(rule, labels)}</p>
      </div>

      {isRollUpField(field) ? (
        <RollUpControls field={field} labels={labels} moneyKeys={moneyKeys} onChange={onChange} />
      ) : null}

      {isGroupField(field) ? <GroupControls field={field} onChange={onChange} /> : null}

      {isLeafField(field) ? (
        <LeafControls field={field} masterTypeOptions={masterTypeOptions} onChange={onChange} />
      ) : null}
    </li>
  )
}

/* ------------------------------------------------------------- the roll-up */

/**
 * The only arithmetic the vocabulary can express, and the whole of it.
 *
 * Two controls: which typed amounts Net is the sum of, and which typed amount
 * Final adds as GST. There is no rate, no coefficient and no third operation —
 * and, more to the point, there is nowhere on this panel to write one, because
 * `RollUpFieldDef` has no property that would hold it.
 */
function RollUpControls({
  field,
  labels,
  moneyKeys,
  onChange,
}: {
  field: RollUpFieldDef
  labels: Readonly<Record<string, string>>
  moneyKeys: readonly string[]
  onChange: (next: FormFieldDef) => void
}) {
  const components = moneyKeys.filter((key) => key !== field.gstField)

  return (
    <>
      <p className={styles.derived}>
        Net is the sum of the amounts ticked below. Final is Net plus the GST figure somebody
        typed. That is the entire arithmetic a schema can express: there is no rate, no
        percentage and no formula anywhere in the grammar, so this form can never produce a
        premium nobody entered.
      </p>

      <Field label="Net is the sum of" control="group" required>
        <ul className={styles.options}>
          {components.length === 0 ? (
            <li className={styles.note}>
              No typed amount is available to sum. Add a field of kind “Amount” to this schema
              first.
            </li>
          ) : (
            components.map((key) => (
              <li key={key}>
                <Checkbox
                  label={labels[key] ?? key}
                  checked={field.components.includes(key)}
                  onChange={(event) =>
                    onChange({
                      ...field,
                      components: event.target.checked
                        ? [...field.components, key]
                        : field.components.filter((entry) => entry !== key),
                    })
                  }
                />
              </li>
            ))
          )}
        </ul>
      </Field>

      <div className={styles.controls}>
        <Field
          label="GST figure"
          hint="A typed amount. Left unset, Final stays unrecorded rather than equal to Net."
        >
          <Select
            value={field.gstField ?? ''}
            placeholder="Not recorded"
            options={moneyKeys
              .filter((key) => !field.components.includes(key))
              .map((key) => ({ value: key, label: labels[key] ?? key }))}
            onChange={(event) =>
              onChange({ ...field, gstField: event.target.value === '' ? null : event.target.value })
            }
          />
        </Field>
      </div>
    </>
  )
}

/* -------------------------------------------------------- repeating groups */

function GroupControls({
  field,
  onChange,
}: {
  field: GroupFieldDef
  onChange: (next: FormFieldDef) => void
}) {
  const childKeys = field.fields.map((child) => child.key)

  return (
    <>
      <p className={styles.note}>
        A row holds plain fields only. A roll-up inside a row would be a total across rows, and a
        cross-row total is money this platform records rather than computes.
      </p>

      <div className={styles.controls}>
        <Field label="Row heading" hint="Numbered by the renderer — “Policy year 1”.">
          <Input
            value={field.rowLabel ?? ''}
            onChange={(event) => onChange({ ...field, rowLabel: event.target.value })}
          />
        </Field>
        <Field label="Add button">
          <Input
            value={field.addLabel ?? ''}
            onChange={(event) => onChange({ ...field, addLabel: event.target.value })}
          />
        </Field>
        <Field label="Fewest rows">
          <NumberInput
            value={field.minRows ?? null}
            onValueChange={(value) => onChange({ ...field, minRows: value ?? undefined })}
          />
        </Field>
        <Field label="Most rows">
          <NumberInput
            value={field.maxRows ?? null}
            onValueChange={(value) => onChange({ ...field, maxRows: value ?? undefined })}
          />
        </Field>
      </div>

      <Field label="Fields in each row" control="group">
        <ul className={styles.children}>
          {field.fields.map((child) => (
            <li className={styles.child} key={child.key} data-child-key={child.key}>
              <Field label="Label" className={styles.wide}>
                <Input
                  value={child.label}
                  onChange={(event) =>
                    onChange({
                      ...field,
                      fields: field.fields.map((entry) =>
                        entry.key === child.key ? { ...entry, label: event.target.value } : entry,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Kind">
                <Select
                  value={child.kind}
                  options={kindOptions(
                    OFFERED_KINDS.filter(
                      (kind) => kind !== 'rollup' && kind !== 'group',
                    ),
                  )}
                  onChange={(event) =>
                    onChange({
                      ...field,
                      fields: field.fields.map((entry) =>
                        entry.key === child.key
                          ? ({
                              ...entry,
                              kind: event.target.value as LeafFieldDef['kind'],
                            } as LeafFieldDef)
                          : entry,
                      ),
                    })
                  }
                />
              </Field>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() =>
                  onChange({
                    ...field,
                    fields: field.fields.filter((entry) => entry.key !== child.key),
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </Field>

      <div>
        <Button
          type="button"
          variant="quiet"
          size="sm"
          icon="plus"
          onClick={() => {
            const key = draftKeyFrom('Row field', childKeys)
            onChange({
              ...field,
              fields: [...field.fields, newField('text', 'Row field', key) as LeafFieldDef],
            })
          }}
        >
          Add a field to the row
        </Button>
      </div>
    </>
  )
}

/* -------------------------------------------------------------- leaf kinds */

function LeafControls({
  field,
  masterTypeOptions,
  onChange,
}: {
  field: LeafFieldDef
  masterTypeOptions: readonly SelectOption[]
  onChange: (next: FormFieldDef) => void
}) {
  if (field.kind === LEAF_FIELD_KINDS.money) {
    return (
      <p className={styles.derived}>
        An amount is typed from a document. This panel offers no default, no placeholder and no
        bounds — a schema that carried any of them is rejected before it renders, because a
        figure put in front of somebody is a figure they will accept.
      </p>
    )
  }

  if (field.kind === LEAF_FIELD_KINDS.select) {
    const inline = field.masterTypeId === null

    return (
      <div className={styles.controls}>
        <Field label="Options come from">
          <Select
            value={field.masterTypeId ?? ''}
            placeholder="Options typed here"
            options={masterTypeOptions}
            onChange={(event) =>
              onChange({
                ...field,
                masterTypeId: event.target.value === '' ? null : event.target.value,
                options: event.target.value === '' ? field.options : undefined,
              })
            }
          />
        </Field>

        {inline ? (
          <Field
            label="Options"
            className={styles.wide}
            hint="One per line, as value|Label. The value is what every record stores."
          >
            <Textarea
              rows={4}
              value={optionLines(field.options)}
              onChange={(event) =>
                onChange({ ...field, options: parseOptionLines(event.target.value) })
              }
            />
          </Field>
        ) : (
          <p className={styles.note}>
            The list is fetched by master type, never copied into the schema — so renaming a value
            on <code>/config/masters</code> renames it on every form that offers it.
          </p>
        )}
      </div>
    )
  }

  if (field.kind === LEAF_FIELD_KINDS.number) {
    return (
      <div className={styles.controls}>
        <Field label="Smallest" hint="A count of members, a term in years. Never an amount.">
          <NumberInput
            value={field.min ?? null}
            onValueChange={(value) => onChange({ ...field, min: value ?? undefined })}
          />
        </Field>
        <Field label="Largest">
          <NumberInput
            value={field.max ?? null}
            onValueChange={(value) => onChange({ ...field, max: value ?? undefined })}
          />
        </Field>
      </div>
    )
  }

  if (field.kind === LEAF_FIELD_KINDS.file) {
    return (
      <div className={styles.controls}>
        <Field label="Accepts" hint="A list of extensions or MIME types.">
          <Input
            value={field.accept ?? ''}
            onChange={(event) =>
              onChange({
                ...field,
                accept: event.target.value.trim() === '' ? undefined : event.target.value,
              })
            }
          />
        </Field>
        <Toggle
          checked={field.multiple === true}
          label="More than one file"
          onCheckedChange={(checked) => onChange({ ...field, multiple: checked || undefined })}
        />
      </div>
    )
  }

  if (field.kind === LEAF_FIELD_KINDS.cascade) {
    return (
      <div className={styles.controls}>
        <Field
          label="Levels"
          className={styles.wide}
          hint="One per level, comma separated. The tree itself is a cascading master on /config/masters."
        >
          <Input
            value={(field.cascade?.levels ?? []).join(', ')}
            onChange={(event) =>
              onChange({
                ...field,
                cascade: {
                  levels: event.target.value
                    .split(',')
                    .map((part) => part.trim())
                    .filter((part) => part !== ''),
                  nodes: field.cascade?.nodes ?? [],
                },
              })
            }
          />
        </Field>
        <p className={styles.note}>
          {`${field.cascade?.nodes.length ?? 0} options at the first level.`}
        </p>
      </div>
    )
  }

  if (field.kind === LEAF_FIELD_KINDS.text || field.kind === LEAF_FIELD_KINDS.textarea) {
    return (
      <div className={styles.controls}>
        <Field label="Longest" hint="Characters. Ten for a mobile number.">
          <NumberInput
            value={field.maxLength ?? null}
            onValueChange={(value) => onChange({ ...field, maxLength: value ?? undefined })}
          />
        </Field>
      </div>
    )
  }

  return null
}
