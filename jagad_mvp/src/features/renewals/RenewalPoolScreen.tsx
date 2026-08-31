import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Icon } from '../../ui/Icon'
import { Skeleton } from '../../ui/data'
import { useRenewalNow } from './clock'
import { renewalDesk } from './data/renewal-desk'
import { loadPoolSource } from './pool-source'
import { renewalPoolConfig } from './queue-config'
import { readLeadDays } from './lead-days'
import styles from './RenewalPool.module.css'

/**
 * The renewal pull pool (plan §5 "Renewal pool", §4 `/renewals`).
 *
 * The screen assembles the desk's two kinds of due item and hands them to
 * `<WorkQueue>`. Above the table sits the one thing a row cannot say for itself:
 * that this queue holds two clocks, and that an instalment appearing here is not
 * a policy about to expire. §9 asks for the distinction to be visible, and a
 * queue that only encoded it in a colour would be relying on somebody having
 * been told what the colour meant.
 *
 * The lead time is read from the `renewal.schedule` recipe an admin edits. There
 * is no day count in this file.
 */
export function RenewalPoolScreen() {
  const repositories = useRepositories()
  const user = useSessionStore((state) => state.user)
  const now = useRenewalNow()
  const desk = renewalDesk(repositories)

  const context = useResource(async () => {
    const [source, users, recipes] = await Promise.all([
      loadPoolSource(repositories, desk),
      repositories.config.users(),
      repositories.config.recipes(),
    ])
    return { source, users, leadDays: readLeadDays(recipes) }
  }, 'renewals:pool')

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="100%" height="12rem" />
      </div>
    )
  }

  const { source, users, leadDays } = context.data

  const config = renewalPoolConfig({
    desk,
    rows: source.rows,
    users,
    now,
    actorId: user.id,
    leadDays,
    canWork: can(user, 'edit', 'renewals'),
  })

  return (
    <WorkQueue config={config}>
      <div className={styles.primer} role="note">
        <Icon name="alert" size="md" />
        <div>
          <p className={styles.primerTitle}>Two clocks run on this desk, and they are not the same</p>
          <p className={styles.primerNote}>
            A renewal is a policy whose term ends — after that date nothing is covered. An instalment
            due is a payment falling inside a term that is still running: the policy is in force and
            it is not expiring. Every row says which it is, and only renewals can be taken from the
            pool.
          </p>
        </div>
      </div>
    </WorkQueue>
  )
}

export default RenewalPoolScreen
