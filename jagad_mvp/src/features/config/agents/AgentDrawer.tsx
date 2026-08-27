import { useState } from 'react'
import { reasonOf } from '../../../domain/workflows'
import { Checkbox, Field, FormSection, Input, NumberInput, Select, Toggle } from '../../../ui/form'
import { Badge, StatusPill } from '../../../ui/signal'
import {
  GatedAction,
  bpFromPercent,
  checkSubAgentShare,
  parentAgentOf,
  percentFromBp,
  percentIsValid,
  readPercent,
  subAgentTeamIsConsistent,
  subAgentsOf,
  useConfigStore,
  useMarketStore,
} from '../shared'
import type { ConfigAgent } from '../shared'
import { SubAgentShareEditor } from './SubAgentShareEditor'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

/**
 * One agent — canvas 6.4's four settings, each one a field: the percentage, the
 * delegated sub-agent grant, the cap on what a sub-agent may be given, and the
 * direct-updates toggle FR-11 reads.
 *
 * Every rule that could refuse this Save is evaluated as the form is edited, by
 * the same functions the store will call: the share against P-03's
 * `subAgentShareWithinCap` when this agent is a sub-agent, and the team settings
 * against `subAgentTeamIsConsistent`. The gate stays shut while a refusal stands,
 * so Confirm never leads to a silent no.
 *
 * Nothing here is money. A percentage is stored as integer basis points and stays
 * a percentage; the ledger that turns one into an amount is P-16's.
 */
export function AgentDrawer({ agent }: { agent: ConfigAgent }) {
  const categories = useConfigStore((state) => state.categories)
  const agencies = useMarketStore((state) => state.agencies)
  const agents = useMarketStore((state) => state.agents)
  const saveAgent = useMarketStore((state) => state.saveAgent)
  const setAgentActive = useMarketStore((state) => state.setAgentActive)

  const [name, setName] = useState(agent.name)
  const [mobile, setMobile] = useState(agent.mobile)
  const [email, setEmail] = useState(agent.email)
  const [agencyId, setAgencyId] = useState(agent.agencyId)
  const [city, setCity] = useState(agent.city)
  const [categoryIds, setCategoryIds] = useState<readonly string[]>(agent.categoryIds)
  const [share, setShare] = useState<number | null>(agent.sharePercentBp)
  const [canGrant, setCanGrant] = useState(agent.canGrantSubAgents)
  const [cap, setCap] = useState<number | null>(agent.subAgentCapPercentBp)
  const [capless, setCapless] = useState(agent.subAgentCapPercentBp === null)
  const [directUpdates, setDirectUpdates] = useState(agent.directUpdatesEnabled)

  const parent = parentAgentOf(agents, agent)
  const reporting = subAgentsOf(agents, agent.id)
  const effectiveCap = capless ? null : cap

  const shareValid = percentIsValid(share, "the agent's own percentage")
  const shareUnderCap = parent
    ? checkSubAgentShare(agents, parent.id, share)
    : { ok: true as const }
  const team = subAgentTeamIsConsistent({
    agentName: agent.name,
    canGrantSubAgents: canGrant,
    capPercentBp: effectiveCap,
    reporting: reporting.map((sub) => ({ name: sub.name, sharePercentBp: sub.sharePercentBp })),
  })

  const refusal = !shareValid.ok
    ? reasonOf(shareValid)
    : !shareUnderCap.ok
      ? reasonOf(shareUnderCap)
      : !team.ok
        ? reasonOf(team)
        : null

  const categoriesChanged =
    categoryIds.length !== agent.categoryIds.length ||
    categoryIds.some((categoryId) => !agent.categoryIds.includes(categoryId))
  const changed =
    name.trim() !== agent.name ||
    mobile.trim() !== agent.mobile ||
    email.trim() !== agent.email ||
    agencyId !== agent.agencyId ||
    city.trim() !== agent.city ||
    share !== agent.sharePercentBp ||
    canGrant !== agent.canGrantSubAgents ||
    effectiveCap !== agent.subAgentCapPercentBp ||
    directUpdates !== agent.directUpdatesEnabled ||
    categoriesChanged

  function agencyName(id: string): string {
    return agencies.find((agency) => agency.id === id)?.name ?? 'An agency no longer on file'
  }

  return (
    <div className={styles.drawer}>
      <FormSection title="The agent" description="Who they are and which agency they write under.">
        <Field label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>

        <Field label="Mobile">
          <Input value={mobile} onChange={(event) => setMobile(event.target.value)} />
        </Field>

        <Field label="Email">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>

        <Field label="Agency" required>
          <Select
            value={agencyId}
            options={agencies.map((agency) => ({ value: agency.id, label: agency.name }))}
            onChange={(event) => setAgencyId(event.target.value)}
          />
        </Field>

        <Field label="City">
          <Input value={city} onChange={(event) => setCity(event.target.value)} />
        </Field>

        <Field label="Categories worked" control="group" hint="What their inquiries are routed from.">
          <ul className={styles.choices}>
            {categories.map((category) => (
              <li key={category.id}>
                <Checkbox
                  label={category.label}
                  checked={categoryIds.includes(category.id)}
                  onChange={(event) =>
                    setCategoryIds((current) =>
                      event.target.checked
                        ? [...current, category.id]
                        : current.filter((candidate) => candidate !== category.id),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </Field>

        <p className={layout.mono}>
          {agent.code} · {parent ? `sub-agent of ${parent.name}` : 'agent'}
        </p>
      </FormSection>

      <FormSection
        title="Commission"
        description={
          parent
            ? `Carved out of ${parent.name}'s own cut, so it can never exceed it — and never exceed the cap ${parent.name} is held to.`
            : 'The share this agent takes of the commission on business they source.'
        }
      >
        <Field
          label="Own percentage"
          required
          error={!shareValid.ok || !shareUnderCap.ok ? refusal : undefined}
          hint={parent ? `${parent.name} is on ${readPercent(parent.sharePercentBp)}, capped at ${readPercent(parent.subAgentCapPercentBp)}.` : undefined}
        >
          <NumberInput
            unit="%"
            min={0}
            max={100}
            step={0.01}
            invalid={!shareValid.ok || !shareUnderCap.ok}
            value={percentFromBp(share)}
            onValueChange={(value) => setShare(bpFromPercent(value))}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Sub-agent team"
        description="Canvas 6.4: an agent may build their own team, within a cap the agency sets."
      >
        <Toggle
          checked={canGrant}
          onCheckedChange={setCanGrant}
          label="May recruit sub-agents"
          description="Without the grant, no share can be carved out of this agent's cut."
        />

        <Field
          label="Sub-agent cap"
          hint="The most any one sub-agent may be given. With no cap set, this agent's own percentage is the ceiling."
        >
          <NumberInput
            unit="%"
            min={0}
            max={100}
            step={0.01}
            disabled={capless || !canGrant}
            value={capless ? null : percentFromBp(cap)}
            onValueChange={(value) => setCap(bpFromPercent(value))}
          />
        </Field>

        <Checkbox
          label="No cap set"
          description="The agent's own percentage is the ceiling."
          checked={capless}
          disabled={!canGrant}
          onChange={(event) => setCapless(event.target.checked)}
        />

        {team.ok ? null : (
          <p role="alert" className={styles.refusal}>
            {reasonOf(team)}
          </p>
        )}

        {reporting.length === 0 ? (
          <p className={styles.hint}>Nobody reports to this agent.</p>
        ) : (
          <ul className={styles.rows}>
            {reporting.map((sub) => (
              <li key={sub.id} className={styles.row}>
                <div className={styles.rowHead}>
                  <span className={styles.rowName}>{sub.name}</span>
                  <Badge tone="neutral">{sub.code}</Badge>
                </div>
                <SubAgentShareEditor subAgent={sub} />
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection
        title="Direct updates"
        description="FR-11: whether this agent may post claim status updates straight onto the record, without the desk relaying them."
      >
        <Toggle
          checked={directUpdates}
          onCheckedChange={setDirectUpdates}
          label="May post updates directly"
          description="Off means every update goes through the claims desk."
        />
      </FormSection>

      <FormSection title="Save" description="Nothing above is written until this is confirmed.">
        {refusal === null ? null : (
          <p role="alert" className={styles.refusal}>
            {refusal}
          </p>
        )}

        <GatedAction
          label="Save agent"
          variant="primary"
          title={`Save "${agent.name}"`}
          disabled={!changed || refusal !== null}
          changes={[
            ...(name.trim() !== agent.name
              ? [{ key: 'name', label: 'Name', from: agent.name, to: name.trim() }]
              : []),
            ...(agencyId !== agent.agencyId
              ? [
                  {
                    key: 'agency',
                    label: 'Agency',
                    from: agencyName(agent.agencyId),
                    to: agencyName(agencyId),
                  },
                ]
              : []),
            ...(share !== agent.sharePercentBp
              ? [
                  {
                    key: 'share',
                    label: 'Own percentage',
                    from: readPercent(agent.sharePercentBp),
                    to: readPercent(share),
                  },
                ]
              : []),
            ...(canGrant !== agent.canGrantSubAgents
              ? [
                  {
                    key: 'grant',
                    label: 'Sub-agent grant',
                    from: agent.canGrantSubAgents ? 'Granted' : 'Not granted',
                    to: canGrant ? 'Granted' : 'Not granted',
                  },
                ]
              : []),
            ...(effectiveCap !== agent.subAgentCapPercentBp
              ? [
                  {
                    key: 'cap',
                    label: 'Sub-agent cap',
                    from: readPercent(agent.subAgentCapPercentBp),
                    to: readPercent(effectiveCap),
                  },
                ]
              : []),
            ...(directUpdates !== agent.directUpdatesEnabled
              ? [
                  {
                    key: 'directUpdates',
                    label: 'Direct updates',
                    from: agent.directUpdatesEnabled ? 'On' : 'Off',
                    to: directUpdates ? 'On' : 'Off',
                  },
                ]
              : []),
            ...(categoriesChanged
              ? [
                  {
                    key: 'categories',
                    label: 'Categories worked',
                    from: `${agent.categoryIds.length} categories`,
                    to: `${categoryIds.length} categories`,
                  },
                ]
              : []),
            ...(mobile.trim() !== agent.mobile
              ? [{ key: 'mobile', label: 'Mobile', from: agent.mobile, to: mobile.trim() }]
              : []),
            ...(email.trim() !== agent.email
              ? [{ key: 'email', label: 'Email', from: agent.email, to: email.trim() }]
              : []),
            ...(city.trim() !== agent.city
              ? [{ key: 'city', label: 'City', from: agent.city, to: city.trim() }]
              : []),
          ]}
          note="Commission already booked keeps the arrangement it was booked on."
          confirmLabel="Save"
          toast={{ title: `"${name.trim()}" saved` }}
          onConfirm={() =>
            saveAgent(agent.id, {
              name,
              mobile,
              email,
              agencyId,
              city,
              parentAgentId: agent.parentAgentId,
              categoryIds,
              sharePercentBp: share,
              canGrantSubAgents: canGrant,
              subAgentCapPercentBp: effectiveCap,
              directUpdatesEnabled: directUpdates,
            })
          }
        />
      </FormSection>

      <FormSection
        title="Availability"
        description="A deactivated agent keeps every policy already sourced and is offered on no new one."
      >
        <div className={styles.chips}>
          <StatusPill tone={agent.active ? 'ok' : 'idle'}>
            {agent.active ? 'Active' : 'Deactivated'}
          </StatusPill>

          <GatedAction
            label={agent.active ? 'Deactivate' : 'Reactivate'}
            title={`${agent.active ? 'Deactivate' : 'Reactivate'} "${agent.name}"`}
            changes={[
              {
                key: 'active',
                label: agent.name,
                from: agent.active ? 'Sourcing' : 'Deactivated',
                to: agent.active ? 'Deactivated' : 'Sourcing',
              },
            ]}
            note={
              reporting.length > 0
                ? `${reporting.length} sub-agent${reporting.length === 1 ? '' : 's'} report to them. Their arrangements are untouched.`
                : 'Nobody reports to them.'
            }
            confirmLabel={agent.active ? 'Deactivate' : 'Reactivate'}
            toast={{ title: `"${agent.name}" is ${agent.active ? 'deactivated' : 'active'}` }}
            onConfirm={() => setAgentActive(agent.id, !agent.active)}
          />
        </div>
      </FormSection>
    </div>
  )
}
