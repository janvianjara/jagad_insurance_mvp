import { useState } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import { useSessionStore } from '../../../app/store'
import { ConfirmGate } from '../../../components/guardrails'
import { INTEGRATION_KINDS } from '../../../data/repo'
import type { IntegrationKind } from '../../../data/repo'
import { Button } from '../../../ui/Button'
import { Field, Input, Select } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import { KIND_LABEL } from './integrations-queue'
import styles from './integrations.module.css'

export type NewIntegrationDialogProps = {
  onCreated: () => void
}

/**
 * A new integration is created switched off. Turning an outward channel on is a
 * deliberate act with a gate of its own, which is what `create` writes and what
 * this dialog says before it writes it.
 */
export function NewIntegrationDialog({ onCreated }: NewIntegrationDialogProps) {
  const repositories = useRepositories()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)

  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [kind, setKind] = useState<IntegrationKind>(INTEGRATION_KINDS.bsp)
  const [label, setLabel] = useState('')
  const [providerName, setProviderName] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)

  const ready = key.trim() !== '' && label.trim() !== '' && providerName.trim() !== ''

  function close() {
    setOpen(false)
    setRefusal(null)
  }

  async function create() {
    if (!user) return
    const outcome = await repositories.integrations.create({
      actorId: user.id,
      key: key.trim(),
      kind,
      label: label.trim(),
      providerName: providerName.trim(),
      updatedBy: user.id,
    })

    if (!outcome.ok) {
      setRefusal(outcome.reason)
      return
    }

    close()
    onCreated()
    toaster.notify({ title: `${outcome.record.key} added, switched off`, tone: 'ok' })
  }

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>
        New integration
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Add an integration"
        description="Which provider, and what it is for. No credential is asked for, here or anywhere else."
        dismissOnScrimClick={false}
      >
        <div className={styles.dialog}>
          <Field label="Key" required hint="How the platform names it internally. It never changes.">
            <Input value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
          </Field>

          <Field label="Kind" required>
            <Select
              value={kind}
              options={Object.values(INTEGRATION_KINDS).map((value) => ({
                value,
                label: KIND_LABEL[value],
              }))}
              onChange={(event) => setKind(event.target.value as IntegrationKind)}
            />
          </Field>

          <Field label="Name" required>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} autoComplete="off" />
          </Field>

          <Field label="Provider" required hint="Gupshup, Amazon SES, Textract — as a person would say it.">
            <Input
              value={providerName}
              onChange={(event) => setProviderName(event.target.value)}
              autoComplete="off"
            />
          </Field>

          {refusal === null ? null : (
            <p className={styles.refusal} role="alert">
              {refusal}
            </p>
          )}

          <ConfirmGate
            title="Add this integration"
            changes={
              ready
                ? [
                    { key: 'key', label: 'Key', to: key.trim() },
                    { key: 'kind', label: 'Kind', to: KIND_LABEL[kind] },
                    { key: 'label', label: 'Name', to: label.trim() },
                    { key: 'provider', label: 'Provider', to: providerName.trim() },
                    { key: 'enabled', label: 'Switched on', to: 'Off, until somebody turns it on' },
                  ]
                : []
            }
            confirmLabel="Add the integration"
            receipt="Added, and switched off. Settings and the switch are on the record."
            note="Nothing goes out through it until it is switched on, which is a separate, gated act."
            onCancel={close}
            onConfirm={() => void create()}
          />
        </div>
      </Modal>
    </>
  )
}
