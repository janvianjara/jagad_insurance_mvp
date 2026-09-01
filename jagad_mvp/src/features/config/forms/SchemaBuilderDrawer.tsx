/**
 * The schema builder — decision D1 made visible.
 *
 * A person configures a form here: the stages somebody walks, the fields on
 * each, what makes them appear, and what the whole thing looks like when it is
 * rendered by the engine that will actually render it. No developer writes a
 * form after this screen exists, which is the promise the plan makes and the one
 * this drawer has to keep.
 *
 * It is laid out as three columns, because that is the shape of the job:
 *
 *   PALETTE — the kinds a field can be. Pressing one makes a field.
 *   LAYOUT  — the stages and the fields on them, a row each, drag to reorder,
 *             open one to configure it.
 *   RENDER  — what the renderer makes of the draft: every fault it would print,
 *             and then the draft rendered by the renderer itself.
 *
 * The third column is the point of the first two. Adding a field used to mean
 * filling in a small form, scrolling past every other field's panel, and finding
 * the preview at the bottom; the effect of a change was never on screen with the
 * change. Now it always is — press "Amount", and the amount appears in the form
 * beside you, unfilled and with no default, which is exactly what D3 promises
 * and exactly what somebody needs to see to believe it.
 *
 * The draft is component state until it is committed, so nothing is written
 * while somebody is thinking. Two things commit it, and both are gated because
 * both are felt by people who are not in the room: saving rewrites the version
 * every open form is being captured under, and publishing supersedes it.
 *
 * The validator runs on every keystroke and is printed in full. That is the
 * builder's only opinion about correctness — `validateFormSchema` is the same
 * function `<SchemaForm>` refuses on and `defineFormSchema` throws on, so the
 * builder cannot be more permissive than the renderer.
 */

import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '../../../ui/Button'
import { Field, Input } from '../../../ui/form'
import { Badge, StatusPill } from '../../../ui/signal'
import { QUEUE_PARAMS } from '../../../components/WorkQueue'
import type { MasterOptions } from '../../../components/SchemaForm'
import {
  PROBLEM_SEVERITIES,
  reservedFieldsFor,
  validateFormSchema,
} from '../../../domain/forms'
import type { FieldKind, FormSchema, FormStage } from '../../../domain/forms'
import { GatedAction, useConfigStore } from '../shared'
import { lineageOf, useFormsStore } from './forms-store'
import { FieldPalette } from './FieldPalette'
import { StageEditor } from './StageEditor'
import type { FieldDrag } from './StageEditor'
import { SchemaPreview } from './SchemaPreview'
import { VersionStack } from './VersionStack'
import { newFieldLabel } from './field-kinds'
import {
  addField,
  addStage,
  conditionCount,
  draftFieldKeys,
  draftKeyFrom,
  dropField,
  labelsByKey,
  moneyLeafKeys,
  moveStage,
  newField,
  objectLabel,
  removeStage,
} from './schema-draft'
import layout from '../shared/config-layout.module.css'
import styles from './builder.module.css'

function countFields(stages: readonly FormStage[]): number {
  return stages.reduce((total, stage) => total + stage.fields.length, 0)
}

export function SchemaBuilderDrawer({ schema }: { schema: FormSchema }) {
  const [params, setParams] = useSearchParams()
  const schemas = useFormsStore((state) => state.schemas)
  const saveStages = useFormsStore((state) => state.saveStages)
  const publishVersion = useFormsStore((state) => state.publishVersion)

  const masterTypes = useConfigStore((state) => state.masterTypes)
  const masterValues = useConfigStore((state) => state.masterValues)

  const [stages, setStages] = useState<readonly FormStage[]>(schema.stages)
  const [newStageLabel, setNewStageLabel] = useState('')
  // Where a new field lands. Held by key rather than by index so a reorder or a
  // removal cannot silently retarget the palette; an unknown key falls back to
  // the first stage, which is where a form starts anyway.
  const [pickedStageKey, setPickedStageKey] = useState<string | null>(null)
  // One open panel in the whole builder. Two open panels is a column again.
  const [openFieldKey, setOpenFieldKey] = useState<string | null>(null)
  const [drag, setDrag] = useState<FieldDrag | null>(null)

  const draft: FormSchema = { ...schema, stages }
  const problems = validateFormSchema(draft)
  const blocking = problems.filter(
    (problem) => problem.severity === PROBLEM_SEVERITIES.blocking,
  )
  const reserved = reservedFieldsFor(schema.objectKey)
  const labels = labelsByKey(stages)
  const moneyKeys = moneyLeafKeys(stages)
  const versions = lineageOf(schemas, schema)
  const changed = JSON.stringify(stages) !== JSON.stringify(schema.stages)

  const pickedStage = stages.find((stage) => stage.key === pickedStageKey) ?? stages[0] ?? null

  const masterTypeOptions = masterTypes.map((type) => ({ value: type.id, label: type.label }))

  /**
   * Opens another row's drawer without disturbing the rest of the queue's URL
   * state. `<WorkQueue>` owns the address bar; this only moves the one parameter
   * that says which record is open.
   */
  function openRecord(schemaId: string) {
    const next = new URLSearchParams(params)
    next.set(QUEUE_PARAMS.record, schemaId)
    setParams(next)
  }

  /**
   * A field of the pressed kind, at the end of the picked stage, opened so its
   * name can be typed straight away.
   *
   * Note what it is born with: a placeholder name, and nothing else. `newField`
   * has no default to give it, no prefill and no formula — an amount added here
   * is an empty amount box in the preview a second later, which is the whole of
   * what this product will ever put in front of somebody about money.
   */
  function addOfKind(kind: FieldKind) {
    if (pickedStage === null) return
    const label = newFieldLabel(kind)
    const key = draftKeyFrom(label, draftFieldKeys(stages))
    setStages(addField(stages, pickedStage.key, newField(kind, label, key)))
    setPickedStageKey(pickedStage.key)
    setOpenFieldKey(key)
  }

  /** Lands the dragged field. Dropping a field on itself is not a move. */
  function dropOn(toStageKey: string, toIndex: number, overFieldKey: string | null) {
    if (drag === null) return
    setDrag(null)
    if (overFieldKey === drag.fieldKey) return
    setStages(dropField(stages, drag.stageKey, drag.fieldKey, toStageKey, toIndex))
    setPickedStageKey(toStageKey)
  }

  // What `<SchemaForm>` needs to fill a master-backed choice: active values
  // only, by master type id. The form never learns where they came from.
  const masterOptions: MasterOptions = Object.fromEntries(
    masterTypes.map((type) => [
      type.id,
      masterValues
        .filter((value) => value.masterTypeId === type.id && value.active)
        .toSorted((a, b) => a.sortOrder - b.sortOrder)
        .map((value) => ({ value: value.key, label: value.label })),
    ]),
  )

  return (
    <div className={styles.builder}>
      {/* ------------------------------------------------------ what this is */}
      <header className={styles.identity}>
        <div className={layout.rowActions}>
          <Badge tone="neutral">{objectLabel(schema.objectKey)}</Badge>
          <Badge tone="neutral">
            {schema.productId === null ? 'Fallback for the object' : `Product ${schema.productId}`}
          </Badge>
          <StatusPill tone={schema.active ? 'ok' : 'idle'} size="sm">
            {schema.active ? 'Live' : 'Superseded'}
          </StatusPill>
          <span className={layout.mono}>{`${schema.id} · version ${schema.version}`}</span>
          <span className={styles.tally}>
            {`${stages.length} stages · ${countFields(stages)} fields · ${conditionCount(stages)} conditions`}
          </span>
          {changed ? <Badge tone="attn">Unsaved</Badge> : null}
        </div>
      </header>

      {/* ------------------------------------------------------ the workbench */}
      <div className={styles.workbench}>
        <div className={styles.rail}>
          <FieldPalette
            targetStageLabel={pickedStage === null ? null : pickedStage.label}
            onAdd={addOfKind}
          />

          <section className={styles.railSection} aria-label="Add a stage">
            <h3 className={styles.paneTitle}>Add a stage</h3>
            <div className={styles.stageAdd}>
              <Field label="New stage">
                <Input
                  value={newStageLabel}
                  onChange={(event) => setNewStageLabel(event.target.value)}
                />
              </Field>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                icon="plus"
                disabled={newStageLabel.trim() === ''}
                onClick={() => {
                  const next = addStage(stages, newStageLabel)
                  setStages(next)
                  setPickedStageKey(next[next.length - 1].key)
                  setNewStageLabel('')
                }}
              >
                Add stage
              </Button>
            </div>
          </section>

          <section className={styles.railSection} aria-label="Versions">
            <h3 className={styles.paneTitle}>Versions</h3>
            <p className={styles.paneNote}>
              A superseded version is kept, never deleted: a record pins the version it was
              captured under, and that promise only holds while the row survives.
            </p>
            <VersionStack versions={versions} currentId={schema.id} onOpen={openRecord} />
          </section>
        </div>

        {/* ------------------------------------------------- stages and fields */}
        <div className={styles.arrange}>
          <h3 className={styles.paneTitle}>Form layout</h3>
          <p className={styles.paneNote}>
            What a person is asked, in the order they are asked it. Drag a field to move it, within
            a stage or to another one. Nothing here can express a computed amount: the grammar has
            no default, no prefill and no formula, and the one piece of arithmetic — the roll-up —
            may only name the typed amounts it sums.
          </p>

          {reserved.length > 0 ? (
            <p className={styles.locked}>
              {`The platform reads ${reserved.map((entry) => `"${entry.key}"`).join(', ')} on this object by name. Each is marked below and none of them can be removed or renamed from here — reserved-ness belongs to the platform, not to the schema, so there is no switch to turn it off.`}
            </p>
          ) : null}

          {stages.length === 0 ? (
            <p className={styles.note}>
              This schema has no stages yet. Add one from the left; fields go on stages.
            </p>
          ) : null}

          {stages.map((stage, index) => (
            <StageEditor
              key={stage.key}
              stage={stage}
              stages={stages}
              objectKey={schema.objectKey}
              labels={labels}
              moneyKeys={moneyKeys}
              masterTypeOptions={masterTypeOptions}
              first={index === 0}
              last={index === stages.length - 1}
              active={pickedStage?.key === stage.key}
              openFieldKey={openFieldKey}
              drag={drag}
              onSelect={() => setPickedStageKey(stage.key)}
              onToggleField={(fieldKey) =>
                setOpenFieldKey(openFieldKey === fieldKey ? null : fieldKey)
              }
              onStages={setStages}
              onMove={(delta) => setStages(moveStage(stages, stage.key, delta))}
              onRemove={() => setStages(removeStage(stages, stage.key))}
              onDrag={setDrag}
              onDrop={dropOn}
            />
          ))}
        </div>

        {/* ----------------------------------------- what the renderer makes of it */}
        <aside className={styles.render}>
          <h3 className={styles.paneTitle}>What the renderer makes of it</h3>
          <p className={styles.paneNote}>
            The same check the renderer refuses on. A blocking fault stops the form rendering at
            all; an advisory means it works and somebody should look.
          </p>

          {problems.length === 0 ? (
            <p className={styles.clean}>Nothing to fix. This draft renders.</p>
          ) : (
            <ul className={styles.problems} aria-label="Schema problems">
              {problems.map((problem) => (
                <li
                  className={styles.problem}
                  key={`${problem.code}:${problem.fieldKey ?? ''}`}
                  data-severity={problem.severity}
                  data-problem={problem.code}
                >
                  {problem.message}
                </li>
              ))}
            </ul>
          )}

          <h3 className={styles.paneTitle}>Preview</h3>
          <p className={styles.paneNote}>
            Rendered by the form engine itself — the same component policy entry, KYC and inquiry
            capture mount. Nothing typed here is kept, and the submit writes nothing.
          </p>
          <SchemaPreview schema={schema} stages={stages} masterOptions={masterOptions} />
        </aside>
      </div>

      {/* ------------------------------------------------------- the commit */}
      <footer className={styles.commit}>
        <div className={layout.rowActions}>
          <GatedAction
            label="Save this version"
            variant="primary"
            title={`Save version ${schema.version} of ${objectLabel(schema.objectKey)}`}
            disabled={!changed || blocking.length > 0}
            changes={[
              {
                key: 'stages',
                label: 'Stages',
                from: `${schema.stages.length} stages, ${countFields(schema.stages)} fields`,
                to: `${stages.length} stages, ${countFields(stages)} fields`,
              },
              {
                key: 'conditions',
                label: 'Conditions',
                from: String(conditionCount(schema.stages)),
                to: String(conditionCount(stages)),
              },
            ]}
            note="Every record still being captured under this version sees the change at once. Records already saved under it keep the answers they hold."
            confirmLabel="Save"
            toast={{ title: 'Form saved', detail: objectLabel(schema.objectKey) }}
            onConfirm={() => saveStages(schema.id, stages)}
          />

          <GatedAction
            label="Publish as a new version"
            title={`Publish version ${Math.max(...versions.map((row) => row.version)) + 1}`}
            disabled={blocking.length > 0}
            changes={[
              {
                key: 'version',
                label: 'Live version',
                from: `Version ${versions.find((row) => row.active)?.version ?? schema.version}`,
                to: `Version ${Math.max(...versions.map((row) => row.version)) + 1}`,
              },
              {
                key: 'shape',
                label: 'The new version holds',
                to: `${stages.length} stages, ${countFields(stages)} fields`,
              },
            ]}
            note="The version it replaces is marked superseded and kept. Every record pinned to it goes on rendering exactly as it was captured — deleting it would silently reshape those records."
            confirmLabel="Publish"
            toast={{ title: 'New version published' }}
            onConfirm={() => {
              const outcome = publishVersion(schema.id, stages)
              if (outcome.ok) openRecord(outcome.schemaId)
            }}
          />

          <Button
            type="button"
            variant="quiet"
            size="sm"
            disabled={!changed}
            onClick={() => setStages(schema.stages)}
          >
            Discard changes
          </Button>

          {blocking.length > 0 ? (
            <span className={styles.blocked}>
              {`${blocking.length} blocking ${blocking.length === 1 ? 'fault' : 'faults'} — neither save nor publish is offered until they are fixed.`}
            </span>
          ) : (
            <span className={styles.commitNote}>
              Saving rewrites the version records are being captured under. Publishing supersedes
              it and leaves it in place.
            </span>
          )}
        </div>
      </footer>
    </div>
  )
}
