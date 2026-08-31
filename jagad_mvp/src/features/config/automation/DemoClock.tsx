import { useState } from 'react'
import { Button } from '../../../ui/Button'
import { DateTime } from '../../../ui/type'
import { useToaster } from '../../../ui/surface'
import type { AutomationRuntime } from '../../../data/automation'
import { useAutomationNow } from './clock'
import styles from './automation.module.css'

/**
 * Advance the clock — dev builds only.
 *
 * A renewal ladder whose first rung is forty-five days before expiry cannot be
 * shown in a walkthrough by waiting forty-five days. This pushes the ENGINE's
 * clock forward and runs one evaluation, so the rungs that have now passed fire
 * into the run log while somebody is watching. That is the only honest way to
 * demonstrate a scheduler: not a mock row, the real evaluator answering the same
 * question at a later instant.
 *
 * It moves the reading, never a record. The engine's `advance` adds an offset to
 * the instant it asks about and then evaluates; every run it writes is stamped
 * with that instant, which is exactly what would have been written had the demo
 * been run a month later. Nothing is back-dated behind a machine's back, and the
 * offset never goes backwards — a run recorded in the future is a row nobody can
 * reason about.
 *
 * `import.meta.env.DEV` is a literal at build time, so in a production build the
 * branch below collapses and this control is not in the bundle. It follows
 * `DevClock` in `src/features/inquiries` deliberately: a presenter should find
 * the same affordance in the same shape wherever the product hides one.
 */

/** Steps the control offers, in days. Ladder rungs sit at 45, 30, 15, 7 and 1. */
const CLOCK_STEPS = [1, 7, 30] as const

export function DemoClock({ runtime, onTicked }: {
  readonly runtime: AutomationRuntime | null
  readonly onTicked: () => void
}) {
  const now = useAutomationNow()
  const toaster = useToaster()
  const [running, setRunning] = useState(false)

  if (!import.meta.env.DEV) return null

  const offsetDays = runtime?.offsetDays() ?? 0

  async function advance(days: number) {
    if (runtime === null) return
    setRunning(true)
    try {
      const report = await runtime.advance(days)
      const fired = report.triggers.length
      toaster.notify({
        title: report.quiet ? 'Held: quiet hours' : `${fired} trigger${fired === 1 ? '' : 's'} fired`,
        detail: report.quiet
          ? 'The engine emitted its tick and stopped there. The rungs are still passed when the window closes.'
          : report.triggers.join(', ') || 'Nothing was due at that instant.',
        tone: fired > 0 ? 'ok' : 'info',
      })
      onTicked()
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className={styles.demo} role="group" aria-label="Demo clock">
      <p className={styles.demoReading}>
        <span className={styles.demoCaption}>Demo clock</span>
        <DateTime className={styles.demoStamp} value={now} mode="datetime" />
        {offsetDays === 0 ? null : (
          <span className={styles.demoOffset}>{`+${offsetDays} days ahead`}</span>
        )}
      </p>
      <div className={styles.chips}>
        {CLOCK_STEPS.map((days) => (
          <Button
            key={days}
            size="sm"
            disabled={runtime === null || running}
            onClick={() => void advance(days)}
          >
            {`+${days} day${days === 1 ? '' : 's'}`}
          </Button>
        ))}
        <Button
          size="sm"
          variant="quiet"
          disabled={runtime === null || running}
          onClick={() => void advance(0)}
        >
          Evaluate now
        </Button>
      </div>
      <p className={styles.demoNote}>
        {runtime === null
          ? 'No engine is running on this page, so there is nothing to advance.'
          : 'Dev builds only. Moves the engine forward and runs one evaluation; whatever is due fires into the run log.'}
      </p>
    </div>
  )
}
