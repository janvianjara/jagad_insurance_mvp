import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { EmptyState, Skeleton } from '../../../ui/data'
import { useEnsureMarket, useMarketStore } from '../shared'
import { NewAgencyDialog } from './NewAgencyDialog'
import { agenciesQueue } from './agencies-queue'
import layout from '../shared/config-layout.module.css'

/** `/config/agencies` — the Agency Master, FR-07. */
export default function AgenciesScreen() {
  const market = useEnsureMarket()
  const revision = useMarketStore((state) => state.revision)
  const agencies = useMarketStore((state) => state.agencies)
  const companies = useMarketStore((state) => state.companies)
  const products = useMarketStore((state) => state.products)
  const scopes = useMarketStore((state) => state.scopes)

  if (market.status === 'error') {
    return (
      <>
        <PageHeader title="Agencies" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The Agency Master could not be read"
            explanation={market.error?.message ?? 'The agency repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!market.ready) {
    return (
      <>
        <PageHeader title="Agencies" />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  return (
    <WorkQueue
      key={`agencies-${revision}`}
      config={agenciesQueue({ agencies, companies, products, scopes })}
      actions={<NewAgencyDialog />}
    />
  )
}
