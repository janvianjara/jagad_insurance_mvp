import { useState } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { WorkQueue } from '../../components/WorkQueue'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { Skeleton } from '../../ui/data'
import { noticesQueue } from './notices-queue'
import { UploadNoticesDialog } from './UploadNoticesDialog'
import styles from './Notices.module.css'

/**
 * `/renewals/notices` — plan §4, §5 ("Notice bulk ingest"), canvas 5.3.
 *
 * The batches an insurer sent, in the order they arrived. Filter, sort and page
 * live in the URL like every other queue; opening a batch is a route of its own
 * rather than a drawer, because reviewing four hundred rows is work rather than
 * a glance.
 */
export function NoticeQueueScreen() {
  const repositories = useRepositories()
  const user = useSessionStore((state) => state.user)
  const [revision, setRevision] = useState(0)

  const context = useResource(async () => {
    const [companies, templates] = await Promise.all([
      repositories.companies.list({ page: 1, pageSize: 200 }),
      repositories.ocrTemplates.list({ page: 1, pageSize: 100 }),
    ])
    return { companies: companies.rows, templates: templates.rows }
  }, 'notices:context')

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="100%" height="12rem" />
      </div>
    )
  }

  const config = noticesQueue({
    load: (query) => repositories.noticeBatches.queue(query),
    companies: context.data.companies,
  })

  return (
    <WorkQueue
      key={`notice-batches-${revision}`}
      config={config}
      actions={
        can(user, 'create', 'renewals') ? (
          <UploadNoticesDialog
            companies={context.data.companies}
            templates={context.data.templates}
            onUploaded={() => setRevision((held) => held + 1)}
          />
        ) : null
      }
    />
  )
}

export default NoticeQueueScreen
