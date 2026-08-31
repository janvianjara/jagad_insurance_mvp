import { Badge } from '../../../ui/signal'
import type { ScheduleNote } from '../../../data/automation'
import { activityOf } from './run-stats'
import type { RecipeActivity } from './run-stats'
import { DateTime } from '../../../ui/type'
import layout from '../shared/config-layout.module.css'
import styles from './automation.module.css'

/**
 * The sweeps the clock owns — the time half of FR-21, above the recipe library.
 *
 * These three have no row in the recipe list and that is deliberate rather than
 * an omission. A recipe exists to hold configuration; these hold none. The
 * consent cadence is one constant shared with the KYC chase screen, and the
 * other two read a deadline the record already carries — an inquiry's `tatDueAt`,
 * a task's `dueAt`. There is nothing for an admin to set, so putting them in an
 * editor would be inventing knobs to justify a row.
 *
 * They are shown anyway, because "nothing fires on time" was the complaint and a
 * screen that lists twelve configurable recipes while silently running three
 * sweeps beside them answers it only halfway.
 */
export function Schedules({
  schedules,
  activity,
}: {
  readonly schedules: readonly ScheduleNote[]
  readonly activity: Readonly<Record<string, RecipeActivity>>
}) {
  return (
    <section className={styles.schedules} aria-label="Clock schedules">
      <h2 className={styles.schedulesTitle}>What the clock does on its own</h2>
      <p className={styles.hint}>
        {
          'Three sweeps run on every evaluation. They take no parameters — each reads a deadline the record already carries, or a constant shared with the screen that enforces it — so there is nothing here to configure and nothing to default. Their runs are in the run log beside every recipe.'
        }
      </p>
      <ul className={styles.rows}>
        {schedules.map((schedule) => {
          const seen = activityOf(activity, schedule.key)
          return (
            <li className={styles.schedule} key={schedule.key}>
              <div className={styles.parameterHead}>
                <span>{schedule.label}</span>
                <span className={styles.chips}>
                  <Badge tone="neutral" caps>
                    {schedule.emits}
                  </Badge>
                  {seen.fired === 0 ? (
                    <Badge tone="idle">Nothing due yet</Badge>
                  ) : (
                    <Badge tone="ok">{`${seen.fired} fired`}</Badge>
                  )}
                </span>
              </div>
              <p className={layout.muted}>
                {schedule.reads}
                {seen.lastFiredAt === null ? null : (
                  <>
                    {' Last fired '}
                    <DateTime value={seen.lastFiredAt} mode="datetime" />
                    {'.'}
                  </>
                )}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
