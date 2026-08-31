import { useSearchParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Icon } from '../../ui/Icon'
import { DateTime } from '../../ui/type'
import { useDocumentNow } from './clock'
import { documentVault, loadVaultSubjects } from './data/vault'
import { vaultQueueConfig } from './queue-config'
import styles from './Documents.module.css'

/**
 * `/documents` — plan §5's "Document vault" row, §14.1.
 *
 * Two things happen here that do not happen in any other queue screen, and both
 * are the requirement rather than a flourish.
 *
 * **Every open is logged, and the log is what makes the open.** A row opens in
 * the shell's drawer, which `<WorkQueue>` addresses as `?record=`. That
 * parameter is therefore the only definition of "a document is open" on this
 * screen, so the screen watches it: `useResource`, keyed on the record id, calls
 * `vault.open(...)`, which writes an access entry and returns the document. One
 * key change, one load, one entry. Closing the drawer moves the key to `none`;
 * opening the same document again is a new key and a new entry, which is
 * correct — it is a second open.
 *
 * The log is not hidden from the person it is about. This session's opens are
 * listed above the table, and the drawer shows the same document's own history,
 * because a log people are surprised by is a log that gets worked around.
 *
 * **The ACL is a record-level test, not a route guard.** `RequireAccess` on the
 * route decides whether this screen opens at all; which documents are in it is
 * decided per row by `can()` against the SUBJECT's attributes — a document has
 * no owner of its own. `loadVaultSubjects` resolves those once, and an
 * unresolved subject fails closed. See `data/vault.ts`.
 *
 * Nothing on this screen writes to a document. Verification, rejection and OCR
 * review are the back office's own queues, behind their own guards; the vault
 * finds a paper and says what state it is in.
 */
export function DocumentVaultScreen() {
  const repositories = useRepositories()
  const vault = documentVault(repositories)
  const user = useSessionStore((state) => state.user)
  const now = useDocumentNow()
  const [params] = useSearchParams()

  const context = useResource(async () => {
    const [subjects, retentionClasses, users] = await Promise.all([
      loadVaultSubjects(repositories),
      repositories.config.retentionClasses(),
      repositories.config.users(),
    ])
    return { subjects, retentionClasses, users }
  }, 'documents:context')

  // The open, as an effect of the address. `record` is the only thing that says
  // a document is open, so it is the only thing this reads.
  const openId = params.get('record')
  const opened = useResource(async () => {
    if (!openId || !user || !context.data) return null
    return vault.open(user, context.data.subjects, openId, { actorId: user.id, now })
  }, `documents:open:${openId ?? 'none'}:${context.data ? 'ready' : 'waiting'}`)

  if (context.error) {
    return (
      <div className={styles.screen}>
        <EmptyState
          variant="error"
          title="The vault could not be loaded"
          explanation={context.error.message}
          action={
            <Button variant="primary" size="sm" onClick={context.reload}>
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="20rem" />
      </div>
    )
  }

  // Reading it back through the vault rather than holding it in state: the log
  // is the vault's, and a screen-local copy could show an open the log did not
  // record. `opened` is read so the effect above is not dead code to a compiler
  // that cannot see the write it performs.
  const { subjects, retentionClasses, users } = context.data
  const session = vault.accessLog()
  const refused = openId !== null && opened.status === 'ready' && opened.data === null

  return (
    <WorkQueue
      config={vaultQueueConfig({
        vault,
        user,
        subjects,
        retentionClasses,
        users,
        now,
      })}
    >
      {refused ? (
        <p className={styles.refused} role="alert">
          <Icon name="lock" size="md" />
          That document is outside your access, so it was not opened and nothing was recorded
          against it.
        </p>
      ) : null}

      <details className={styles.sessionLog}>
        <summary className={styles.sessionSummary}>
          Access log — {session.length} {session.length === 1 ? 'open' : 'opens'} recorded in this
          session
        </summary>
        {session.length === 0 ? (
          <p className={styles.note}>
            Nothing has been opened yet. Every open of every document is recorded against the person
            who opened it, and the entry says that metadata was shown rather than the file.
          </p>
        ) : (
          <ul className={styles.accessList}>
            {session.map((entry) => (
              <li key={entry.id} className={styles.accessRow}>
                <DateTime value={entry.openedAt} mode="datetime" />
                <span className={styles.accessDoc}>{entry.systemNo}</span>
                <span className={styles.accessActor}>
                  {users.find((person) => person.id === entry.actorId)?.name ?? entry.actorId}
                </span>
                <span className={styles.accessShown}>{entry.shown}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </WorkQueue>
  )
}

export default DocumentVaultScreen
