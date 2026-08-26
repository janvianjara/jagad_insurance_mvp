/**
 * `<SchemaForm>` — plan §6: policy entry, endorsement, claim intimation, KYC
 * and inquiry as one component with different data.
 *
 * Everything specific to a form lives in its schema; everything in this file is
 * true of every form the agency will ever configure. What it adds on top of the
 * domain half is the four things a person actually needs:
 *
 *   - stages that branch as they answer, with `Enter` moving to the next one;
 *   - a draft written to localStorage under the entity's own key, restored on
 *     return, so a session timeout costs nobody their typing (charter U6);
 *   - a standing list of what is still missing, each item a way back to it;
 *   - a refusal to render at all when the schema is broken or when the record's
 *     pinned version is not the one it was handed.
 *
 * That last one is worth dwelling on. Rendering today's schema over a record
 * captured under version 1 would produce a screen that looks perfectly fine and
 * quietly misrepresents what somebody recorded two years ago. A blank refusal
 * that names the version is the safer failure, every time.
 *
 * This component never writes anything. It hands values to its caller, and the
 * caller puts the outward move behind `<ConfirmGate>`.
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Button } from '../../ui/Button'
import { FormSection } from '../../ui/form'
import { RelativeTime } from '../../ui/type'
import {
  decodeDraft,
  draftKey,
  emptyValues,
  encodeDraft,
  blockingProblems,
  isGroupField,
  missingRequiredFields,
  visibleFields,
  visibleStages,
} from '../../domain/forms'
import type { FormSchema, FormValues } from '../../domain/forms'
import { browserDraftStore } from './draft-store'
import type { DraftStore } from './draft-store'
import { SchemaField } from './SchemaField'
import type { MasterOptions } from './SchemaField'
import { schemaResolver } from './schema-resolver'
import styles from './SchemaForm.module.css'

export type SchemaFormSubmission = {
  readonly values: FormValues
  /** Pinned onto the record, so it can be re-rendered exactly as captured. */
  readonly schemaId: string
  readonly schemaVersion: number
}

export type SchemaFormProps = {
  schema: FormSchema
  /** The record this form belongs to. The draft key, and nothing else. */
  entityId: string
  initialValues?: FormValues
  /** The version an existing record was captured under. New records omit it. */
  pinnedVersion?: number | null
  /** Master list options by master type id, fetched by the caller. */
  masterOptions?: MasterOptions
  drafts?: DraftStore
  submitLabel?: string
  onSubmit: (submission: SchemaFormSubmission) => void
}

function readDraft(store: DraftStore, key: string, schema: FormSchema, entityId: string) {
  const text = store.read(key)
  if (text === null) return null
  try {
    return decodeDraft(schema, entityId, JSON.parse(text))
  } catch {
    // Corrupt JSON is a draft that cannot help. It must not stop the record
    // being opened either.
    return null
  }
}

export function SchemaForm(props: SchemaFormProps) {
  const problems = blockingProblems(props.schema)

  if (problems.length > 0) {
    return (
      <section className={styles.refusal} role="alert" data-refusal="schema">
        <h2 className={styles.refusalTitle}>This form cannot be rendered</h2>
        <p className={styles.refusalBody}>
          The stored schema <code>{props.schema.id}</code> is not one the platform can show. It
          has to be fixed in configuration; rendering it partly would hide the fault rather than
          report it.
        </p>
        <ul className={styles.refusalList}>
          {problems.map((problem) => (
            <li key={`${problem.code}:${problem.fieldKey ?? ''}`}>{problem.message}</li>
          ))}
        </ul>
      </section>
    )
  }

  const pinned = props.pinnedVersion ?? null
  if (pinned !== null && pinned !== props.schema.version) {
    return (
      <section className={styles.refusal} role="alert" data-refusal="version">
        <h2 className={styles.refusalTitle}>This record was captured under another version</h2>
        <p className={styles.refusalBody}>
          {`It is pinned to version ${pinned} of ${props.schema.objectKey}, and version ${props.schema.version} was supplied. A record is always shown under the schema it was captured with, so nothing is rendered here.`}
        </p>
      </section>
    )
  }

  return <SchemaFormBody {...props} />
}

function SchemaFormBody({
  schema,
  entityId,
  initialValues,
  masterOptions,
  drafts = browserDraftStore,
  submitLabel = 'Save',
  onSubmit,
}: SchemaFormProps) {
  const storageKey = draftKey(schema.objectKey, entityId)

  // Read once, on mount. A draft that arrived later would overwrite typing in
  // progress, which is the opposite of what a draft is for.
  const [restored] = useState(() => readDraft(drafts, storageKey, schema, entityId))
  const [savedAt, setSavedAt] = useState<string | null>(restored?.savedAt ?? null)
  const [stageKey, setStageKey] = useState<string | null>(null)

  const form = useForm<Record<string, unknown>>({
    defaultValues: {
      ...emptyValues(schema),
      ...(initialValues ?? {}),
      ...(restored?.values ?? {}),
    },
    resolver: schemaResolver(schema),
    mode: 'onBlur',
  })

  // `useWatch` rather than `form.watch()`: same subscription, but the compiler
  // can reason about it, so this component is still compiled.
  const values = useWatch({ control: form.control }) as FormValues
  const stages = visibleStages(schema, values)
  const index = Math.max(
    0,
    stages.findIndex((stage) => stage.key === stageKey),
  )
  const stage = stages[index]
  const isLast = index === stages.length - 1
  const missing = missingRequiredFields(schema, values)
  const labels = Object.fromEntries(
    schema.stages.flatMap((entry) => entry.fields.map((field) => [field.key, field.label])),
  )

  const headingRef = useRef<HTMLSpanElement | null>(null)
  /** Where to put the cursor once the next stage has rendered, if anywhere. */
  const pendingFocus = useRef<string | null>(null)
  const lastWritten = useRef<string | null>(null)
  const draft = encodeDraft(schema, entityId, values, '')
  const draftText = JSON.stringify(draft.values)

  // No dependency array: the ref decides. An effect that re-runs cheaply and
  // writes only when the content changed beats a dependency list that has to be
  // kept in step with every value in the form.
  useEffect(() => {
    if (!form.formState.isDirty) return
    if (lastWritten.current === draftText) return
    lastWritten.current = draftText
    const stamp = new Date().toISOString()
    drafts.write(storageKey, JSON.stringify({ ...draft, savedAt: stamp }))
    setSavedAt(stamp)
  }, [form.formState.isDirty, draftText, drafts, storageKey, draft])

  useEffect(() => {
    // Moving to a stage moves the reading position, and a screen reader has to
    // be told. Landing on a named field takes the cursor straight there — the
    // control ids ARE the react-hook-form names, group rows included — and
    // otherwise the stage heading takes focus, so the stage is announced before
    // its first question.
    const pending = pendingFocus.current
    pendingFocus.current = null

    const target = pending === null ? null : document.getElementById(pending)
    if (target !== null) target.focus()
    else headingRef.current?.focus()
  }, [stageKey])

  if (stage === undefined) return null

  const fields = visibleFields(stage, values)

  function stageNames(): string[] {
    return fields.map((field) => field.key)
  }

  async function goNext() {
    const ok = await form.trigger(stageNames())
    if (!ok) return
    const next = stages[index + 1]
    if (next) setStageKey(next.key)
  }

  function goBack() {
    const previous = stages[index - 1]
    if (previous) setStageKey(previous.key)
  }

  function goToField(stageKeyTarget: string, fieldKey: string) {
    if (stage !== undefined && stageKeyTarget === stage.key) {
      // Already here: the control is on screen, so focus it now rather than
      // waiting for a render that is not going to happen.
      document.getElementById(fieldKey)?.focus()
      return
    }
    pendingFocus.current = fieldKey
    setStageKey(stageKeyTarget)
  }

  /**
   * Enter moves to the next stage; it never submits.
   *
   * A form that submits on Enter is a form that writes because somebody was
   * finishing a sentence. On the last stage the key moves focus to the submit
   * button instead, so the write is always a deliberate press.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter') return
    const target = event.target as HTMLElement
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return

    event.preventDefault()
    if (isLast) {
      const submitButton = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]')
      submitButton?.focus()
      return
    }
    void goNext()
  }

  const submit = form.handleSubmit((raw) => {
    drafts.clear(storageKey)
    onSubmit({ values: raw as FormValues, schemaId: schema.id, schemaVersion: schema.version })
  })

  return (
    <form className={styles.form} onSubmit={submit} onKeyDown={handleKeyDown} noValidate>
      <ol className={styles.stages} aria-label="Stages">
        {stages.map((entry, position) => (
          <li
            className={styles.stageStep}
            key={entry.key}
            aria-current={entry.key === stage.key ? 'step' : undefined}
            data-current={entry.key === stage.key || undefined}
          >
            <button
              type="button"
              className={styles.stageButton}
              onClick={() => setStageKey(entry.key)}
            >
              <span className={styles.stageNumber}>{position + 1}</span>
              {entry.label}
            </button>
          </li>
        ))}
      </ol>

      {restored ? (
        <p className={styles.draftNotice} data-draft="restored">
          Draft restored from <RelativeTime value={restored.savedAt} />.
          {restored.detachedFileFields.length > 0
            ? ` Attach again: ${restored.detachedFileFields.map((key) => labels[key] ?? key).join(', ')}.`
            : ''}
          {restored.droppedFieldKeys.length > 0
            ? ` The schema has changed since; these no longer apply: ${restored.droppedFieldKeys.join(', ')}.`
            : ''}
        </p>
      ) : null}

      <FormSection
        title={
          // Focusable, and inside the section's own heading rather than a
          // second one: a stage change has to move the reading position without
          // inventing a heading level.
          <span className={styles.stageTitle} ref={headingRef} tabIndex={-1}>
            {stage.label}
          </span>
        }
        description={stage.description}
      >
        {fields.map((field) => (
          <div
            className={isGroupField(field) ? styles.wideField : styles.field}
            key={field.key}
            data-field={field.key}
          >
            <SchemaField
              field={field}
              control={form.control}
              name={field.key}
              values={values}
              labels={labels}
              masterOptions={masterOptions}
            />
          </div>
        ))}
      </FormSection>

      <section className={styles.summary} aria-label="Still to record">
        <h3 className={styles.summaryTitle}>
          {missing.length === 0
            ? 'Everything required has been recorded'
            : `Still to record (${missing.length})`}
        </h3>
        {missing.length > 0 ? (
          <ul className={styles.summaryList}>
            {missing.map((item) => (
              <li key={item.fieldKey}>
                <button
                  type="button"
                  className={styles.summaryLink}
                  onClick={() => goToField(item.stageKey, item.fieldKey)}
                >
                  {`${item.stageLabel} — ${item.label}`}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className={styles.actions}>
        <span className={styles.savedAt}>
          {savedAt === null ? (
            'No draft saved yet'
          ) : (
            <>
              Draft saved <RelativeTime value={savedAt} />
            </>
          )}
        </span>
        <div className={styles.buttons}>
          <Button type="button" variant="quiet" onClick={goBack} disabled={index === 0}>
            Back
          </Button>
          {isLast ? (
            <Button type="submit" variant="primary">
              {submitLabel}
            </Button>
          ) : (
            <Button type="button" variant="primary" iconEnd="chevron-right" onClick={() => void goNext()}>
              Next
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
