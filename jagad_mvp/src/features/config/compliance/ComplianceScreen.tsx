import { useSearchParams } from 'react-router'
import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { EmptyState, Skeleton } from '../../../ui/data'
import { SectionNav, useConfigStore, useEnsureConfig } from '../shared'
import type { Section } from '../shared'
import { ConsentLedger } from './ConsentLedger'
import { RetentionClasses } from './RetentionClasses'
import { auditQueue } from './audit-queue'
import { buildAuditTrail } from './audit-trail'
import { useComplianceStore } from './compliance-store'
import { useEnsureCompliance } from './use-compliance'
import layout from '../shared/config-layout.module.css'

const SECTIONS: readonly Section[] = [
  { id: 'audit', label: 'Audit search' },
  { id: 'consent', label: 'Consent' },
  { id: 'retention', label: 'Retention' },
]

const AUDIT = 'audit'

/**
 * `/config/compliance` — plan §4: consent, retention classes and audit search.
 *
 * One screen, three sections, and only the first of them is a queue. That
 * ordering follows P-10a's: `<WorkQueue>` writes the whole search string from
 * its own state, so the default section is the one an empty URL means, and the
 * two sections that carry a parameter host no queue to clear it. The audit trail
 * takes the default because it is the one of the three that genuinely needs
 * search, filter, sort and a page — and those have to live in the URL.
 */
export default function ComplianceScreen() {
  const compliance = useEnsureCompliance()
  const config = useEnsureConfig()
  const [params] = useSearchParams()
  const section = params.get('tab') ?? AUDIT

  const revision = useComplianceStore((state) => state.revision)
  const customers = useComplianceStore((state) => state.customers)
  const consents = useComplianceStore((state) => state.consents)
  const documents = useComplianceStore((state) => state.documents)
  const messages = useComplianceStore((state) => state.messages)
  const retentionClasses = useComplianceStore((state) => state.retentionClasses)
  const users = useConfigStore((state) => state.users)

  const nav = <SectionNav sections={SECTIONS} defaultId={AUDIT} label="Compliance sections" />

  if (compliance.status === 'error') {
    return (
      <>
        <PageHeader title="Compliance" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The compliance record could not be read"
            explanation={compliance.error?.message ?? 'The repositories did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!compliance.ready || !config.ready) {
    return (
      <>
        <PageHeader title="Compliance" actions={nav} />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  if (section === 'consent') {
    return (
      <>
        <PageHeader title="Consent" actions={nav} />
        <ConsentLedger />
      </>
    )
  }

  if (section === 'retention') {
    return (
      <>
        <PageHeader title="Retention" actions={nav} />
        <RetentionClasses />
      </>
    )
  }

  const entries = buildAuditTrail({
    customers,
    consents,
    documents,
    messages,
    staffNames: Object.fromEntries(users.map((user) => [user.id, user.name])),
  })

  return (
    <WorkQueue
      key={`compliance-${revision}`}
      config={auditQueue({
        entries,
        retentionClasses: retentionClasses.map((entry) => entry.key),
      })}
      actions={nav}
    />
  )
}
