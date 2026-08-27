import { PageHeader } from '../../../components/AppShell'
import { WorkQueue } from '../../../components/WorkQueue'
import { EmptyState, Skeleton } from '../../../ui/data'
import { useEnsureConfig, useEnsureMarket, useMarketStore } from '../shared'
import { NewAgentDialog } from './NewAgentDialog'
import { agentsQueue } from './agents-queue'
import layout from '../shared/config-layout.module.css'

/** `/config/agents` — agent percentage, sub-agent grant, cap, direct updates. */
export default function AgentsScreen() {
  const market = useEnsureMarket()
  const config = useEnsureConfig()
  const revision = useMarketStore((state) => state.revision)
  const agents = useMarketStore((state) => state.agents)
  const agencies = useMarketStore((state) => state.agencies)

  if (market.status === 'error') {
    return (
      <>
        <PageHeader title="Agents" />
        <div className={layout.body}>
          <EmptyState
            variant="error"
            title="The channel configuration could not be read"
            explanation={market.error?.message ?? 'The agent repository did not answer.'}
          />
        </div>
      </>
    )
  }

  if (!market.ready || !config.ready) {
    return (
      <>
        <PageHeader title="Agents" />
        <div className={layout.body} aria-busy="true">
          <Skeleton width="28ch" />
          <Skeleton width="40ch" />
        </div>
      </>
    )
  }

  return (
    <WorkQueue
      key={`agents-${revision}`}
      config={agentsQueue({ agents, agencies })}
      actions={<NewAgentDialog />}
    />
  )
}
