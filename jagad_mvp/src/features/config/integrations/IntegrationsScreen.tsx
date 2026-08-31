import { useState } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import { useSessionStore } from '../../../app/store'
import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { can } from '../../../domain/permissions'
import { useResource } from '../../../lib/useResource'
import { EmptyState, Skeleton } from '../../../ui/data'
import { Icon } from '../../../ui/Icon'
import { useToaster } from '../../../ui/surface'
import { IntegrationDrawer } from './IntegrationDrawer'
import { NewIntegrationDialog } from './NewIntegrationDialog'
import { integrationsQueue } from './integrations-queue'
import layout from '../shared/config-layout.module.css'
import styles from './integrations.module.css'

/**
 * `/config/integrations` — plan §5's configuration block, §8's
 * `IntegrationConfig`, canvas flow 6.
 *
 * The banner above the table is not decoration. `Mandate` says the platform
 * records outcomes and never holds a bank credential; this is the same posture
 * for the outward channels, said in the same place a person would look for a
 * password field. The record has nowhere to put one, the repository refuses a
 * setting key that reads like one, and the fixture schema refuses it too — so
 * the sentence on screen is a description rather than a promise.
 */
export default function IntegrationsScreen() {
  const repositories = useRepositories()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)
  const [revision, setRevision] = useState(0)

  const context = useResource(() => repositories.config.users(), 'config:integrations-context')

  if (context.status === 'error') {
    return (
      <>
        <PageHeader title="Integrations" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The integrations could not be read"
            explanation={context.error?.message ?? 'The integration repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!user || !context.data) {
    return (
      <>
        <PageHeader title="Integrations" />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  const staff = context.data
  const canEdit = can(user, 'edit', 'config')
  const actorId = user.id

  function report(title: string, reason: string | null) {
    if (reason === null) {
      setRevision((held) => held + 1)
      return
    }
    toaster.notify({ title, detail: reason, tone: 'bad' })
  }

  const config = integrationsQueue({
    load: (query) => repositories.integrations.list(query),
    renderDrawer: (row) => (
      <IntegrationDrawer
        key={`${row.id}-${row.updatedAt}`}
        integration={row}
        authorName={staff.find((person) => person.id === row.updatedBy)?.name ?? row.updatedBy}
        canEdit={canEdit}
        onSave={(label, providerName, settings) => {
          void repositories.integrations
            .save(row.id, { actorId, label, providerName, settings, updatedBy: actorId })
            .then((outcome) =>
              report('The integration was not saved', outcome.ok ? null : outcome.reason),
            )
        }}
        onSetEnabled={(enabled) => {
          void repositories.integrations
            .setEnabled(row.id, { actorId, enabled, updatedBy: actorId })
            .then((outcome) =>
              report('The integration was not changed', outcome.ok ? null : outcome.reason),
            )
        }}
        onRecordCheck={(outcome, note) => {
          void repositories.integrations
            .recordCheck(row.id, { actorId, outcome, note })
            .then((written) =>
              report('The check was not recorded', written.ok ? null : written.reason),
            )
        }}
      />
    ),
  })

  return (
    <WorkQueue
      key={`config-integrations-${revision}`}
      config={config}
      actions={
        can(user, 'create', 'config') ? (
          <NewIntegrationDialog onCreated={() => setRevision((held) => held + 1)} />
        ) : null
      }
    >
      <div className={styles.posture} role="note">
        <Icon name="lock" size="md" />
        <div className={styles.postureBody}>
          <p className={styles.postureTitle}>This platform stores no credentials</p>
          <p className={styles.prose}>
            Not one row below holds an API key, a token, a password or a sender secret. Those live
            in the provider’s own console, exactly as a mandate’s bank credential lives with the
            bank. What is recorded here is which provider each channel uses, whether it is switched
            on, the non-secret settings a person needs to be able to read, and what happened the
            last time it was exercised.
          </p>
        </div>
      </div>
    </WorkQueue>
  )
}
