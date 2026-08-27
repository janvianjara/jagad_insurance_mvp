import { useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { Input, RadioGroup } from '../../ui/form'
import type { RadioOption } from '../../ui/form'
import { Icon } from '../../ui/Icon'
import { Tag } from '../../ui/signal'
import { Money as AmountText } from '../../ui/type'
import { RecordOnlyAmount } from '../guardrails'
import { PREMIUM_MODES } from '../../domain/workflows'
import type { PremiumMode } from '../../domain/workflows'
import type { Money } from '../../domain/money'
import {
  addAdHocRow,
  columnsMissingPremium,
  matrixReadyToGenerate,
  premiumStopMessage,
  removeRow,
  setCellValue,
  setColumnPremium,
  setPremiumMode,
} from './matrix-model'
import type { MatrixColumn, MatrixDraft } from './matrix-model'
import { cx } from './cx'
import styles from './BenefitMatrix.module.css'

export type BenefitMatrixProps = {
  /** The whole editable state. The component holds none of its own. */
  draft: MatrixDraft
  /** Called with the next draft. The component never mutates the one it was given. */
  onDraftChange: (draft: MatrixDraft) => void
  /** A locked prior version: every cell and figure renders as text. */
  readOnly?: boolean
  /** Names the grid for a screen reader, and prints above it. */
  caption?: ReactNode
  className?: string
}

/**
 * Premium mode, in the order a person picks it, with Single last because it is
 * the exception. The labels live here rather than in the model because they are
 * wording, and `PREMIUM_MODES` is the domain's own list — a mode added there
 * fails this record's exhaustiveness check rather than quietly disappearing.
 */
const PREMIUM_MODE_LABELS: Record<PremiumMode, string> = {
  [PREMIUM_MODES.annual]: 'Annual',
  [PREMIUM_MODES.halfYearly]: 'Half-yearly',
  [PREMIUM_MODES.quarterly]: 'Quarterly',
  [PREMIUM_MODES.monthly]: 'Monthly',
  [PREMIUM_MODES.single]: 'Single',
}

const PREMIUM_MODE_ORDER: readonly PremiumMode[] = [
  PREMIUM_MODES.annual,
  PREMIUM_MODES.halfYearly,
  PREMIUM_MODES.quarterly,
  PREMIUM_MODES.monthly,
  PREMIUM_MODES.single,
]

const PREMIUM_MODE_OPTIONS: readonly RadioOption[] = PREMIUM_MODE_ORDER.map((mode) => ({
  value: mode,
  label: PREMIUM_MODE_LABELS[mode],
}))

/** D-A, said out loud on the screen where somebody might otherwise assume otherwise. */
const MODE_NOTE =
  'Informational on a quotation. Changing it does not scale, split or alter any figure below.'

const PREMIUM_ROW_LABEL = 'Final Payable Premium'

function columnHeadId(base: string, columnKey: string): string {
  return `${base}-col-${columnKey}`
}

/**
 * The comparison grid (plan §5 Composer, §6 `BenefitMatrix`, canvas 2.1-2.3).
 *
 * Controlled and repository-free: it takes a `MatrixDraft`, renders it, and hands
 * back the result of a `matrix-model` helper on every edit. The screen above owns
 * loading, saving, versioning and the Generate button; this component owns what a
 * person sees and touches, and one promise:
 *
 *   Final Payable Premium enters through `<RecordOnlyAmount>` and through nothing
 *   else. No keystroke in a benefit cell, no ad-hoc row, no premium-mode change
 *   puts a figure in a premium control, and there is no code path in this folder
 *   that could — `BenefitMatrix.test.tsx` reads this file's own source and fails
 *   if an auto-fill prop ever appears on that control (D3).
 *
 * The stop is rendered rather than merely enforced: while a column has no figure,
 * the same sentence §9's refusal would carry is on screen, and `data-ready` on the
 * root says so in the DOM so the screen and its tests read one answer, not two.
 */
export function BenefitMatrix({
  draft,
  onDraftChange,
  readOnly = false,
  caption,
  className,
}: BenefitMatrixProps) {
  const base = useId()
  const [adHocLabel, setAdHocLabel] = useState('')

  const missing = columnsMissingPremium(draft)
  const ready = matrixReadyToGenerate(draft)
  const stop = premiumStopMessage(draft)

  function addRow() {
    const next = addAdHocRow(draft, adHocLabel)
    if (next === draft) return
    setAdHocLabel('')
    onDraftChange(next)
  }

  function handleAdHocKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    // Enter in a bare text input would submit whatever form the screen wrapped
    // around us; adding a row is the intent here, so take the key.
    event.preventDefault()
    addRow()
  }

  return (
    <section
      className={cx(styles.matrix, className)}
      data-benefit-matrix=""
      data-ready={ready ? 'true' : 'false'}
      data-readonly={readOnly ? 'true' : undefined}
      data-missing-premium={missing.map((column) => column.columnKey).join(' ')}
    >
      {caption ? <h3 className={styles.caption}>{caption}</h3> : null}

      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.tableCaption}>
            Benefit comparison across the quoted companies and products.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.rowHead}>
                Benefit
              </th>
              {draft.columns.map((column) => (
                <th
                  key={column.columnKey}
                  scope="col"
                  id={columnHeadId(base, column.columnKey)}
                  className={styles.colHead}
                  data-matrix-column={column.columnKey}
                >
                  <span className={styles.colLabel}>{column.label}</span>
                  <span className={styles.colMeta}>
                    {column.companyName} · {column.productName}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {draft.rows.map((row) => (
              <tr key={row.key} data-matrix-row={row.key} data-adhoc={row.adHoc ? 'true' : undefined}>
                <th scope="row" className={styles.rowHead}>
                  <span className={styles.rowLabel}>{row.label}</span>
                  {row.adHoc ? (
                    <span className={styles.rowMarks}>
                      <Tag tone="attn">This quotation only</Tag>
                      {readOnly ? null : (
                        <Button
                          variant="quiet"
                          size="sm"
                          icon="close"
                          label={`Remove row: ${row.label}`}
                          onClick={() => onDraftChange(removeRow(draft, row.key))}
                        />
                      )}
                    </span>
                  ) : null}
                </th>
                {draft.columns.map((column) => {
                  const value = draft.values[row.key]?.[column.columnKey] ?? ''
                  return (
                    <td
                      key={column.columnKey}
                      className={styles.cell}
                      data-matrix-cell={`${row.key}:${column.columnKey}`}
                    >
                      {readOnly ? (
                        <span className={styles.readValue}>
                          {value === '' ? <span className={styles.absent}>not covered</span> : value}
                        </span>
                      ) : (
                        <Input
                          value={value}
                          aria-label={`${row.label} — ${column.label}`}
                          autoComplete="off"
                          onChange={(event) =>
                            onDraftChange(
                              setCellValue(draft, row.key, column.columnKey, event.target.value),
                            )
                          }
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}

            {readOnly ? null : (
              <tr className={styles.adHocRow} data-adhoc-add="">
                <th scope="row" className={styles.rowHead}>
                  <span className={styles.adHocEntry}>
                    <Input
                      value={adHocLabel}
                      aria-label="Add a benefit for this quotation only"
                      placeholder="Add a benefit row"
                      autoComplete="off"
                      onChange={(event) => setAdHocLabel(event.target.value)}
                      onKeyDown={handleAdHocKeyDown}
                    />
                    <Button variant="quiet" size="sm" icon="plus" onClick={addRow}>
                      Add row
                    </Button>
                  </span>
                </th>
                <td className={styles.adHocNote} colSpan={Math.max(draft.columns.length, 1)}>
                  Added here, this benefit lives on this quotation only. The benefit catalogue is
                  not changed.
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr className={styles.modeRow} data-premium-mode-row="">
              <th scope="row" className={styles.rowHead}>
                Premium mode
              </th>
              <td className={styles.modeCell} colSpan={Math.max(draft.columns.length, 1)}>
                {readOnly ? (
                  <span className={styles.readValue} data-premium-mode={draft.premiumMode}>
                    {PREMIUM_MODE_LABELS[draft.premiumMode]}
                  </span>
                ) : (
                  <RadioGroup
                    name={`${base}-premium-mode`}
                    label="Premium mode"
                    orientation="horizontal"
                    options={PREMIUM_MODE_OPTIONS}
                    value={draft.premiumMode}
                    onValueChange={(value) =>
                      onDraftChange(setPremiumMode(draft, value as PremiumMode))
                    }
                  />
                )}
                <p className={styles.modeNote}>{MODE_NOTE}</p>
              </td>
            </tr>

            <tr className={styles.premiumRow} data-premium-row="">
              <th scope="row" className={styles.rowHead}>
                {PREMIUM_ROW_LABEL}
              </th>
              {draft.columns.map((column) => (
                <td
                  key={column.columnKey}
                  className={styles.premiumCell}
                  data-premium-cell={column.columnKey}
                  data-recorded={draft.premiums[column.columnKey] ? 'true' : 'false'}
                >
                  {readOnly ? (
                    <PremiumText amount={draft.premiums[column.columnKey] ?? null} />
                  ) : (
                    <RecordOnlyAmount
                      label={`${PREMIUM_ROW_LABEL} — ${column.label}`}
                      value={draft.premiums[column.columnKey] ?? null}
                      onValueChange={(amount) =>
                        onDraftChange(setColumnPremium(draft, column.columnKey, amount))
                      }
                      required
                    />
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <PremiumStop message={stop} ready={ready} columns={missing} />
    </section>
  )
}

/** A recorded figure, read back. It formats; it does not produce. */
function PremiumText({ amount }: { amount: Money | null }) {
  return <AmountText paise={amount ? amount.paise : null} emphasis="strong" absentText="not recorded" />
}

/**
 * The stop, on screen.
 *
 * `premiumStopMessage` is the same function §9's generate guard reads, so the
 * reason a person sees here is word for word the reason the machine would refuse
 * with. When nothing is missing the row still renders, positively, because a
 * check that only appears when it fails teaches nobody what it checks.
 */
function PremiumStop({
  message,
  ready,
  columns,
}: {
  message: string | null
  ready: boolean
  columns: readonly MatrixColumn[]
}) {
  if (ready) {
    return (
      <p className={styles.stop} data-premium-stop="" data-state="ready" role="status">
        <Icon name="check" size="sm" />
        <span>Final Payable Premium is recorded for every column.</span>
      </p>
    )
  }

  return (
    <p
      className={styles.stop}
      data-premium-stop=""
      data-state="blocked"
      data-missing-count={columns.length}
      role="status"
    >
      <Icon name="alert" size="sm" />
      <span>{message}</span>
    </p>
  )
}
