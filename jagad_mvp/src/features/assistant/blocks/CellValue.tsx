import { Clock, StatusPill } from '../../../ui/signal'
import { DateTime, Money, RecordId } from '../../../ui/type'
import type { Cell } from './blocks'
import styles from './BlockRenderer.module.css'

/**
 * The render edge for one recorded value — the only place a `Cell` is formatted.
 *
 * Everything above this file works in recorded values: paise, ISO strings,
 * `systemNo` plus `insurerNo`. Everything below it is a `src/ui` primitive that
 * already knows how to draw one. That split is what keeps the money invariant
 * structural: a block cannot carry a formatted amount, so no amount can be
 * produced on the way to a screen.
 *
 * It sits in its own module because a produced document formats the same values
 * as a feed block, and a second copy of this function would be a second place a
 * figure could be rendered differently from the one a person read in the answer.
 */
export function CellValue({ cell }: { cell: Cell }) {
  if (cell.cell === 'text') return <span className={styles.text}>{cell.value}</span>

  if (cell.cell === 'id') {
    return <RecordId systemNo={cell.systemNo} insurerNo={cell.insurerNo} showInsurer={false} />
  }

  if (cell.cell === 'money') return <Money paise={cell.paise} showPaise={false} />

  if (cell.cell === 'date') return <DateTime value={cell.value} mode={cell.mode ?? 'date'} />

  if (cell.cell === 'status') {
    return (
      <StatusPill tone={cell.tone} size="sm">
        {cell.value}
      </StatusPill>
    )
  }

  // A turnaround clock cannot be drawn without the allowance it is measured
  // against, so the block has to have carried one.
  if (cell.mode === 'tat') {
    return (
      <Clock mode="tat" start={cell.start} durationMs={cell.durationMs ?? 0} label={cell.label} />
    )
  }

  return (
    <Clock
      mode="aging"
      start={cell.start}
      {...(cell.durationMs === undefined ? {} : { durationMs: cell.durationMs })}
      label={cell.label}
    />
  )
}
