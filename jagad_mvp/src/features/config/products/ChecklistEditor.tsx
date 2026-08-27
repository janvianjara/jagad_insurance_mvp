import { useState } from 'react'
import type { ChecklistPurpose } from '../../../data/repo'
import { Button } from '../../../ui/Button'
import { Field, Input } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import { CHECKLIST_PURPOSE_LABELS, GatedAction, checklistFor, useMarketStore } from '../shared'
import type { ConfigProduct } from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

/**
 * One of a product's three document checklists — FR-05.4.
 *
 * A company-wide list is the fallback every product of that company inherits, so
 * the panel says which of the two is answering. Editing writes the product's own
 * list rather than the company's: one product asking for a nominee declaration
 * must not put that demand on every other policy the insurer writes.
 *
 * The save is gated because a checklist is what the KYC, policy and claim screens
 * will refuse to proceed without — changing it changes what a customer is asked
 * for.
 */
export function ChecklistEditor({
  product,
  purpose,
}: {
  product: ConfigProduct
  purpose: ChecklistPurpose
}) {
  const setChecklistItems = useMarketStore((state) => state.setChecklistItems)
  const checklists = useMarketStore((state) => state.checklists)
  const current = checklistFor(checklists, product, purpose)

  const [draft, setDraft] = useState<readonly string[]>(current.items)
  const [entry, setEntry] = useState('')

  const changed =
    draft.length !== current.items.length ||
    draft.some((item, index) => item !== current.items[index])

  const label = CHECKLIST_PURPOSE_LABELS[purpose]

  return (
    <div className={layout.tight} data-checklist={purpose}>
      <div className={styles.chips}>
        <span className={styles.section}>{label}</span>
        <Badge tone={current.ownedByProduct ? 'info' : 'neutral'}>
          {current.ownedByProduct ? 'This product’s own list' : 'Inherited from the company'}
        </Badge>
      </div>

      {draft.length === 0 ? (
        <p className={styles.hint}>Nothing asked for. No document is demanded at this step.</p>
      ) : (
        <ul className={styles.rows}>
          {draft.map((item) => (
            <li key={item} className={styles.row} data-checklist-item={item}>
              <div className={styles.rowHead}>
                <span className={styles.rowName}>{item}</span>
                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  onClick={() => setDraft((rows) => rows.filter((row) => row !== item))}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.inline}>
        <Field label={`Add to ${label.toLowerCase()}`} className={styles.grow}>
          <Input value={entry} onChange={(event) => setEntry(event.target.value)} />
        </Field>
        <Button
          type="button"
          variant="quiet"
          size="sm"
          icon="plus"
          disabled={entry.trim() === '' || draft.includes(entry.trim())}
          onClick={() => {
            setDraft((rows) => [...rows, entry.trim()])
            setEntry('')
          }}
        >
          Add document
        </Button>

        <GatedAction
          label={`Save ${label.toLowerCase()}`}
          variant="primary"
          title={`Save the ${label.toLowerCase()} for ${product.name}`}
          disabled={!changed}
          changes={[
            {
              key: 'items',
              label,
              from: current.items.length === 0 ? 'Nothing asked for' : current.items.join(', '),
              to: draft.length === 0 ? 'Nothing asked for' : draft.join(', '),
            },
            ...(current.ownedByProduct
              ? []
              : [
                  {
                    key: 'scope',
                    label: 'Applies to',
                    from: 'Every product of this company',
                    to: `${product.name} only`,
                  },
                ]),
          ]}
          note="Every customer asked for these documents from now on sees the new list. Documents already collected are untouched."
          confirmLabel="Save"
          toast={{ title: `${label} saved`, detail: product.name }}
          onConfirm={() => setChecklistItems(product.id, purpose, draft)}
        />
      </div>
    </div>
  )
}
