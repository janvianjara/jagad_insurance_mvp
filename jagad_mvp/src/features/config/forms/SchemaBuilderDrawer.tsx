/**
 * The schema builder — decision D1 made visible.
 *
 * A person configures a form here: the stages somebody walks, the fields on
 * each, what makes them appear, and what the whole thing looks like when it is
 * rendered by the engine that will actually render it. No developer writes a
 * form after this screen exists, which is the promise the plan makes and the one
 * this drawer has to keep.
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
import { Field, FormSection, Input } from '../../../ui/form'
import { Badge, StatusPill } from '../../../ui/signal'
import { QUEUE_PARAMS } from '../../../components/WorkQueue'
import type { MasterOptions } from '../../../components/SchemaForm'
import {
  PROBLEM_SEVERITIES,
  reservedFieldsFor,
  validateFormSchema,
} from '../../../domain/forms'
import type { FormSchema, FormStage } from '../../../domain/forms'
import { GatedAction, useConfigStore } from '../shared'
import { lineageOf, useFormsStore } from './forms-store'
import { StageEditor } from './StageEditor'
import { SchemaPreview } from './SchemaPreview'
import { VersionStack } from './VersionStack'
import {
  addStage,
  conditionCount,
  labelsByKey,
  moneyLeafKeys,
  moveStage,
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
      <FormSection
        title="What this form captures"
        description="The object is what a record is; a product-specific schema wins over the fallback for the same object. Neither is edited here — both are what the record already names."
      >
        <div className={layout.rowActions}>
          <Badge tone="neutral">{objectLabel(schema.objectKey)}</Badge>
          <Badge tone="neutral">
            {schema.productId === null ? 'Fallback for the object' : `Product ${schema.productId}`}
          </Badge>
          <StatusPill tone={schema.active ? 'ok' : 'idle'} size="sm">
            {schema.active ? 'Live' : 'Superseded'}
          </StatusPill>
          <span className={layout.mono}>{`${schema.id} · version ${schema.version}`}</span>
        </div>

        <p className={layout.muted}>
          {`${stages.length} stages · ${countFields(stages)} fields · ${conditionCount(stages)} conditions`}
        </p>

        {reserved.length > 0 ? (
          <p className={styles.locked}>
            {`The platform reads ${reserved.map((entry) => `"${entry.key}"`).join(', ')} on this object by name. Each is marked below and none of them can be removed or renamed from here — reserved-ness belongs to the platform, not to the schema, so there is no switch to turn it off.`}
          </p>
        ) : null}
      </FormSection>

      {/* ------------------------------------------------- stages and fields */}
      <FormSection
        title="Stages and fields"
        description="What a person is asked, in the order they are asked it. Nothing here can express a computed amount: the grammar has no default, no prefill and no formula, and the one piece of arithmetic — the roll-up — may only name the typed amounts it sums."
      >
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
            onStages={setStages}
            onMove={(delta) => setStages(moveStage(stages, stage.key, delta))}
            onRemove={() => setStages(removeStage(stages, stage.key))}
          />
        ))}

        <div className={styles.stageHead}>
          <Field label="Add a stage">
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
              setStages(addStage(stages, newStageLabel))
              setNewStageLabel('')
            }}
          >
            Add stage
          </Button>
        </div>
      </FormSection>

      {/* ------------------------------------------------------- the verdict */}
      <FormSection
        title="What the renderer makes of it"
        description="The same check the renderer refuses on. A blocking fault stops the form rendering at all; an advisory means it works and somebody should look."
      >
        {problems.length === 0 ? (
          <p className={layout.muted}>Nothing to fix. This draft renders.</p>
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
        </div>
      </FormSection>

      {/* ----------------------------------------------------------- preview */}
      <FormSection
        title="Preview"
        description="Rendered by the form engine itself — the same component policy entry, KYC and inquiry capture mount. Nothing typed here is kept, and the submit writes nothing."
      >
        <SchemaPreview schema={schema} stages={stages} masterOptions={masterOptions} />
      </FormSection>

      {/* ---------------------------------------------------------- versions */}
      <FormSection
        title="Versions"
        description="A superseded version is kept, never deleted: a record pins the version it was captured under, and that promise only holds while the row survives."
      >
        <VersionStack
          versions={versions}
          currentId={schema.id}
          onOpen={openRecord}
        />
      </FormSection>
    </div>
  )
}
