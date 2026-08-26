import { useLocation } from 'react-router'
import { EmptyState } from '../../ui/data'
import { PageHeader } from '../AppShell/PageHeader'
import type { Phase } from './phase'
import styles from './PlannedScreen.module.css'

export type PlannedScreenProps = {
  /** What this screen will be called once it exists. */
  title: string
  /** The playbook step that will build it, when one owns it. */
  step?: string
  phase: Phase
  /** One line of what the screen will do, from the plan's page inventory. */
  note?: string
}

function owner(step: string | undefined, phase: Phase): string {
  if (step) return `Built by playbook step ${step}.`
  if (phase === 'M0') return 'In the M0 slice; no playbook step has claimed it yet.'
  return `Planned for phase ${phase}, after the M0 slice.`
}

/**
 * The stub behind every route the plan names and no step has built yet.
 *
 * It exists so navigation is complete from the first day: a person can walk the
 * whole information architecture, an escalation notice can link at a screen that
 * does not exist yet, and nobody meets a blank page or a 404 for something the
 * plan promises. The screen says which step owns it, so the stub is also a
 * to-do list that cannot drift from the router.
 */
export default function PlannedScreen({ title, step, phase, note }: PlannedScreenProps) {
  const location = useLocation()

  return (
    <>
      <PageHeader title={title} meta={<span className={styles.phase}>{phase}</span>} />
      <div className={styles.body}>
        <EmptyState
          variant="empty"
          icon="book"
          title={`${title} is not built yet`}
          explanation={`${note ? `${note} ` : ''}${owner(step, phase)} The route is registered so the rail, the guards and every link to it already work.`}
        />
        <p className={styles.path}>{location.pathname}</p>
      </div>
    </>
  )
}
