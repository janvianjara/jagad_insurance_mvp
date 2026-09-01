/**
 * One stage of a schema — the step a person walks, and everything on it.
 *
 * A stage can branch away whole (a motor form has no health declaration), so it
 * carries the same condition editor a field does and the same refusal to read an
 * amount. It cannot be removed while it holds a field the platform reads by
 * name: that would be removal of a reserved field by another route, and the
 * refusal says which field and why rather than greying a button out in silence.
 *
 * The stage is also the target. Clicking its header selects it, and the palette
 * on the left then adds to it — which is why the header is a button and why the
 * selected card says so. That replaces the label-and-kind form this component
 * used to carry at the bottom of every stage: one place to add a field, not one
 * per stage, and the field arrives already visible in the preview.
 */

import { Button } from '../../../ui/Button'
import { Field, Input, Select } from '../../../ui/form'
import type { SelectOption } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import type { FormStage } from '../../../domain/forms'
import { FieldEditor } from './FieldEditor'
import {
  conditionSourceKeys,
  equalsRule,
  isSimpleRule,
  moveField,
  patchStage,
  removeField,
  replaceField,
  reservedFieldFor,
  ruleSummary,
  stageRemovalRefusal,
} from './schema-draft'
import layout from '../shared/config-layout.module.css'
import styles from './builder.module.css'

/** The field currently under the pointer's thumb, and the stage it came from. */
export type FieldDrag = {
  readonly stageKey: string
  readonly fieldKey: string
}

export type StageEditorProps = {
  stage: FormStage
  stages: readonly FormStage[]
  objectKey: string
  labels: Readonly<Record<string, string>>
  moneyKeys: readonly string[]
  masterTypeOptions: readonly SelectOption[]
  first: boolean
  last: boolean
  /** The stage the palette adds to. */
  active: boolean
  /** The one open field panel in the whole builder, when it is on this stage. */
  openFieldKey: string | null
  drag: FieldDrag | null
  onSelect: () => void
  onToggleField: (fieldKey: string) => void
  onStages: (next: readonly FormStage[]) => void
  onMove: (delta: number) => void
  onRemove: () => void
  onDrag: (drag: FieldDrag | null) => void
  /** Somebody let go: land the dragged field on this stage, at this position. */
  onDrop: (toStageKey: string, toIndex: number, overFieldKey: string | null) => void
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
  active,
  openFieldKey,
  drag,
  onSelect,
  onToggleField,
  onStages,
  onMove,
  onRemove,
  onDrag,
  onDrop,
}: StageEditorProps) {
  const refusal = stageRemovalRefusal(objectKey, stage)
  const rule = stage.visibleWhen ?? null
  const simple = isSimpleRule(rule)
  const stageSources = conditionSourceKeys(stages, '').filter(
    (key) => !stage.fields.some((field) => field.key === key),
  )

  return (
    <section
      className={styles.stage}
      data-stage-key={stage.key}
      data-active={active ? '' : undefined}
      aria-label={stage.label}
    >
      <div className={styles.stageHead}>
        {/* Selecting a stage is a click on the stage, not on a radio beside it:
            the card IS the target, so the card is what you press. */}
        <button
          type="button"
          className={styles.stagePick}
          aria-pressed={active}
          onClick={onSelect}
        >
          <span className={styles.stagePickLabel}>{stage.label}</span>
          <span className={layout.mono}>{stage.key}</span>
        </button>

        <Badge tone="neutral">{`${stage.fields.length} fields`}</Badge>
        {active ? <Badge tone="info">Adding here</Badge> : null}

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

      {/* A stage's own settings — its name and whether the whole step branches
          away — show on the stage somebody is working on. On the other cards
          they would be three controls each, repeated down the column, for a
          thing that is changed once and then left alone. */}
      {active ? (
      <div className={styles.controls}>
        <Field label="Stage name" required>
          <Input
            value={stage.label}
            onChange={(event) => onStages(patchStage(stages, stage.key, { label: event.target.value }))}
          />
        </Field>

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
      ) : null}

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
            open={openFieldKey === field.key}
            dragging={drag?.fieldKey === field.key}
            onToggle={() => onToggleField(field.key)}
            onChange={(next) => onStages(replaceField(stages, stage.key, field.key, next))}
            onRemove={() => onStages(removeField(stages, objectKey, stage.key, field.key))}
            onMove={(delta) => onStages(moveField(stages, stage.key, field.key, delta))}
            onDragStart={() => onDrag({ stageKey: stage.key, fieldKey: field.key })}
            onDragEnd={() => onDrag(null)}
            onDropAt={(before) => onDrop(stage.key, before ? index : index + 1, field.key)}
          />
        ))}

        {/* The tail. It is what makes an empty stage a place a field can be
            dropped, and what makes "the end" reachable when the last row's
            bottom half is off the bottom of the pane. */}
        <li
          className={styles.dropTail}
          data-armed={drag !== null ? '' : undefined}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            onDrop(stage.key, stage.fields.length, null)
          }}
        >
          {stage.fields.length === 0
            ? 'No fields yet. Add one from the palette, or drag one here.'
            : 'Drop here to put a field last'}
        </li>
      </ul>
    </section>
  )
}
