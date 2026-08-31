/**
 * One stage of a schema — the step a person walks, and everything on it.
 *
 * A stage can branch away whole (a motor form has no health declaration), so it
 * carries the same condition editor a field does and the same refusal to read an
 * amount. It cannot be removed while it holds a field the platform reads by
 * name: that would be removal of a reserved field by another route, and the
 * refusal says which field and why rather than greying a button out in silence.
 */

import { useState } from 'react'
import { Button } from '../../../ui/Button'
import { Field, Input, Select } from '../../../ui/form'
import type { SelectOption } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import type { FieldKind, FormStage } from '../../../domain/forms'
import { FieldEditor } from './FieldEditor'
import { KIND_LABELS, OFFERED_KINDS, kindOptions } from './field-kinds'
import {
  addField,
  conditionSourceKeys,
  draftKeyFrom,
  draftFieldKeys,
  equalsRule,
  isSimpleRule,
  moveField,
  newField,
  patchStage,
  removeField,
  replaceField,
  reservedFieldFor,
  ruleSummary,
  stageRemovalRefusal,
} from './schema-draft'
import layout from '../shared/config-layout.module.css'
import styles from './builder.module.css'

export type StageEditorProps = {
  stage: FormStage
  stages: readonly FormStage[]
  objectKey: string
  labels: Readonly<Record<string, string>>
  moneyKeys: readonly string[]
  masterTypeOptions: readonly SelectOption[]
  first: boolean
  last: boolean
  onStages: (next: readonly FormStage[]) => void
  onMove: (delta: number) => void
  onRemove: () => void
}

export function StageEditor({
  stage,
  stages,
  objectKey,
  labels,
  moneyKeys,
  masterTypeOptions,
  first,
  last,
  onStages,
  onMove,
  onRemove,
}: StageEditorProps) {
  const [newLabel, setNewLabel] = useState('')
  const [newKind, setNewKind] = useState<FieldKind>('text')

  const refusal = stageRemovalRefusal(objectKey, stage)
  const rule = stage.visibleWhen ?? null
  const simple = isSimpleRule(rule)
  const stageSources = conditionSourceKeys(stages, '').filter(
    (key) => !stage.fields.some((field) => field.key === key),
  )

  return (
    <section className={styles.stage} data-stage-key={stage.key} aria-label={stage.label}>
      <div className={styles.stageHead}>
        <Field label="Stage" required>
          <Input
            value={stage.label}
            onChange={(event) => onStages(patchStage(stages, stage.key, { label: event.target.value }))}
          />
        </Field>
        <span className={layout.mono}>{stage.key}</span>
        <Badge tone="neutral">{`${stage.fields.length} fields`}</Badge>

        <span className={layout.rowActions}>
          <Button type="button" variant="quiet" size="sm" disabled={first} onClick={() => onMove(-1)}>
            Move up
          </Button>
          <Button type="button" variant="quiet" size="sm" disabled={last} onClick={() => onMove(1)}>
            Move down
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            disabled={refusal !== null}
            onClick={onRemove}
          >
            Remove stage
          </Button>
        </span>
      </div>

      {refusal ? (
        <p className={styles.locked} data-stage-refusal={stage.key}>
          {refusal}
        </p>
      ) : null}

      <div className={styles.controls}>
        <Field
          label="Stage shown when"
          hint="A whole step can branch away. Amounts are never offered as the condition."
        >
          <Select
            value={simple ? rule.field : ''}
            placeholder="Always shown"
            options={stageSources.map((key) => ({ value: key, label: labels[key] ?? key }))}
            disabled={rule !== null && !simple}
            onChange={(event) =>
              onStages(
                patchStage(stages, stage.key, {
                  visibleWhen:
                    event.target.value === ''
                      ? null
                      : equalsRule(event.target.value, simple ? rule.equals : ''),
                }),
              )
            }
          />
        </Field>

        <Field label="…equals">
          <Input
            value={simple ? rule.equals : ''}
            disabled={!simple}
            onChange={(event) =>
              simple
                ? onStages(
                    patchStage(stages, stage.key, {
                      visibleWhen: equalsRule(rule.field, event.target.value),
                    }),
                  )
                : undefined
            }
          />
        </Field>

        <p className={styles.note}>{ruleSummary(rule, labels)}</p>
      </div>

      <ul className={styles.fieldList} aria-label={`Fields on ${stage.label}`}>
        {stage.fields.map((field, index) => (
          <FieldEditor
            key={field.key}
            field={field}
            reserved={reservedFieldFor(objectKey, field.key)}
            labels={labels}
            conditionSources={conditionSourceKeys(stages, field.key)}
            moneyKeys={moneyKeys.filter((key) => key !== field.key)}
            masterTypeOptions={masterTypeOptions}
            first={index === 0}
            last={index === stage.fields.length - 1}
            onChange={(next) => onStages(replaceField(stages, stage.key, field.key, next))}
            onRemove={() => onStages(removeField(stages, objectKey, stage.key, field.key))}
            onMove={(delta) => onStages(moveField(stages, stage.key, field.key, delta))}
          />
        ))}
      </ul>

      <div className={styles.stageHead}>
        <Field label={`Add a field to ${stage.label}`}>
          <Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
        </Field>
        <Field label="Kind">
          <Select
            value={newKind}
            options={kindOptions(OFFERED_KINDS)}
            onChange={(event) => setNewKind(event.target.value as FieldKind)}
          />
        </Field>
        <Button
          type="button"
          variant="quiet"
          size="sm"
          icon="plus"
          disabled={newLabel.trim() === ''}
          onClick={() => {
            const key = draftKeyFrom(newLabel, draftFieldKeys(stages))
            onStages(addField(stages, stage.key, newField(newKind, newLabel, key)))
            setNewLabel('')
          }}
        >
          {`Add ${KIND_LABELS[newKind].toLowerCase()}`}
        </Button>
      </div>
    </section>
  )
}
