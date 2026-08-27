import { useSearchParams } from 'react-router'
import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { EmptyState, Skeleton } from '../../../ui/data'
import { SectionNav, useConfigStore, useEnsureConfig } from '../shared'
import type { Section } from '../shared'
import { NewUserDialog } from './NewUserDialog'
import { TemplateLibrary } from './TemplateLibrary'
import { TwoFactorMatrix } from './TwoFactorMatrix'
import { usersQueue } from './users-queue'
import layout from '../shared/config-layout.module.css'

const SECTIONS: readonly Section[] = [
  { id: 'people', label: 'People' },
  { id: 'templates', label: 'Permission templates' },
  { id: 'two-factor', label: 'Two-factor policy' },
]

const PEOPLE = 'people'

/**
 * `/config/users` — FR-01: accounts, permission templates, ABAC scopes and the
 * two-factor matrix.
 *
 * One screen, three sections, and only the first of them is a queue. That
 * ordering is deliberate: `<WorkQueue>` writes the whole search string from its
 * own state, so the default section is the one an empty URL means, and the two
 * sections that carry a parameter host no queue to clear it.
 */
export default function UsersScreen() {
  const config = useEnsureConfig()
  const [params] = useSearchParams()
  const section = params.get('tab') ?? PEOPLE

  const revision = useConfigStore((state) => state.revision)
  const users = useConfigStore((state) => state.users)
  const templates = useConfigStore((state) => state.templates)
  const teams = useConfigStore((state) => state.teams)
  const twoFactor = useConfigStore((state) => state.twoFactor)

  const nav = <SectionNav sections={SECTIONS} defaultId={PEOPLE} label="Users sections" />

  if (config.status === 'error') {
    return (
      <>
        <PageHeader title="Users" />
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
        <PageHeader title="Users" actions={nav} />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  if (section === 'templates') {
    return (
      <>
        <PageHeader
          title="Permission templates"
          actions={nav}
        />
        <div className={layout.body}>
          <TemplateLibrary />
        </div>
      </>
    )
  }

  if (section === 'two-factor') {
    return (
      <>
        <PageHeader
          title="Two-factor policy"
          actions={nav}
        />
        <div className={layout.body}>
          <TwoFactorMatrix />
        </div>
      </>
    )
  }

  return (
    <WorkQueue
      key={`users-${revision}`}
      config={usersQueue({ users, templates, teams, twoFactor })}
      actions={
        <>
          {nav}
          <NewUserDialog />
        </>
      }
    />
  )
}
