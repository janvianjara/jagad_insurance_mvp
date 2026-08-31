import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { NewFormDialog } from './NewFormDialog'
import { EmptyState, Skeleton } from '../../../ui/data'
import { useEnsureConfig } from '../shared'
import { useEnsureForms } from './use-forms'
import { useFormsStore } from './forms-store'
import { formsQueue } from './forms-queue'
import layout from '../shared/config-layout.module.css'

/**
 * `/config/forms` — the SKU form builder (plan §4, P1).
 *
 * The masters are read alongside the schemas because a preview that renders a
 * master-backed choice as an empty list is a preview that lies about the form.
 * Both stores are idempotent, so asking for both here costs one read each.
 */
export default function FormsScreen() {
  const forms = useEnsureForms()
  const config = useEnsureConfig()
  const revision = useFormsStore((state) => state.revision)
  const schemas = useFormsStore((state) => state.schemas)

  if (forms.status === 'error') {
    return (
      <>
        <PageHeader title="Forms" actions={<NewFormDialog />} />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The form catalogue could not be read"
            explanation={forms.error?.message ?? 'The configuration repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!forms.ready || !config.ready) {
    return (
      <>
        <PageHeader title="Forms" actions={<NewFormDialog />} />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  return (
    <WorkQueue
      key={`forms-${revision}`}
      config={formsQueue({ schemas })}
      actions={<NewFormDialog />}
    />
  )
}
