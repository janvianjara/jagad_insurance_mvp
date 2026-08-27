import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { EmptyState, Skeleton } from '../../../ui/data'
import { useEnsureConfig, useEnsureMarket, useMarketStore } from '../shared'
import { NewCompanyDialog } from './NewCompanyDialog'
import { companiesQueue } from './companies-queue'
import layout from '../shared/config-layout.module.css'

/**
 * `/config/companies` — plan §5, FR-04.
 *
 * Reads both configurations: the market store for the companies themselves, and
 * P-10a's config store for the inquiry categories a contact is filed under. Both
 * hydrate once however many screens ask.
 */
export default function CompaniesScreen() {
  const market = useEnsureMarket()
  const config = useEnsureConfig()
  const revision = useMarketStore((state) => state.revision)
  const companies = useMarketStore((state) => state.companies)
  const contacts = useMarketStore((state) => state.contacts)
  const products = useMarketStore((state) => state.products)

  if (market.status === 'error') {
    return (
      <>
        <PageHeader title="Companies" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The market configuration could not be read"
            explanation={market.error?.message ?? 'The company repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!market.ready || !config.ready) {
    return (
      <>
        <PageHeader title="Companies" />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  return (
    <WorkQueue
      key={`companies-${revision}`}
      config={companiesQueue({ companies, contacts, products })}
      actions={<NewCompanyDialog />}
    />
  )
}
