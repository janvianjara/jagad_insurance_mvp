import { useState } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import { useSessionStore } from '../../../app/store'
import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { can } from '../../../domain/permissions'
import { useResource } from '../../../lib/useResource'
import { EmptyState, Skeleton } from '../../../ui/data'
import { useToaster } from '../../../ui/surface'
import { NewTemplateDialog } from './NewTemplateDialog'
import { TemplateDrawer } from './TemplateDrawer'
import type { TemplateDraft } from './TemplateDrawer'
import { templatesQueue } from './templates-queue'
import layout from '../shared/config-layout.module.css'

/**
 * `/config/templates` — plan §5's configuration block, canvas flow 6.
 *
 * The screen reads and writes through `MessageTemplateRepository` rather than a
 * local store, because a template is a record with versions rather than a
 * setting: `save` publishes the next version, and the screen has to show the one
 * that is live. Every write bumps a revision so the queue and the drawer re-read
 * the same row together.
 */
export default function TemplatesScreen() {
  const repositories = useRepositories()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)
  const [revision, setRevision] = useState(0)

  const context = useResource(async () => {
    const [recipes, users] = await Promise.all([
      repositories.config.recipes(),
      repositories.config.users(),
    ])
    return { recipes, users }
  }, 'config:templates-context')

  if (context.status === 'error') {
    return (
      <>
        <PageHeader title="Message templates" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The templates could not be read"
            explanation={context.error?.message ?? 'The template repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!user || !context.data) {
    return (
      <>
        <PageHeader title="Message templates" />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  const { recipes } = context.data
  const canEdit = can(user, 'edit', 'config')
  const actorId = user.id

  function nameOf(id: string): string {
    return context.data?.users.find((person) => person.id === id)?.name ?? id
  }

  function report(title: string, reason: string | null) {
    if (reason === null) {
      setRevision((held) => held + 1)
      return
    }
    toaster.notify({ title, detail: reason, tone: 'bad' })
  }

  const config = templatesQueue({
    load: (query) => repositories.templates.list(query),
    recipes,
    renderDrawer: (row) => (
      <TemplateDrawer
        key={`${row.id}-${row.version}`}
        template={row}
        recipes={recipes}
        authorName={nameOf(row.updatedBy)}
        canEdit={canEdit}
        onSave={(draft: TemplateDraft) => {
          void repositories.templates
            .save(row.id, { actorId, ...draft, updatedBy: actorId })
            .then((outcome) =>
              report('The template was not saved', outcome.ok ? null : outcome.reason),
            )
        }}
        onSetActive={(active) => {
          void repositories.templates
            .setActive(row.id, { actorId, active, updatedBy: actorId })
            .then((outcome) =>
              report('The template was not changed', outcome.ok ? null : outcome.reason),
            )
        }}
      />
    ),
  })

  return (
    <WorkQueue
      key={`config-templates-${revision}`}
      config={config}
      actions={
        can(user, 'create', 'config') ? (
          <NewTemplateDialog recipes={recipes} onCreated={() => setRevision((held) => held + 1)} />
        ) : null
      }
    />
  )
}
