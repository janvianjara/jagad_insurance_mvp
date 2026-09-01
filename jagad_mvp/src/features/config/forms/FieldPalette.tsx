/**
 * The palette — where a field comes from.
 *
 * The builder used to ask for a label and a kind on every stage, which meant
 * adding a field was a small form somebody filled in before they could see what
 * they had made. This is the other order: pick the kind, get the field, rename
 * it in place with the preview beside you. Ten cards, one per kind the grammar
 * offers, each saying in one line what it is for.
 *
 * The two cards that carry a rule say so on their face. "Amount" says an amount
 * is typed from a document; "Roll-up" prints the whole of the arithmetic a
 * schema can express. D3 is not a warning somebody meets after choosing badly —
 * it is the description of the control.
 *
 * A card is disabled when the schema has no stage to put a field on, because a
 * field with nowhere to live is not something this builder can make.
 */

import { Icon } from '../../../ui/Icon'
import type { FieldKind } from '../../../domain/forms'
import { KIND_BLURBS, KIND_ICONS, KIND_LABELS, OFFERED_KINDS } from './field-kinds'
import styles from './builder.module.css'

export type FieldPaletteProps = {
  /** The stage a new field lands on — the one somebody last touched. */
  targetStageLabel: string | null
  onAdd: (kind: FieldKind) => void
}

export function FieldPalette({ targetStageLabel, onAdd }: FieldPaletteProps) {
  const ready = targetStageLabel !== null

  return (
    <section className={styles.palette} aria-label="Add a field">
      <h3 className={styles.paneTitle}>Add a field</h3>

      <p className={styles.paneNote}>
        {ready
          ? `Goes to the end of “${targetStageLabel}”. Pick another stage to change where.`
          : 'Add a stage first — a field has to sit on one.'}
      </p>

      <ul className={styles.kinds}>
        {OFFERED_KINDS.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              className={styles.kindCard}
              disabled={!ready}
              data-kind={kind}
              onClick={() => onAdd(kind)}
            >
              <Icon name={KIND_ICONS[kind]} size="sm" className={styles.kindMark} />
              <span className={styles.kindLabel}>{KIND_LABELS[kind]}</span>
              <span className={styles.kindBlurb}>{KIND_BLURBS[kind]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
