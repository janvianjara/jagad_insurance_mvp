import { useState } from 'react'
import { Button } from '../../../ui/Button'
import { Field, Input, Select } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import {
  GatedAction,
  LINE_LABELS,
  benefitById,
  benefitsForLine,
  mapsOfProduct,
  useMarketStore,
} from '../shared'
import type { BenefitSheetRow, ConfigProduct } from '../shared'
import styles from '../shared/market-panels.module.css'
import layout from '../shared/config-layout.module.css'

function move(rows: readonly BenefitSheetRow[], index: number, delta: number): readonly BenefitSheetRow[] {
  const target = index + delta
  if (target < 0 || target >= rows.length) return rows
  const next = [...rows]
  const [row] = next.splice(index, 1)
  next.splice(target, 0, row)
  return next
}

/**
 * The policy-to-benefit map — FR-05.7, and the reason canvas 2.1 can open a
 * comparison on "the union of mapped benefit rows, defaults pre-filled".
 *
 * Two things this editor deliberately does not do. It does not derive a reading:
 * every value is the wording a person lifted off the brochure, offered back as
 * an option only where the catalogue holds one. And it does not save a row at a
 * time — the sheet is previewed and confirmed as one change, because what it
 * changes is what every future quotation for this product will print.
 */
export function BenefitSheetEditor({ product }: { product: ConfigProduct }) {
  const benefitItems = useMarketStore((state) => state.benefitItems)
  const benefitMaps = useMarketStore((state) => state.benefitMaps)
  const saveBenefitSheet = useMarketStore((state) => state.saveBenefitSheet)

  const saved = mapsOfProduct(benefitMaps, product.id).map((row) => ({
    benefitItemId: row.benefitItemId,
    defaultValue: row.defaultValue,
  }))

  const [draft, setDraft] = useState<readonly BenefitSheetRow[]>(saved)

  const catalogue = benefitsForLine(benefitItems, product.line)
  const carriedIds = draft.map((row) => row.benefitItemId)
  const offered = catalogue.filter((item) => item.active && !carriedIds.includes(item.id))

  function labelOf(benefitItemId: string): string {
    return benefitById(benefitItems, benefitItemId)?.label ?? 'A benefit no longer in the catalogue'
  }

  const added = draft.filter(
    (row) => !saved.some((entry) => entry.benefitItemId === row.benefitItemId),
  )
  const removed = saved.filter(
    (row) => !draft.some((entry) => entry.benefitItemId === row.benefitItemId),
  )
  const reworded = draft.filter((row) => {
    const before = saved.find((entry) => entry.benefitItemId === row.benefitItemId)
    return before !== undefined && before.defaultValue !== row.defaultValue
  })
  const resorted = draft.some(
    (row, index) => saved[index] !== undefined && saved[index].benefitItemId !== row.benefitItemId,
  )

  const changed = added.length > 0 || removed.length > 0 || reworded.length > 0 || resorted

  return (
    <div className={layout.tight}>
      {draft.length === 0 ? (
        <p className={styles.hint}>
          This product carries no benefit. A comparison including it would print an empty column.
        </p>
      ) : (
        <ul className={styles.rows}>
          {draft.map((row, index) => {
            const item = benefitById(benefitItems, row.benefitItemId)
            return (
              <li key={row.benefitItemId} className={styles.row} data-benefit={row.benefitItemId}>
                <div className={styles.rowHead}>
                  <span className={styles.rowName}>{labelOf(row.benefitItemId)}</span>
                  {item ? <Badge tone="neutral">{item.section}</Badge> : null}
                </div>

                <Field label={`${labelOf(row.benefitItemId)} reads`}>
                  {item && item.options.length > 0 ? (
                    <Select
                      value={row.defaultValue}
                      placeholder="Nothing pre-filled"
                      options={item.options.map((option) => ({ value: option, label: option }))}
                      onChange={(event) =>
                        setDraft((rows) =>
                          rows.map((entry) =>
                            entry.benefitItemId === row.benefitItemId
                              ? { ...entry, defaultValue: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  ) : (
                    <Input
                      value={row.defaultValue}
                      onChange={(event) =>
                        setDraft((rows) =>
                          rows.map((entry) =>
                            entry.benefitItemId === row.benefitItemId
                              ? { ...entry, defaultValue: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  )}
                </Field>

                <div className={styles.rowActions}>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={() => setDraft((rows) => move(rows, index, -1))}
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={() => setDraft((rows) => move(rows, index, 1))}
                  >
                    Move down
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={() =>
                      setDraft((rows) =>
                        rows.filter((entry) => entry.benefitItemId !== row.benefitItemId),
                      )
                    }
                  >
                    Remove from sheet
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className={styles.chips}>
        <span className={styles.section}>{LINE_LABELS[product.line]} catalogue</span>
        {offered.length === 0 ? (
          <span className={styles.hint}>Every active benefit of this line is on the sheet.</span>
        ) : (
          offered.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="quiet"
              size="sm"
              icon="plus"
              onClick={() =>
                setDraft((rows) => [
                  ...rows,
                  { benefitItemId: item.id, defaultValue: item.defaultValue },
                ])
              }
            >
              {item.label}
            </Button>
          ))
        )}
      </div>

      <GatedAction
        label="Save benefit sheet"
        variant="primary"
        title={`Save the benefit sheet for ${product.name}`}
        disabled={!changed}
        changes={[
          ...(added.length > 0
            ? [
                {
                  key: 'added',
                  label: 'Added to the sheet',
                  to: added.map((row) => labelOf(row.benefitItemId)).join(', '),
                },
              ]
            : []),
          ...(removed.length > 0
            ? [
                {
                  key: 'removed',
                  label: 'Taken off the sheet',
                  from: removed.map((row) => labelOf(row.benefitItemId)).join(', '),
                  to: 'Not carried',
                },
              ]
            : []),
          ...reworded.map((row) => ({
            key: `reading-${row.benefitItemId}`,
            label: labelOf(row.benefitItemId),
            from:
              saved.find((entry) => entry.benefitItemId === row.benefitItemId)?.defaultValue ||
              'Nothing pre-filled',
            to: row.defaultValue || 'Nothing pre-filled',
          })),
          ...(resorted && added.length === 0 && removed.length === 0 && reworded.length === 0
            ? [{ key: 'order', label: 'Row order', to: 'Reordered' }]
            : []),
        ]}
        note="Quotations already sent keep the readings they were sent with. This is what the next comparison opens on."
        confirmLabel="Save sheet"
        toast={{ title: 'Benefit sheet saved', detail: product.name }}
        onConfirm={() => saveBenefitSheet(product.id, draft)}
      />
    </div>
  )
}
