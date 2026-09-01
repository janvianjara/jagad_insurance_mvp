import { Link } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
// The header only, by its own path. Importing it from the AppShell index would
// pull the whole shell — and the Assistant panel it mounts — into a screen that
// needs a title bar. `<WorkQueue>` reaches for it the same way.
import { PageHeader } from '../../components/AppShell/PageHeader'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Icon } from '../../ui/Icon'
import { Badge } from '../../ui/signal'
import { opsDesk } from './data/ops-desk'
import { OPS_QUEUES } from './queues'
import type { OpsQueue } from './queues'
import styles from './BackOffice.module.css'

/**
 * `/back-office` — FR-08.1's "six ops queues in one view" (plan §5, §4).
 *
 * This is the M0 route no playbook step ever claimed, and the reason it stayed a
 * stub is that most of it was already built somewhere else: P-14 built KYC
 * completion, P-15 built draft completion and the deals worklist that entry is
 * read from. So the honest shape of this screen is a signpost, not a sixth
 * queue — it gathers, it does not replace.
 *
 * What that means concretely, and what to keep true if this is edited:
 *
 *   - there is no table here and there must not be. Every list in the product is
 *     a configured `<WorkQueue>` on the screen that owns it; a seventh list on
 *     this page would be a second definition of somebody else's queue, free to
 *     drift from it;
 *   - a tile's number and its link are built from the same state set in
 *     `queues.ts`, so opening a tile shows exactly the rows it counted;
 *   - a queue whose screen belongs to a later phase still shows its live depth,
 *     and says plainly where that screen will live. The records exist; only the
 *     screen does not, and a tile that hid the number would be hiding real work.
 *
 * Nothing on this screen writes, so there is no `<ConfirmGate>` on it: the work
 * is done on the queue that owns it, beside the record it is about.
 */
export function BackOfficeHomeScreen() {
  const repositories = useRepositories()
  const desk = opsDesk(repositories)
  const board = useResource(() => desk.board(), 'back-office:board')

  if (board.error) {
    return (
      <div className={styles.screen}>
        <EmptyState
          variant="error"
          title="The ops board could not be loaded"
          explanation={board.error.message}
          action={
            <Button variant="primary" size="sm" onClick={board.reload}>
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  const depths = board.data?.depths ?? null

  return (
    <div className={styles.screen}>
      <PageHeader
        title="Back office"
        meta={
          board.data ? (
            <Badge tone={board.data.waiting > 0 ? 'attn' : 'ok'} icon="inbox">
              {board.data.waiting === 1
                ? '1 item waiting across six queues'
                : `${board.data.waiting} items waiting across six queues`}
            </Badge>
          ) : null
        }
      />

      <ul className={styles.grid} aria-label="Operations queues">
        {OPS_QUEUES.map((queue) => (
          <li key={queue.key} className={styles.cell}>
            <QueueTile
              queue={queue}
              depth={depths === null ? null : depths[queue.key]}
              loading={board.isLoading}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

type QueueTileProps = {
  queue: OpsQueue
  /** Null while the board is still being read. Zero is a real answer. */
  depth: number | null
  loading: boolean
}

/**
 * One queue, as a tile.
 *
 * A tile with a screen behind it is a link and nothing else — no button, no
 * menu, no action. A tile without one is a plain region that names the address
 * §4 reserves and the phase that builds it, so the gap reads as "not yet"
 * rather than as "broken".
 */
function QueueTile({ queue, depth, loading }: QueueTileProps) {
  const waiting = depth !== null && depth > 0

  const body = (
    <>
      <span className={styles.tileHead}>
        <Icon name={queue.icon} size="md" className={styles.tileIcon} />
        <span className={styles.tileTitle}>{queue.title}</span>
      </span>

      {loading || depth === null ? (
        <Skeleton width="3ch" height="var(--text-2xl)" />
      ) : (
        <span className={styles.tileCount} data-waiting={waiting ? '' : undefined}>
          {depth}
          <span className={styles.tileCountUnit}>waiting</span>
        </span>
      )}

      {queue.href ? (
        <span className={styles.tileGo}>
          Open the queue
          <Icon name="chevron-right" size="sm" />
        </span>
      ) : (
        <span className={styles.tilePlanned}>
          No screen yet — {queue.address} is {queue.phase}. The rows are on the books already.
        </span>
      )}
    </>
  )

  if (queue.href) {
    return (
      <Link className={styles.tile} to={queue.href} data-tone={waiting ? 'attn' : undefined}>
        {body}
      </Link>
    )
  }

  return (
    <div className={styles.tile} data-planned="" data-tone={waiting ? 'attn' : undefined}>
      {body}
    </div>
  )
}

export default BackOfficeHomeScreen
