import { useState } from 'react'
import type { ConfirmChange } from '../../../components/guardrails'
import { INTEGRATION_CHECK_OUTCOMES } from '../../../data/repo'
import type {
  IntegrationCheckOutcome,
  IntegrationConfig,
  IntegrationSettings,
} from '../../../data/repo'
import { Button } from '../../../ui/Button'
import { Field, Input, Select } from '../../../ui/form'
import { Icon } from '../../../ui/Icon'
import { StatusPill } from '../../../ui/signal'
import { DateTime, KeyValueList } from '../../../ui/type'
import { GatedAction } from '../shared'
import { KIND_LABEL } from './integrations-queue'
import { credentialRefusal, forbiddenIn, rowsFrom, settingsFrom } from './settings-draft'
import type { SettingRow } from './settings-draft'
import styles from './integrations.module.css'

export type IntegrationDrawerProps = {
  integration: IntegrationConfig
  authorName: string
  canEdit: boolean
  onSave: (label: string, providerName: string, settings: IntegrationSettings) => void
  onSetEnabled: (enabled: boolean) => void
  onRecordCheck: (outcome: IntegrationCheckOutcome, note: string | null) => void
}

let nextRowId = 0

/**
 * One integration, edited — plan §8's `IntegrationConfig`, canvas flow 6.
 *
 * The drawer's shape is the posture. There is no password field, no key field
 * and no "paste your token here" — not because they are hidden, but because the
 * record has nowhere to put one. What an admin edits is which provider, whether
 * the channel is switched on, and the handful of non-secret settings they
 * actually need to see: a sender id, a from-address, a region.
 *
 * A key that reads like a credential is refused twice over. The screen says so
 * before Save is reachable, and the repository refuses the same names with its
 * own sentence if a save ever gets past here — the rule holds against a screen
 * as well as against a fixture.
 *
 * Recording a check is a record, not a test. Nothing here calls the provider and
 * nothing switches itself on or off because of an outcome; a person exercised
 * the channel and wrote down what came back.
 */
export function IntegrationDrawer({
  integration,
  authorName,
  canEdit,
  onSave,
  onSetEnabled,
  onRecordCheck,
}: IntegrationDrawerProps) {
  const [label, setLabel] = useState(integration.label)
  const [providerName, setProviderName] = useState(integration.providerName)
  const [rows, setRows] = useState<readonly SettingRow[]>(() => rowsFrom(integration.settings))
  const [outcome, setOutcome] = useState<IntegrationCheckOutcome>(INTEGRATION_CHECK_OUTCOMES.ok)
  const [checkNote, setCheckNote] = useState('')

  const forbidden = forbiddenIn(rows)
  const settings = settingsFrom(rows)

  function edit(id: string, patch: Partial<SettingRow>) {
    setRows((held) => held.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function addRow() {
    nextRowId += 1
    setRows((held) => [...held, { id: `new-${nextRowId}`, name: '', value: '', kind: 'string' }])
  }

  function removeRow(id: string) {
    setRows((held) => held.filter((row) => row.id !== id))
  }

  const settingsChanged = JSON.stringify(settings) !== JSON.stringify(integration.settings)
  const changes: readonly ConfirmChange[] = [
    ...(label.trim() === integration.label
      ? []
      : [{ key: 'label', label: 'Name', from: integration.label, to: label.trim() }]),
    ...(providerName.trim() === integration.providerName
      ? []
      : [{ key: 'provider', label: 'Provider', from: integration.providerName, to: providerName.trim() }]),
    ...(settingsChanged
      ? [
          {
            key: 'settings',
            label: 'Settings',
            from: Object.keys(integration.settings).join(', ') || 'none',
            to: Object.keys(settings).join(', ') || 'none',
          },
        ]
      : []),
  ]

  return (
    <div className={styles.drawer}>
      <KeyValueList
        columns={2}
        items={[
          { key: 'key', label: 'Key', value: <span className={styles.key}>{integration.key}</span> },
          { key: 'kind', label: 'Kind', value: KIND_LABEL[integration.kind] },
          {
            key: 'enabled',
            label: 'Switched on',
            value: (
              <StatusPill tone={integration.enabled ? 'ok' : 'idle'}>
                {integration.enabled ? 'On' : 'Off'}
              </StatusPill>
            ),
          },
          {
            key: 'checked',
            label: 'Last exercised',
            value:
              integration.lastCheckedAt === null ? null : (
                <DateTime value={integration.lastCheckedAt} mode="datetime" />
              ),
          },
          { key: 'note', label: 'The provider said', value: integration.lastCheckNote },
          {
            key: 'updated',
            label: 'Last saved',
            value: (
              <>
                <DateTime value={integration.updatedAt} mode="date" /> · {authorName}
              </>
            ),
          },
        ]}
      />

      <div className={styles.posture} role="note">
        <Icon name="lock" size="md" />
        <div className={styles.postureBody}>
          <p className={styles.postureTitle}>This platform stores no credentials</p>
          <p className={styles.prose}>
            No API key, token, password or sender secret is held here, for {integration.providerName}{' '}
            or for anybody else. They live in the provider’s own console, exactly as a mandate’s
            bank credential lives with the bank. What this record holds is which provider, whether
            the channel is switched on, and the settings a person needs to be able to read.
          </p>
        </div>
      </div>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>What it is</h3>

        <Field label="Name">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={!canEdit}
            autoComplete="off"
          />
        </Field>

        <Field label="Provider" hint="Who provides it, as a person would say it.">
          <Input
            value={providerName}
            onChange={(event) => setProviderName(event.target.value)}
            disabled={!canEdit}
            autoComplete="off"
          />
        </Field>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Non-secret settings</h3>
        <p className={styles.prose}>
          Sender id, from-address, endpoint region, page limits — the things an admin has to be able
          to see. Anything that would need hiding does not belong here at all.
        </p>

        <ul className={styles.settingRows}>
          {rows.map((row) => (
            <li key={row.id} className={styles.settingRow}>
              <Field label="Setting">
                <Input
                  value={row.name}
                  onChange={(event) => edit(row.id, { name: event.target.value })}
                  disabled={!canEdit}
                  autoComplete="off"
                />
              </Field>
              <Field label="Value">
                <Input
                  value={row.value}
                  onChange={(event) => edit(row.id, { value: event.target.value })}
                  disabled={!canEdit}
                  autoComplete="off"
                />
              </Field>
              <Button
                variant="quiet"
                size="sm"
                icon="close"
                label={`Remove ${row.name === '' ? 'this setting' : row.name}`}
                disabled={!canEdit}
                onClick={() => removeRow(row.id)}
              />
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <Button variant="quiet" size="sm" icon="plus" disabled={!canEdit} onClick={addRow}>
            Add a setting
          </Button>
        </div>

        {forbidden.length === 0 ? null : (
          <p className={styles.refusal} role="alert">
            {credentialRefusal(forbidden)}
          </p>
        )}
      </section>

      <div className={styles.actions}>
        <GatedAction
          label="Save integration"
          title={`Save ${integration.key}`}
          variant="primary"
          size="md"
          disabled={!canEdit || forbidden.length > 0 || changes.length === 0}
          changes={forbidden.length > 0 ? [] : changes}
          note="Nothing outward happens on save. The settings are what this platform will show a person; the provider's own console is where the channel is actually configured."
          confirmLabel="Save the settings"
          receipt="Saved."
          toast={{ title: `${integration.key} saved` }}
          onConfirm={() => onSave(label.trim(), providerName.trim(), settings)}
        />

        <GatedAction
          label={integration.enabled ? 'Switch off' : 'Switch on'}
          title={`${integration.enabled ? 'Switch off' : 'Switch on'} ${integration.key}`}
          disabled={!canEdit}
          variant={integration.enabled ? 'quiet' : 'primary'}
          size="md"
          changes={[
            {
              key: 'enabled',
              label: 'Switched on',
              from: integration.enabled ? 'On' : 'Off',
              to: integration.enabled ? 'Off' : 'On',
            },
          ]}
          note={
            integration.enabled
              ? 'Switching this off stops everything that goes out through it. Recipes still run; they simply have no channel to send on, and the message log will say so.'
              : 'Switching an outward channel on is a deliberate act. From here, recipes naming this channel will send.'
          }
          receipt="Done."
          onConfirm={() => onSetEnabled(!integration.enabled)}
        />
      </div>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Record a check</h3>
        <p className={styles.prose}>
          Somebody exercised the channel and this is what came back, written down exactly as the
          provider said it. Nothing is inferred from it and nothing switches itself on or off
          because of it.
        </p>

        <div className={styles.check}>
          <Field label="What happened">
            <Select
              value={outcome}
              options={[
                { value: INTEGRATION_CHECK_OUTCOMES.ok, label: 'It answered' },
                { value: INTEGRATION_CHECK_OUTCOMES.failed, label: 'It failed' },
              ]}
              disabled={!canEdit}
              onChange={(event) => setOutcome(event.target.value as IntegrationCheckOutcome)}
            />
          </Field>
          <Field label="The provider’s own words" hint="Never a credential.">
            <Input
              value={checkNote}
              onChange={(event) => setCheckNote(event.target.value)}
              disabled={!canEdit}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className={styles.actions}>
          <GatedAction
            label="Record the check"
            title={`Record a check on ${integration.key}`}
            disabled={!canEdit}
            changes={[
              {
                key: 'outcome',
                label: 'Outcome',
                from: integration.lastCheckOutcome ?? 'never exercised',
                to: outcome === 'ok' ? 'It answered' : 'It failed',
              },
              {
                key: 'note',
                label: 'The provider said',
                from: integration.lastCheckNote ?? 'nothing recorded',
                to: checkNote.trim() === '' ? 'nothing recorded' : checkNote.trim(),
              },
            ]}
            note="A record, not a test. This does not call the provider."
            receipt="Recorded."
            onConfirm={() => onRecordCheck(outcome, checkNote.trim() === '' ? null : checkNote.trim())}
          />
        </div>
      </section>
    </div>
  )
}
