import { useState } from 'react'
import { SchemaForm } from '../../components/SchemaForm'
import type { SchemaFormSubmission } from '../../components/SchemaForm'
import { SEED_FORM_SCHEMAS, resolveFormSchema } from '../../domain/forms'
import type { FormSchema, FormValues } from '../../domain/forms'
import { requirementObjectKey, requirementSchemaFor } from './requirement-view'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState } from '../../ui/data'
import { Panel } from '../../ui/surface'
import type {
  Inquiry,
  InquiryCategory,
  MutationResult,
  RequirementRecord,
} from '../../data/repo'
import styles from './InquiryDetail.module.css'

/**
 * The discovery conversation, captured — FR-06.16.
 *
 * This is the input §9.2 step 4 has been assuming the agent already had. The
 * composer opens with "select the customer and the candidate policies", which
 * only works if somebody already knows how many people are being covered, how
 * old they are, what they can spend and what they hold today. All of that came
 * out of a phone call, and before this panel it had nowhere to go.
 *
 * The questions come from a schema per line, not from this file. A health
 * requirement asks about maternity and pre-existing conditions; a motor one asks
 * about the vehicle and the no-claim bonus. Showing both sets to everybody and
 * letting the agent ignore half is how a form stops being filled in.
 *
 * When there is no schema for the line, the panel says so and names what is
 * missing rather than rendering an empty box — the same honesty the rest of this
 * build uses for a gap it has not closed yet.
 */

export type RequirementPanelProps = {
  readonly inquiry: Inquiry
  readonly category: InquiryCategory | null
  readonly requirement: RequirementRecord | null
  readonly canCapture: boolean
  readonly onCapture: (submission: SchemaFormSubmission) => Promise<MutationResult<RequirementRecord>>
  readonly onCaptured: () => void
}

export function RequirementPanel({
  inquiry,
  category,
  requirement,
  canCapture,
  onCapture,
  onCaptured,
}: RequirementPanelProps) {
  const [open, setOpen] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  /**
   * A captured requirement renders under the schema it was captured with, never
   * under today's. That is the engine's own promise and this is where it is
   * claimed: the pinned version is passed through rather than resolved fresh.
   */
  const live = requirementSchemaFor(category)
  const pinned =
    requirement === null
      ? null
      : resolveFormSchema(SEED_FORM_SCHEMAS, {
          objectKey: requirement.objectKey,
          version: requirement.schemaVersion,
        })
  const schema = open ? live : (pinned ?? live)

  if (category === null) {
    return (
      <Panel title="What they need" level={3}>
        <p className={styles.none}>
          This inquiry has no category, so there is no requirement form to ask. Routing and the
          questions both come from the category.
        </p>
      </Panel>
    )
  }

  if (schema === null) {
    return (
      <Panel title="What they need" level={3}>
        <EmptyState
          variant="empty"
          title={`No requirement form for ${category.label}`}
          explanation={`The health and motor lines have one. A form for ${category.label} is configured under the object key "${requirementObjectKey(category.line)}", and until it exists this conversation is recorded in the contact notes instead.`}
        />
      </Panel>
    )
  }

  if (!open) {
    return (
      <Panel
        title="What they need"
        description={
          requirement === null
            ? 'The questions the quotation composer needs answered before it can be filled in.'
            : 'Captured, and feeding the composer. Recapture to replace it.'
        }
      >
        {requirement === null ? (
          <p className={styles.none}>
            Nothing captured yet, so the composer has nothing to open with.
          </p>
        ) : (
          <CapturedValues schema={schema} values={requirement.values} />
        )}
        <div className={styles.actions}>
          <Button
            variant={requirement === null ? 'primary' : 'quiet'}
            icon="edit"
            disabled={!canCapture}
            onClick={() => setOpen(true)}
          >
            {requirement === null ? 'Capture what they need' : 'Recapture'}
          </Button>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title={schema.title ?? 'What they need'}
      description="Answers feed the quotation composer. No money here."
    >
      {refusal ? (
        <p className={styles.refusal} role="alert">
          <Icon name="alert" size="sm" />
          {refusal}
        </p>
      ) : null}
      <SchemaForm
        schema={schema}
        entityId={inquiry.id}
        {...(requirement === null ? {} : { initialValues: requirement.values })}
        submitLabel="Save what they need"
        onSubmit={(submission) => {
          setRefusal(null)
          void onCapture(submission).then((outcome) => {
            if (!outcome.ok) {
              setRefusal(outcome.reason)
              return
            }
            setOpen(false)
            onCaptured()
          })
        }}
      />
      <div className={styles.actions}>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Panel>
  )
}

/**
 * The answers, read back under the schema that asked them.
 *
 * Labels come from the schema rather than from the stored keys, so a record
 * captured in March still reads in March's words. Unanswered questions are left
 * out rather than shown blank: a list of empty rows says the form was ignored,
 * when in fact most of these are optional by design.
 */
function CapturedValues({
  schema,
  values,
}: {
  readonly schema: FormSchema
  readonly values: FormValues
}) {
  const answered = schema.stages
    .flatMap((stage) => stage.fields)
    .map((field) => ({ label: field.label, value: values[field.key] }))
    .filter((row) => row.value !== undefined && row.value !== null && row.value !== '')

  if (answered.length === 0) {
    return <p className={styles.none}>The form was saved with nothing filled in.</p>
  }

  return (
    <dl className={styles.contactFacts}>
      {answered.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{renderValue(row.value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function renderValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  return String(value)
}

export default RequirementPanel
