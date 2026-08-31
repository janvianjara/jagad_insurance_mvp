/**
 * The draft, rendered by the real form engine.
 *
 * This is `<SchemaForm>` — the same component `/policies/new`, KYC and inquiry
 * capture mount, with the same resolver, the same branching and the same
 * refusals. Nothing here reimplements a preview, because a preview that is a
 * second renderer is a preview that agrees with the product right up until it
 * matters.
 *
 * Two consequences follow from that and are the point of the panel:
 *
 *   A draft with a blocking fault does not preview partly. `<SchemaForm>` prints
 *   its refusal and names every problem — a removed reserved field, a roll-up
 *   over something nobody typed — which is exactly what an admin would see if
 *   the draft ever reached a record.
 *
 *   Nothing typed in here is kept. The drafts store is an in-memory one created
 *   for this panel, so the U6 autosave that protects real typing cannot leave a
 *   configuration rehearsal in somebody's browser, and the submit writes nothing
 *   at all.
 */

import { useState } from 'react'
import { SchemaForm, memoryDraftStore } from '../../../components/SchemaForm'
import type { MasterOptions } from '../../../components/SchemaForm'
import { useToaster } from '../../../ui/surface'
import type { FormSchema, FormStage } from '../../../domain/forms'
import { structureSignature } from './schema-draft'
import styles from './builder.module.css'

export type SchemaPreviewProps = {
  schema: FormSchema
  stages: readonly FormStage[]
  masterOptions: MasterOptions
}

export function SchemaPreview({ schema, stages, masterOptions }: SchemaPreviewProps) {
  const toaster = useToaster()
  // One store for the life of the panel, never the browser's.
  const [drafts] = useState(() => memoryDraftStore())

  const draft: FormSchema = { ...schema, stages }

  return (
    <div className={styles.preview} data-preview={schema.id}>
      <SchemaForm
        // The renderer reads the shape once, on mount, so a structural edit
        // remounts it and a reworded label does not.
        key={structureSignature(stages)}
        schema={draft}
        entityId={`config-preview-${schema.id}`}
        drafts={drafts}
        masterOptions={masterOptions}
        submitLabel="Try the submit"
        onSubmit={() =>
          toaster.notify({
            tone: 'info',
            title: 'Preview only',
            detail: 'Nothing was recorded. This is the form as a person will meet it.',
          })
        }
      />
    </div>
  )
}
