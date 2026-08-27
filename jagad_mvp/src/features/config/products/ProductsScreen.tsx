import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { EmptyState, Skeleton } from '../../../ui/data'
import { useEnsureConfig, useEnsureMarket, useMarketStore } from '../shared'
import { NewProductDialog } from './NewProductDialog'
import { productsQueue } from './products-queue'
import layout from '../shared/config-layout.module.css'

/** `/config/products` — FR-05, including the policy-to-benefit map on the row. */
export default function ProductsScreen() {
  const market = useEnsureMarket()
  const config = useEnsureConfig()
  const revision = useMarketStore((state) => state.revision)
  const products = useMarketStore((state) => state.products)
  const companies = useMarketStore((state) => state.companies)
  const benefitMaps = useMarketStore((state) => state.benefitMaps)
  const checklists = useMarketStore((state) => state.checklists)

  if (market.status === 'error') {
    return (
      <>
        <PageHeader title="Products" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The product catalogue could not be read"
            explanation={market.error?.message ?? 'The product repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!market.ready || !config.ready) {
    return (
      <>
        <PageHeader title="Products" />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  return (
    <WorkQueue
      key={`products-${revision}`}
      config={productsQueue({ products, companies, benefitMaps, checklists })}
      actions={<NewProductDialog />}
    />
  )
}
