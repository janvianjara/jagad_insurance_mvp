import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { EmptyState, Skeleton } from '../../../ui/data'
import { useConfigStore, useEnsureConfig } from '../shared'
import { NewMasterTypeDialog } from './NewMasterTypeDialog'
import { mastersQueue } from './masters-queue'
import layout from '../shared/config-layout.module.css'

/**
 * `/config/masters` — FR-02.
 *
 * The queue is remounted on the store's revision rather than kept in step by
 * hand. `<WorkQueue>` reloads when the URL changes, which is exactly right for a
 * queue over a repository and blind to a store edited underneath it; remounting
 * costs nothing here because the URL owns filter, sort, page, selection and the
 * open drawer, so the queue comes back looking at precisely what it was.
 */
export default function MastersScreen() {
  const config = useEnsureConfig()
  const revision = useConfigStore((state) => state.revision)
  const masterTypes = useConfigStore((state) => state.masterTypes)
  const masterValues = useConfigStore((state) => state.masterValues)

  if (config.status === 'error') {
    return (
      <>
        <PageHeader title="Masters" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="Configuration could not be read"
            explanation={config.error?.message ?? 'The configuration repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!config.ready) {
    return (
      <>
        <PageHeader title="Masters" />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  return (
    <WorkQueue
      key={`masters-${revision}`}
      config={mastersQueue({ masterTypes, masterValues })}
      actions={<NewMasterTypeDialog />}
    />
  )
}
