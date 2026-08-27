import { useState } from 'react'
import { reasonOf } from '../../../domain/workflows'
import { Button } from '../../../ui/Button'
import { Field, Input, NumberInput, Select } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import { bpFromPercent, nextAgentCode, percentFromBp, useMarketStore } from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

/**
 * Adding an agent, or a sub-agent — the same record, with "reports to" filled in.
 *
 * The code is sequential and generated. The share is asked for here because an
 * agent with no arrangement recorded is an agent the commission chain stalls on;
 * a sub-agent's share is checked against their agent's cap by the store before
 * the row exists.
 */
export function NewAgentDialog() {
  const agencies = useMarketStore((state) => state.agencies)
  const agents = useMarketStore((state) => state.agents)
  const addAgent = useMarketStore((state) => state.addAgent)
  const toaster = useToaster()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [agencyId, setAgencyId] = useState('')
  const [city, setCity] = useState('')
  const [parentAgentId, setParentAgentId] = useState('')
  const [share, setShare] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const code = nextAgentCode(agents.map((agent) => agent.code))
  const possibleParents = agents.filter(
    (agent) => agent.canGrantSubAgents && (agencyId === '' || agent.agencyId === agencyId),
  )

  function close() {
    setOpen(false)
    setName('')
    setMobile('')
    setEmail('')
    setAgencyId('')
    setCity('')
    setParentAgentId('')
    setShare(null)
    setError(null)
  }

  function create() {
    const verdict = addAgent({
      name,
      mobile,
      email,
      agencyId,
      city,
      parentAgentId: parentAgentId === '' ? null : parentAgentId,
      categoryIds: [],
      sharePercentBp: share,
      canGrantSubAgents: false,
      subAgentCapPercentBp: null,
      directUpdatesEnabled: false,
    })
    if (!verdict.ok) {
      setError(reasonOf(verdict))
      return
    }
    toaster.notify({ title: `"${name.trim()}" was added`, tone: 'ok' })
    close()
  }

  return (
    <>
      <Button variant="primary" size="sm" icon="plus" onClick={() => setOpen(true)}>
        New agent
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="New agent"
        description="Somebody sourcing business under one agency. Leave the reporting line empty for an agent, or name their agent for a sub-agent."
        dismissOnScrimClick={false}
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create}>
              Create agent
            </Button>
          </>
        }
      >
        <div className={layout.stack}>
          <Field label="Name" required hint={`They will be issued the code ${code}.`}>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>

          <Field label="Agency" required>
            <Select
              value={agencyId}
              placeholder="Choose an agency"
              options={agencies.map((agency) => ({ value: agency.id, label: agency.name }))}
              onChange={(event) => setAgencyId(event.target.value)}
            />
          </Field>

          <Field
            label="Reports to"
            hint="Only agents granted sub-agents are offered. Empty means this is an agent in their own right."
          >
            <Select
              value={parentAgentId}
              placeholder="Nobody"
              options={possibleParents.map((agent) => ({ value: agent.id, label: agent.name }))}
              onChange={(event) => setParentAgentId(event.target.value)}
            />
          </Field>

          <Field label="Own percentage" required>
            <NumberInput
              unit="%"
              min={0}
              max={100}
              step={0.01}
              value={percentFromBp(share)}
              onValueChange={(value) => setShare(bpFromPercent(value))}
            />
          </Field>

          <Field label="Mobile">
            <Input value={mobile} onChange={(event) => setMobile(event.target.value)} />
          </Field>

          <Field label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>

          <Field label="City">
            <Input value={city} onChange={(event) => setCity(event.target.value)} />
          </Field>

          {error ? (
            <p role="alert" className={styles.refusal}>
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
