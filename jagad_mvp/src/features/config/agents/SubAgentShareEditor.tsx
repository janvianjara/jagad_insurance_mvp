import { useState } from 'react'
import { reasonOf } from '../../../domain/workflows'
import { Field, NumberInput } from '../../../ui/form'
import {
  GatedAction,
  bpFromPercent,
  checkSubAgentShare,
  percentFromBp,
  readPercent,
  useMarketStore,
} from '../shared'
import type { ConfigAgent } from '../shared'
import styles from '../shared/market-panels.module.css'

/**
 * A sub-agent's share of their agent's cut — §9's cap rule, at the one place a
 * person types the number.
 *
 * The check is `subAgentShareWithinCap`, built in P-03 and called through the
 * store's `checkSubAgentShare`. It is not reimplemented here and it is not
 * approximated: the same function that would refuse the write decides whether
 * this Save is offered, and the sentence shown is the sentence it refused with.
 *
 * §9 gives it two ceilings. A configured cap blocks anything above it; and with
 * no cap set the agent's own percentage is still the ceiling, because the share
 * is carved out of that cut and cannot be larger than the thing it comes from.
 */
export function SubAgentShareEditor({ subAgent }: { subAgent: ConfigAgent }) {
  const agents = useMarketStore((state) => state.agents)
  const setSubAgentShare = useMarketStore((state) => state.setSubAgentShare)

  const [draft, setDraft] = useState<number | null>(subAgent.sharePercentBp)

  const parentId = subAgent.parentAgentId ?? ''
  const verdict = checkSubAgentShare(agents, parentId, draft)
  const changed = draft !== subAgent.sharePercentBp

  return (
    <div className={styles.rowActions} data-sub-agent={subAgent.id}>
      <Field
        label={`${subAgent.name}'s share`}
        className={styles.grow}
        error={verdict.ok ? undefined : reasonOf(verdict)}
      >
        <NumberInput
          unit="%"
          min={0}
          max={100}
          step={0.01}
          invalid={!verdict.ok}
          value={percentFromBp(draft)}
          onValueChange={(value) => setDraft(bpFromPercent(value))}
        />
      </Field>

      <GatedAction
        label="Save share"
        title={`Save ${subAgent.name}'s share`}
        disabled={!changed || !verdict.ok}
        changes={[
          {
            key: 'share',
            label: `${subAgent.name}'s share of the agent cut`,
            from: readPercent(subAgent.sharePercentBp),
            to: readPercent(draft),
          },
        ]}
        note="Commission already booked keeps the split it was booked on. This is the arrangement from now on."
        confirmLabel="Save share"
        toast={{ title: `${subAgent.name}'s share saved` }}
        onConfirm={() => setSubAgentShare(subAgent.id, draft)}
      />
    </div>
  )
}
