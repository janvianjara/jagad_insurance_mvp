import { CLOCK_STEPS, useInquiryClockOffsetMinutes, useInquiryClockStore, useInquiryNow } from './clock'
import { Button } from '../../ui/Button'
import { DateTime } from '../../ui/type'
import styles from './DevClock.module.css'

/**
 * The demo clock — dev builds only.
 *
 * A TAT that lapses after an hour cannot be shown in a walkthrough by waiting an
 * hour. This pushes the module's clock forward so the countdown, the stripe, the
 * pin order and the reassign action all cross their thresholds while somebody is
 * watching.
 *
 * It moves the *reading*, never a record. Advancing the clock and then assigning
 * writes the advanced instant as the assignment time, which is exactly what
 * would have happened had the demo been run an hour later, and nothing is
 * back-dated behind the machine's back.
 *
 * `import.meta.env.DEV` is a literal at build time, so in a production build the
 * branch below collapses and this control is not in the bundle.
 */
export function DevClock({ className }: { className?: string }) {
  const advanceMinutes = useInquiryClockStore((state) => state.advanceMinutes)
  const reset = useInquiryClockStore((state) => state.reset)
  const offsetMinutes = useInquiryClockOffsetMinutes()
  const now = useInquiryNow()

  if (!import.meta.env.DEV) return null

  return (
    <div
      className={[styles.dev, className].filter(Boolean).join(' ')}
      role="group"
      aria-label="Demo clock"
    >
      <p className={styles.reading}>
        <span className={styles.caption}>Demo clock</span>
        <DateTime className={styles.stamp} value={now} mode="datetime" />
        {offsetMinutes === 0 ? null : (
          <span className={styles.offset}>{`+${offsetMinutes} min ahead`}</span>
        )}
      </p>
      <div className={styles.steps}>
        {CLOCK_STEPS.map((minutes) => (
          <Button key={minutes} size="sm" onClick={() => advanceMinutes(minutes)}>
            {minutes < 60 ? `+${minutes} min` : `+${minutes / 60} hr`}
          </Button>
        ))}
        <Button
          size="sm"
          icon="close"
          label="Reset clock"
          title="Reset clock"
          onClick={reset}
          disabled={offsetMinutes === 0}
        />
      </div>
    </div>
  )
}
