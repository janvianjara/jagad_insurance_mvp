/**
 * Retention classes — how long a class of record is kept, and what happens when
 * the window runs out.
 *
 * The number matters more than it looks. §9's rule is "a closed policy past its
 * retention class locks; it is never hard-deleted", and `retentionWindowElapsed`
 * in `src/domain/workflows/policy.ts` computes that date from the years held
 * here. Nothing in code says ten: a class with no years configured makes the
 * machine refuse the lock and say so, rather than assuming a period nobody
 * agreed.
 *
 * The refusal sentence beside each class is the domain's own — `canHardDeletePolicy`
 * returns it — so the screen and the machine cannot end up saying different
 * things about what deletion means here.
 */

import { useState } from 'react'
import { Field, FormSection, Input, NumberInput } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import { canHardDeletePolicy } from '../../../domain/workflows'
import type { RetentionClass } from '../../../data/repo'
import { GatedAction } from '../shared'
import { recordsInClass, useComplianceStore } from './compliance-store'
import layout from '../shared/config-layout.module.css'
import styles from './compliance.module.css'

function RetentionCard({ entry }: { entry: RetentionClass }) {
  const documents = useComplianceStore((state) => state.documents)
  const policies = useComplianceStore((state) => state.policies)
  const saveRetentionClass = useComplianceStore((state) => state.saveRetentionClass)

  const [label, setLabel] = useState(entry.label)
  const [years, setYears] = useState<number | null>(entry.years)

  const counts = recordsInClass({ documents, policies }, entry.key)
  const changed = label.trim() !== entry.label || years !== entry.years

  return (
    <li className={styles.card} data-retention-class={entry.key}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{entry.label}</h3>
        <Badge tone="neutral" caps>
          {entry.key}
        </Badge>
      </div>

      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt className={styles.figureLabel}>Years kept</dt>
          <dd className={styles.figureValue}>{entry.years}</dd>
        </div>
        <div className={styles.figure}>
          <dt className={styles.figureLabel}>Documents</dt>
          <dd className={styles.figureValue}>{counts.documents}</dd>
        </div>
        <div className={styles.figure}>
          <dt className={styles.figureLabel}>Policies</dt>
          <dd className={styles.figureValue}>{counts.policies}</dd>
        </div>
        <div className={styles.figure}>
          <dt className={styles.figureLabel}>Closed or locked</dt>
          <dd className={styles.figureValue}>{counts.closed}</dd>
        </div>
      </dl>

      <div className={styles.inline}>
        <Field label="Label">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <Field label="Years" hint="The clock starts when the record closes.">
          <NumberInput value={years} unit="years" min={0} onValueChange={setYears} />
        </Field>
      </div>

      <p className={layout.mono}>
        {`Records store the key "${entry.key}", so it never changes. Only the label and the period do.`}
      </p>

      <GatedAction
        label="Save retention"
        variant="primary"
        title={`Save the "${entry.label}" retention class`}
        disabled={!changed || years === null}
        changes={[
          ...(label.trim() !== entry.label
            ? [{ key: 'label', label: 'Label', from: entry.label, to: label.trim() }]
            : []),
          ...(years !== entry.years
            ? [
                {
                  key: 'years',
                  label: 'Years kept',
                  from: `${entry.years} years`,
                  to: `${years ?? entry.years} years`,
                },
              ]
            : []),
        ]}
        note={`Every record already in this class is measured against the new period from now on. ${counts.closed} closed or locked ${counts.closed === 1 ? 'record' : 'records'} sit in it today. Shortening a period never deletes anything — it only brings forward the day those records lock.`}
        confirmLabel="Save"
        toast={{ title: 'Retention class saved', detail: entry.label }}
        onConfirm={() => saveRetentionClass(entry.id, label, years ?? entry.years)}
      />
    </li>
  )
}

export function RetentionClasses() {
  const retentionClasses = useComplianceStore((state) => state.retentionClasses)
  const deletion = canHardDeletePolicy()

  return (
    <div className={styles.panels}>
      <FormSection
        title="What happens when the window runs out"
        description="Retention is read off the class, never off a constant in code — which is what lets an agency change it, and what makes a class with no period configured a refusal rather than a guess."
      >
        <p className={styles.lock} data-lock-rule="">
          {deletion.ok ? '' : deletion.reason}
        </p>
        <p className={styles.hint}>
          The clock starts when a record closes, not when it was created. Until then a closed policy
          stays readable and editable; after it, the platform locks the record — it stays readable,
          nothing can change it, and there is no path in the workflow that removes it. A record
          whose class has no period configured never locks at all: the machine refuses and names the
          class rather than assuming a period nobody agreed to.
        </p>
      </FormSection>

      <FormSection
        title="Classes"
        description="Every document and policy carries one of these by key. The key is what records store, so it is written once; the label and the period are what an admin changes."
      >
        <ul className={styles.cards} aria-label="Retention classes">
          {retentionClasses.map((entry) => (
            <RetentionCard key={entry.id} entry={entry} />
          ))}
        </ul>
      </FormSection>
    </div>
  )
}
