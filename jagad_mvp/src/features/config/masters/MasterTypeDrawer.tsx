import { useState } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import { useResource } from '../../../lib/useResource'
import { Button } from '../../../ui/Button'
import { Field, FormSection, Input, Select } from '../../../ui/form'
import { Badge, StatusPill } from '../../../ui/signal'
import { Accordion } from '../../../ui/surface'
import { DateTime } from '../../../ui/type'
import {
  GatedAction,
  InlineMasterAdd,
  NO_USAGE,
  describeUsage,
  useConfigStore,
  usageOf,
} from '../shared'
import type { ConfigMasterType, MasterUsage } from '../shared'
import { DeleteValueAction } from './DeleteValueAction'
import layout from '../shared/config-layout.module.css'
import styles from './masters.module.css'

/**
 * One master type, with its values — FR-02, canvas flow 6.
 *
 * The three things P-10a asks of masters all live in this panel, and each is
 * visible rather than implied:
 *
 *   **Cascade.** A type can name a parent type — Model cascades from Make — and
 *   then every value belongs to a parent value. The add row asks which one, so
 *   an orphaned Model cannot be created by accident.
 *   **Versioning.** A value's key is what records store, so it never changes;
 *   the label is versioned, and every rename and deactivation is kept as a
 *   revision a person can read back.
 *   **Deactivate, not delete.** Handled by `<DeleteValueAction>`, which asks the
 *   repositories how many records hold the value before it will consider it.
 */
export function MasterTypeDrawer({ type }: { type: ConfigMasterType }) {
  const repositories = useRepositories()
  const revision = useConfigStore((state) => state.revision)
  const masterTypes = useConfigStore((state) => state.masterTypes)
  const masterValues = useConfigStore((state) => state.masterValues)
  const saveMasterType = useConfigStore((state) => state.saveMasterType)
  const setMasterValueActive = useConfigStore((state) => state.setMasterValueActive)
  const renameMasterValue = useConfigStore((state) => state.renameMasterValue)

  const [label, setLabel] = useState(type.label)
  const [parentTypeId, setParentTypeId] = useState(type.parentTypeId ?? '')
  const [addUnder, setAddUnder] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const values = masterValues
    .filter((value) => value.masterTypeId === type.id)
    .toSorted((a, b) => a.sortOrder - b.sortOrder)

  const parentType = type.parentTypeId
    ? (masterTypes.find((candidate) => candidate.id === type.parentTypeId) ?? null)
    : null

  const parentValues = parentType
    ? masterValues.filter((value) => value.masterTypeId === parentType.id && value.active)
    : []

  /**
   * Counting use is a read across the repositories, so it is a resource like any
   * other — keyed by the store's revision, because deactivating a value changes
   * what the next answer should say.
   */
  const usage = useResource(async () => {
    const entries = await Promise.all(
      values.map(async (value) => [value.id, await usageOf(repositories, type, value)] as const),
    )
    return Object.fromEntries(entries) as Record<string, MasterUsage>
  }, `masters:usage:${type.id}:${revision}`)

  const typeChanged = label.trim() !== type.label || (parentTypeId || null) !== type.parentTypeId

  return (
    <div className={styles.drawer}>
      <FormSection
        title="The master"
        description={
          type.editable
            ? 'An agency master: its values are configuration, and every form that offers this list reads it from here.'
            : 'A platform master. The product’s own logic reads these values by key, so the list is fixed.'
        }
      >
        <Field label="Name" required>
          <Input
            value={label}
            disabled={!type.editable}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>

        <Field
          label="Cascades from"
          hint="Make to Model: every value here belongs to one value of the parent master."
        >
          <Select
            value={parentTypeId}
            disabled={!type.editable}
            placeholder="A flat list, no parent"
            options={masterTypes
              .filter((candidate) => candidate.id !== type.id && candidate.parentTypeId === null)
              .map((candidate) => ({ value: candidate.id, label: candidate.label }))}
            onChange={(event) => setParentTypeId(event.target.value)}
          />
        </Field>

        <p className={layout.mono}>
          {type.key} · version {type.version}
        </p>

        {type.editable ? (
          <GatedAction
            label="Save master"
            variant="primary"
            title={`Save "${type.label}"`}
            disabled={!typeChanged}
            changes={[
              ...(label.trim() !== type.label
                ? [{ key: 'label', label: 'Name', from: type.label, to: label.trim() }]
                : []),
              ...((parentTypeId || null) !== type.parentTypeId
                ? [
                    {
                      key: 'parent',
                      label: 'Cascades from',
                      from: parentType?.label ?? 'A flat list',
                      to:
                        masterTypes.find((candidate) => candidate.id === parentTypeId)?.label ??
                        'A flat list',
                    },
                  ]
                : []),
            ]}
            note="Every form that offers this master changes with it. The stored key is untouched, so records keep resolving."
            confirmLabel="Save"
            toast={{ title: `"${label.trim()}" saved` }}
            onConfirm={() =>
              saveMasterType({
                id: type.id,
                label: label.trim(),
                parentTypeId: parentTypeId === '' ? null : parentTypeId,
              })
            }
          />
        ) : null}
      </FormSection>

      <FormSection
        title={`Values (${values.filter((value) => value.active).length} active of ${values.length})`}
        description="A value's key is what records store. Renaming changes the label and keeps the key, which is what makes a rename safe."
      >
        {values.length === 0 ? (
          <p className={layout.muted}>No values yet.</p>
        ) : (
          <ul className={styles.values}>
            {values.map((value) => {
              const used = usage.data?.[value.id] ?? NO_USAGE
              const children = masterValues.filter(
                (candidate) => candidate.parentValueId === value.id,
              )
              const parent = value.parentValueId
                ? (masterValues.find((candidate) => candidate.id === value.parentValueId) ?? null)
                : null

              return (
                <li
                  key={value.id}
                  className={styles.value}
                  data-value-key={value.key}
                  data-inactive={!value.active || undefined}
                >
                  <div className={styles.valueHead}>
                    <span className={styles.valueName}>{value.label}</span>
                    <StatusPill tone={value.active ? 'ok' : 'idle'} size="sm">
                      {value.active ? 'Active' : 'Deactivated'}
                    </StatusPill>
                  </div>

                  <div className={styles.valueMeta}>
                    <span className={layout.mono}>{value.key}</span>
                    <span className={styles.version}>v{value.version}</span>
                    {parent ? <Badge tone="neutral">under {parent.label}</Badge> : null}
                    {children.length > 0 ? (
                      <Badge tone="info">{children.length} cascading</Badge>
                    ) : null}
                    <span>{usage.isLoading ? 'Counting use…' : describeUsage(used)}</span>
                  </div>

                  {renaming === value.id ? (
                    <div className={styles.rename}>
                      <Field label={`Rename ${value.label}`} className={styles.renameField}>
                        <Input
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() => setRenaming(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          renameMasterValue(value.id, renameDraft)
                          setRenaming(null)
                        }}
                      >
                        Save name
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.valueActions}>
                      {type.editable ? (
                        <>
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            onClick={() => {
                              setRenaming(value.id)
                              setRenameDraft(value.label)
                            }}
                          >
                            Rename
                          </Button>

                          <GatedAction
                            label={value.active ? 'Deactivate' : 'Reactivate'}
                            title={`${value.active ? 'Deactivate' : 'Reactivate'} "${value.label}"`}
                            changes={[
                              {
                                key: 'active',
                                label: type.label,
                                from: value.active ? 'Offered on forms' : 'Deactivated',
                                to: value.active ? 'Deactivated' : 'Offered on forms',
                              },
                            ]}
                            note={
                              value.active
                                ? 'Records that already hold it keep it. No new record can choose it.'
                                : 'Forms offer it again from now on.'
                            }
                            confirmLabel={value.active ? 'Deactivate' : 'Reactivate'}
                            toast={{
                              title: `"${value.label}" is ${value.active ? 'deactivated' : 'active'}`,
                            }}
                            onConfirm={() => setMasterValueActive(value.id, !value.active)}
                          />

                          <DeleteValueAction
                            type={type}
                            value={value}
                            usage={used}
                            childCount={children.length}
                          />
                        </>
                      ) : (
                        <span className={layout.muted}>
                          Platform values are neither renamed nor removed here.
                        </span>
                      )}
                    </div>
                  )}

                  <Accordion
                    mode="single"
                    items={[
                      {
                        id: `${value.id}-history`,
                        title: `History — ${value.revisions.length} version${value.revisions.length === 1 ? '' : 's'}`,
                        content: (
                          <ul className={styles.history}>
                            {value.revisions.map((entry) => (
                              <li key={entry.version} className={styles.historyLine}>
                                <span className={styles.version}>v{entry.version}</span>
                                <span>{entry.label}</span>
                                <DateTime value={entry.changedAt} mode="datetime" />
                                <span>{entry.note}</span>
                              </li>
                            ))}
                          </ul>
                        ),
                      },
                    ]}
                  />
                </li>
              )
            })}
          </ul>
        )}

        {type.editable ? (
          <div className={layout.tight}>
            {parentType ? (
              <Field
                label={`Add under which ${parentType.label.toLowerCase()}`}
                hint="A cascading master needs a parent for every value."
              >
                <Select
                  value={addUnder}
                  placeholder={`Choose a ${parentType.label.toLowerCase()}`}
                  options={parentValues.map((parent) => ({
                    value: parent.id,
                    label: parent.label,
                  }))}
                  onChange={(event) => setAddUnder(event.target.value)}
                />
              </Field>
            ) : null}

            <InlineMasterAdd
              masterTypeKey={type.key}
              parentValueId={parentType ? (addUnder === '' ? null : addUnder) : undefined}
            />
          </div>
        ) : null}
      </FormSection>
    </div>
  )
}
