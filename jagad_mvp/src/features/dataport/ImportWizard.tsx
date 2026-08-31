import { useState } from 'react'
import type { ReactNode } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { ConfirmGate } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { DataTable, EmptyState, Skeleton, dataTableColumns } from '../../ui/data'
import { Field, FileDrop, Select } from '../../ui/form'
import { StatusPill } from '../../ui/signal'
import { Modal } from '../../ui/surface'
import type { Tone } from '../../ui/tone'
import {
  ROW_OUTCOMES,
  autoMap,
  columnSample,
  errorSheet,
  missingRequired,
  templateFileName,
  templateSheet,
  troubleFirst,
  withMapping,
} from '../../domain/dataport'
import type {
  ColumnMap,
  ImportField,
  ImportSpec,
  RowOutcome,
  RowVerdict,
  Sheet,
  ValidationContext,
  ValidationReport,
} from '../../domain/dataport'
import { validateRows } from '../../domain/dataport'
import { importDesk } from './data/import-desk'
import type { CommitReceipt } from './data/import-desk'
import {
  EXPORT_FORMATS,
  IMPORT_ACCEPT,
  IMPORT_ACCEPT_HINT,
  downloadSheet,
  readSheetFromFile,
} from './file-io'
import type { ExportFormat } from './file-io'
import { newRunId, useImportRunStore } from './import-runs'
import { maskedCell, redactSheet } from './preview'
import { Stepper } from './Stepper'
import styles from './dataport.module.css'

/**
 * Import, as four steps in one dialog — the owner's IA call, and the reason it
 * is a dialog rather than a route.
 *
 * Importing is an **act**, not a place. It starts from wherever the operator
 * already is (a queue toolbar) or from the hub when they went looking for it,
 * and when it finishes they are back where they started with their queue
 * reloaded. A route would have taken them out of their work and left them to
 * find their way back.
 *
 * The four steps are the four decisions, and no more:
 *
 *   1. **File** — and, prominently, the template. Most first-time imports begin
 *      with a download, so the download is on the first screen rather than
 *      hidden behind a link on the hub.
 *   2. **Map** — the auto-mapping, offered for approval. Three real values from
 *      each mapped column sit beside it, because "Contact" mapped to the
 *      alternate number is a mistake nobody spots from a heading alone.
 *   3. **Check** — the whole file validated, trouble first, with the failing
 *      rows downloadable as a sheet to fix and re-upload.
 *   4. **Commit** — behind `<ConfirmGate>`, which states what will be created,
 *      what will be skipped and every default being applied. Cancel writes
 *      nothing.
 *
 * Nothing is written before step four, and step four does not exist for an
 * entity the MVP cannot write. That is the honest gap, stated on screen.
 */

const STEPS = [
  { key: 'file', label: 'File' },
  { key: 'map', label: 'Map columns' },
  { key: 'check', label: 'Check' },
  { key: 'commit', label: 'Commit' },
] as const

type StepKey = (typeof STEPS)[number]['key']

/** Enough to read; a file of ten thousand rows is checked, not scrolled. */
const PREVIEW_LIMIT = 200

const OUTCOME_LABEL: Readonly<Record<RowOutcome, string>> = {
  [ROW_OUTCOMES.ready]: 'Will be created',
  [ROW_OUTCOMES.failed]: 'Cannot be read',
  [ROW_OUTCOMES.duplicateInFile]: 'Repeat in this file',
  [ROW_OUTCOMES.duplicateOnFile]: 'Already on file',
}

const OUTCOME_TONE: Readonly<Record<RowOutcome, Tone>> = {
  [ROW_OUTCOMES.ready]: 'ok',
  [ROW_OUTCOMES.failed]: 'bad',
  // Lime, not amber: a duplicate is not a fault, it is a decision waiting for a
  // person — and the decision the wizard takes is to skip it.
  [ROW_OUTCOMES.duplicateInFile]: 'attn',
  [ROW_OUTCOMES.duplicateOnFile]: 'attn',
}

export type ImportWizardProps = {
  readonly specKey: string
  readonly onClose: () => void
  /** Called after a commit that created something, so a queue behind can reload. */
  readonly onCommitted?: () => void
}

export function ImportWizard({ specKey, onClose, onCommitted }: ImportWizardProps) {
  const repositories = useRepositories()
  const desk = importDesk(repositories)
  const binding = desk.binding(specKey)
  const user = useSessionStore((state) => state.user)
  const runs = useImportRunStore((state) => state.runs)
  const record = useImportRunStore((state) => state.record)

  const [step, setStep] = useState<StepKey>('file')
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [map, setMap] = useState<ColumnMap>({})
  const [receipt, setReceipt] = useState<CommitReceipt | null>(null)
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  const context = useResource<ValidationContext>(
    () => (binding === null ? Promise.resolve({}) : binding.prepare()),
    `dataport:${specKey}`,
  )

  if (binding === null) {
    return (
      <Modal open onClose={onClose} title="Import" size="lg">
        <EmptyState
          variant="error"
          title="There is nothing to import here"
          explanation={`No import is configured for "${specKey}".`}
        />
      </Modal>
    )
  }

  const spec = binding.spec
  const report: ValidationReport | null =
    sheet === null ? null : validateRows(sheet, map, spec, context.data ?? {})

  const missing = missingRequired(map, spec)

  async function readFile(files: File[]) {
    const picked = files[0]
    if (picked === undefined) return
    setReadError(null)
    try {
      const next = await readSheetFromFile(picked)
      setFile(picked)
      setSheet(next)
      setMap(autoMap(next.header, spec).map)
      setStep('map')
    } catch (cause) {
      setFile(null)
      setSheet(null)
      setReadError(cause instanceof Error ? cause.message : 'That file could not be read.')
    }
  }

  async function download(next: Sheet, name: string, format: ExportFormat) {
    const done = await downloadSheet(next, name, format)
    if (!done) setReadError('This browser would not accept the download.')
  }

  async function commit() {
    if (binding === null || binding.commit === null || report === null || user === null) return
    setCommitting(true)
    setCommitError(null)
    try {
      const runId = newRunId(new Date(), runs.length)
      const outcome = await binding.commit(report.verdicts, user.id, runId)
      setReceipt(outcome)
      record({
        id: runId,
        specKey: spec.key,
        specLabel: spec.label,
        fileName: file?.name ?? 'file',
        at: new Date().toISOString(),
        byId: user.id,
        byName: user.name,
        rows: report.counts.total,
        created: outcome.created,
        skipped: outcome.skipped,
        failed: outcome.failures.length,
      })
      if (outcome.created > 0) onCommitted?.()
    } catch (cause) {
      setCommitError(cause instanceof Error ? cause.message : 'The import could not be completed.')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Import ${spec.nounPlural}`}
      description={spec.summary}
      size="lg"
      // Holds an uploaded file and a mapping nobody wants to redo by mis-clicking.
      dismissOnScrimClick={false}
      footer={
        <div className={styles.footer}>
          <Button
            onClick={() => setStep(previousStep(step))}
            disabled={step === 'file' || receipt !== null}
          >
            Back
          </Button>
          <div className={styles.footerEnd}>
            <Button onClick={onClose}>{receipt === null ? 'Cancel' : 'Close'}</Button>
            {step !== 'commit' && receipt === null ? (
              <Button
                variant="primary"
                onClick={() => setStep(nextStep(step))}
                disabled={!canAdvance(step, sheet, missing, report)}
              >
                {step === 'check' ? (spec.writable ? 'Commit' : 'Finish') : 'Continue'}
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className={styles.wizard}>
        <Stepper items={stepsFor(spec)} currentKey={step} />

        {step === 'file' ? (
          <section className={styles.panel}>
            <div className={styles.templateRow}>
              <p className={styles.templateText}>
                Start from the template. It has the exact column headings this importer reads, and
                one worked example row showing the shapes it accepts.
              </p>
              <Button
                icon="doc"
                onClick={() =>
                  void download(
                    templateSheet(spec),
                    templateFileName(spec, EXPORT_FORMATS.xlsx),
                    EXPORT_FORMATS.xlsx,
                  )
                }
              >
                Template (.xlsx)
              </Button>
              <Button
                icon="doc"
                onClick={() =>
                  void download(
                    templateSheet(spec),
                    templateFileName(spec, EXPORT_FORMATS.csv),
                    EXPORT_FORMATS.csv,
                  )
                }
              >
                Template (.csv)
              </Button>
            </div>

            <Field label="Your file" control="group" hint={IMPORT_ACCEPT_HINT}>
              <FileDrop
                accept={IMPORT_ACCEPT}
                prompt="Drop your spreadsheet here"
                onFiles={(files) => void readFile(files)}
                files={file === null ? [] : [file]}
                invalid={readError !== null}
              />
            </Field>

            {readError === null ? null : (
              <p className={styles.problem} role="alert">
                {readError}
              </p>
            )}

            {sheet === null ? null : (
              <p className={styles.note}>
                Read {sheet.header.length} columns and {sheet.rows.length} rows.
              </p>
            )}
          </section>
        ) : null}

        {step === 'map' && sheet !== null ? (
          <MapStep
            sheet={sheet}
            spec={spec}
            map={map}
            missing={missing}
            onChange={(fieldKey, index) => setMap(withMapping(map, fieldKey, index))}
          />
        ) : null}

        {step === 'check' && sheet !== null ? (
          context.error !== null ? (
            <EmptyState
              variant="error"
              title="The records to check against could not be read"
              explanation={context.error.message}
              action={
                <Button variant="primary" size="sm" onClick={context.reload}>
                  Try again
                </Button>
              }
            />
          ) : context.data === null ? (
            <div className={styles.panel} aria-busy="true">
              <Skeleton width="40%" height="1.5rem" />
              <Skeleton width="100%" height="12rem" />
            </div>
          ) : report === null ? null : (
            <CheckStep
              spec={spec}
              sheet={sheet}
              map={map}
              report={report}
              onDownloadErrors={() =>
                void download(
                  errorSheet(redactSheet(sheet, map, spec), report.verdicts),
                  `${spec.key}-rows-to-fix.xlsx`,
                  EXPORT_FORMATS.xlsx,
                )
              }
            />
          )
        ) : null}

        {step === 'commit' && report !== null ? (
          receipt !== null ? (
            <Receipt receipt={receipt} spec={spec} />
          ) : (
            <section className={styles.panel}>
              {commitError === null ? null : (
                <p className={styles.problem} role="alert">
                  {commitError}
                </p>
              )}
              <ConfirmGate
                title={`Create ${report.counts.ready} ${report.counts.ready === 1 ? spec.noun : spec.nounPlural}`}
                changes={commitChanges(spec, map, report)}
                note={
                  <>
                    {spec.commitNote}
                    {report.counts.failed + report.counts.duplicate > 0
                      ? ` ${report.counts.failed + report.counts.duplicate} rows will be skipped and nothing about them is written.`
                      : ''}
                  </>
                }
                confirmLabel={committing ? 'Working' : 'Import'}
                receipt="Import run. The receipt is below."
                onConfirm={() => void commit()}
                onCancel={onClose}
              />
            </section>
          )
        ) : null}

        {step === 'commit' && !spec.writable ? (
          <p className={styles.stated}>{spec.notWritableReason}</p>
        ) : null}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------- steps */

function stepsFor(spec: ImportSpec): readonly { key: string; label: string }[] {
  // An entity that cannot be written has three steps, and the stepper says so
  // from the start rather than dead-ending at a fourth.
  return spec.writable ? STEPS : STEPS.slice(0, 3)
}

function nextStep(step: StepKey): StepKey {
  const index = STEPS.findIndex((entry) => entry.key === step)
  return STEPS[Math.min(index + 1, STEPS.length - 1)]?.key ?? step
}

function previousStep(step: StepKey): StepKey {
  const index = STEPS.findIndex((entry) => entry.key === step)
  return STEPS[Math.max(index - 1, 0)]?.key ?? step
}

function canAdvance(
  step: StepKey,
  sheet: Sheet | null,
  missing: readonly string[],
  report: ValidationReport | null,
): boolean {
  if (step === 'file') return sheet !== null
  if (step === 'map') return missing.length === 0
  if (step === 'check') return (report?.counts.ready ?? 0) > 0
  return false
}

/**
 * Everything the confirmation has to say before anything is written: what will
 * be created, what will not, and every default being applied to a column the
 * file does not carry.
 */
function commitChanges(
  spec: ImportSpec,
  map: ColumnMap,
  report: ValidationReport,
): readonly ConfirmChange[] {
  const changes: ConfirmChange[] = [
    {
      key: 'create',
      label: `New ${spec.nounPlural}`,
      from: 'none',
      to: `${report.counts.ready} created`,
    },
  ]

  if (report.counts.duplicate > 0) {
    changes.push({
      key: 'duplicate',
      label: 'Already on file, or repeated',
      to: `${report.counts.duplicate} skipped, nothing overwritten`,
    })
  }

  if (report.counts.failed > 0) {
    changes.push({
      key: 'failed',
      label: 'Rows that could not be read',
      to: `${report.counts.failed} left out`,
    })
  }

  for (const field of spec.fields) {
    if (field.defaultNote === undefined || map[field.key] !== undefined) continue
    changes.push({ key: `default-${field.key}`, label: field.label, to: field.defaultNote })
  }

  return changes
}

/* --------------------------------------------------------------- map step */

type MapStepProps = {
  readonly sheet: Sheet
  readonly spec: ImportSpec
  readonly map: ColumnMap
  readonly missing: readonly string[]
  readonly onChange: (fieldKey: string, index: number | null) => void
}

function MapStep({ sheet, spec, map, missing, onChange }: MapStepProps) {
  const options = sheet.header.map((heading, index) => ({
    value: String(index),
    label: heading === '' ? `Column ${index + 1}` : heading,
  }))

  const leftOver = sheet.header
    .map((heading, index) => ({ heading, index }))
    .filter(({ index }) => !Object.values(map).includes(index))
    .map(({ heading, index }) => (heading === '' ? `Column ${index + 1}` : heading))

  return (
    <section className={styles.panel}>
      {missing.length > 0 ? (
        <p className={styles.attention}>
          {missing.length === 1 ? 'One required column is' : `${missing.length} required columns are`}{' '}
          not mapped yet:{' '}
          {missing.map((key) => spec.fields.find((field) => field.key === key)?.label ?? key).join(', ')}.
        </p>
      ) : (
        <p className={styles.note}>
          Every required column is mapped. Check the three sample values beside each one — they are
          the first three rows of your file.
        </p>
      )}

      <div className={styles.mapList}>
        {spec.fields.map((field) => (
          <div className={styles.mapRow} key={field.key}>
            <div className={styles.mapField}>
              <span className={styles.mapLabel}>
                {field.label}
                {field.required === true ? <span className={styles.required}>required</span> : null}
              </span>
              {field.help === undefined ? null : <span className={styles.mapHelp}>{field.help}</span>}
            </div>

            <Field label={`Column for ${field.label}`} className={styles.mapField}>
              <Select
                value={map[field.key] === undefined ? '' : String(map[field.key])}
                placeholder="Not mapped"
                options={options}
                invalid={missing.includes(field.key)}
                onChange={(event) =>
                  onChange(field.key, event.target.value === '' ? null : Number(event.target.value))
                }
              />
            </Field>

            <Sample sheet={sheet} field={field} column={map[field.key]} />
          </div>
        ))}
      </div>

      {leftOver.length > 0 ? (
        <p className={styles.note}>
          {leftOver.length} column{leftOver.length === 1 ? '' : 's'} in your file{' '}
          {leftOver.length === 1 ? 'is' : 'are'} not being read: {leftOver.join(', ')}.
        </p>
      ) : null}
    </section>
  )
}

function Sample({
  sheet,
  field,
  column,
}: {
  sheet: Sheet
  field: ImportField
  column: number | undefined
}) {
  if (column === undefined) {
    return <span className={`${styles.sample} ${styles.sampleEmpty}`}>Nothing mapped</span>
  }
  const values = columnSample(sheet, column, 3)
  return (
    <span className={styles.sample}>
      {values.map((value, index) => (
        <span className={styles.sampleValue} key={index}>
          {value === '' ? '—' : maskedCell(field, value)}
        </span>
      ))}
    </span>
  )
}

/* ------------------------------------------------------------- check step */

type CheckStepProps = {
  readonly spec: ImportSpec
  readonly sheet: Sheet
  readonly map: ColumnMap
  readonly report: ValidationReport
  readonly onDownloadErrors: () => void
}

type PreviewRow = { readonly id: string; readonly verdict: RowVerdict }

function CheckStep({ spec, sheet, map, report, onDownloadErrors }: CheckStepProps) {
  const counts = report.counts
  const column = dataTableColumns<PreviewRow>()

  const mappedFields = spec.fields.filter((field) => map[field.key] !== undefined)

  const columns = column.columns([
    column.accessor('id', {
      header: 'Row',
      enableSorting: false,
      cell: ({ row }) => <span className={styles.mono}>{row.original.verdict.rowNumber}</span>,
    }),
    column.accessor('verdict', {
      header: 'Outcome',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={OUTCOME_TONE[row.original.verdict.outcome]}>
          {OUTCOME_LABEL[row.original.verdict.outcome]}
        </StatusPill>
      ),
    }),
    ...mappedFields.map((field) =>
      column.display({
        id: `field-${field.key}`,
        header: field.label,
        cell: ({ row }: { row: { original: PreviewRow } }) => {
          const at = map[field.key]
          const raw = at === undefined ? '' : (row.original.verdict.cells[at] ?? '')
          const failed = row.original.verdict.errors.some((issue) => issue.fieldKey === field.key)
          return (
            <span className={failed ? styles.cellError : undefined}>
              {raw === '' ? '—' : maskedCell(field, raw)}
            </span>
          )
        },
      }),
    ),
    column.display({
      id: 'reasons',
      header: 'What to fix',
      cell: ({ row }: { row: { original: PreviewRow } }) => {
        const issues = [...row.original.verdict.errors, ...row.original.verdict.warnings]
        if (issues.length === 0) return '—'
        return (
          <span className={styles.reasons}>
            {issues.map((issue, index) => (
              <span key={index}>{issue.message}</span>
            ))}
          </span>
        )
      },
    }),
  ])

  const rows: PreviewRow[] = troubleFirst(report.verdicts)
    .slice(0, PREVIEW_LIMIT)
    .map((verdict) => ({ id: `row-${verdict.rowNumber}`, verdict }))

  return (
    <section className={styles.panel}>
      <div className={styles.summary}>
        <span className={styles.summaryItem}>
          <span className={styles.summaryFigure}>{counts.ready}</span>
          <span className={styles.summaryLabel}>ready</span>
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryFigure}>{counts.failed}</span>
          <span className={styles.summaryLabel}>
            {counts.failed === 1 ? 'row with errors' : 'rows with errors'}
          </span>
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryFigure}>{counts.duplicate}</span>
          <span className={styles.summaryLabel}>already on file or repeated</span>
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryLabel}>
            of {counts.total} rows read from {sheet.name}
          </span>
        </span>
      </div>

      {spec.writable ? null : (
        <p className={styles.stated}>{spec.notWritableReason}</p>
      )}

      {counts.failed > 0 ? (
        <div className={styles.attention}>
          <span>
            {counts.failed} {counts.failed === 1 ? 'row cannot' : 'rows cannot'} be read. Download
            them, fix them in Excel and upload that file — its headings map straight back.
          </span>
          <span>
            <Button size="sm" icon="doc" onClick={onDownloadErrors}>
              Download the rows to fix
            </Button>
          </span>
        </div>
      ) : null}

      <div className={styles.previewFrame}>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          label="Rows read from your file"
          stickyHeader
          empty={
            <EmptyState
              title="Nothing to check"
              explanation="This file has a heading row and no data rows under it."
            />
          }
        />
      </div>

      {report.verdicts.length > PREVIEW_LIMIT ? (
        <p className={styles.note}>
          Showing the first {PREVIEW_LIMIT} rows, trouble first. All {report.verdicts.length} were
          checked.
        </p>
      ) : null}
    </section>
  )
}

/* ---------------------------------------------------------------- receipt */

function Receipt({ receipt, spec }: { receipt: CommitReceipt; spec: ImportSpec }): ReactNode {
  return (
    <section className={styles.receipt} role="status">
      <div className={styles.receiptCounts}>
        <span className={styles.summaryItem}>
          <span className={styles.summaryFigure}>{receipt.created}</span>
          <span className={styles.summaryLabel}>
            {receipt.created === 1 ? spec.noun : spec.nounPlural} created
          </span>
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryFigure}>{receipt.skipped}</span>
          <span className={styles.summaryLabel}>skipped</span>
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryFigure}>{receipt.failures.length}</span>
          <span className={styles.summaryLabel}>refused</span>
        </span>
      </div>

      {receipt.failures.length > 0 ? (
        <ul className={styles.failures}>
          {receipt.failures.map((failure) => (
            <li key={failure.rowNumber}>
              Row {failure.rowNumber}: {failure.reason}
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.note}>
        This run is on the import history at /import, with who ran it and when.
      </p>
    </section>
  )
}

export default ImportWizard
