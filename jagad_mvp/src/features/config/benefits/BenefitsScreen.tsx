import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { EmptyState, Skeleton } from '../../../ui/data'
import { useEnsureMarket, useMarketStore } from '../shared'
import { NewBenefitDialog } from './NewBenefitDialog'
import { benefitsQueue } from './benefits-queue'
import layout from '../shared/config-layout.module.css'

/** `/config/benefits` — the benefit catalogue, FR-06.4. */
export default function BenefitsScreen() {
  const market = useEnsureMarket()
  const revision = useMarketStore((state) => state.revision)
  const benefitItems = useMarketStore((state) => state.benefitItems)
  const benefitMaps = useMarketStore((state) => state.benefitMaps)

  if (market.status === 'error') {
    return (
      <>
        <PageHeader title="Benefits" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The benefit catalogue could not be read"
            explanation={market.error?.message ?? 'The benefit repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!market.ready) {
    return (
      <>
        <PageHeader title="Benefits" />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  return (
    <WorkQueue
      key={`benefits-${revision}`}
      config={benefitsQueue({ benefitItems, benefitMaps })}
      actions={<NewBenefitDialog />}
    />
  )
}
