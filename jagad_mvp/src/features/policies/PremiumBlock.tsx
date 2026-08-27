/**
 * The premium block — plan §5's "premium block per-type with Net roll-up and
 * Final = Net + GST", D3, canvas n17-n25.
 *
 * Three things stacked, and the order is the argument:
 *
 *   1. **The components, each typed.** They come from the product's own schema
 *      roll-up definition, so a motor form and a health form get different
 *      components with no code change. Every one of them is optional forever —
 *      §9 says so twice — and every one enters through `<RecordOnlyAmount>`,
 *      which is the only way an amount enters this product.
 *
 *   2. **The roll-up, derived and read-only.** `<RollUp>` shows Net as the sum
 *      of those components and Final as Net plus the typed GST. That is the only
 *      arithmetic the product allows, and this file does not perform it: it
 *      hands `<RollUp>` the typed figures and `<RollUp>` renders. There is no
 *      value coming back.
 *
 *   3. **The Final Premium, typed.** The figure the policy actually carries, and
 *      the one §9 gates issue on. It is read off the insurer's document and
 *      typed, which is why it sits below the roll-up rather than inside it.
 *
 * The seam between 2 and 3 is the whole point of the screen. The derived total
 * is a cross-check a person can hold against the document in front of them; it
 * is never a source. Nothing here copies the derived figure into the typed one,
 * nothing pre-fills it, and there is no control that offers to. If the two
 * disagree, the disagreement is information — and the platform's job is to
 * record the insurer's figure, not to arbitrate.
 *
 * Consequently there is no function in this file, or anywhere under
 * `src/features/policies/`, that returns a `Money`. That is the record-only
 * stop, and `premium-stop.test.ts` holds it to that in the source itself.
 */

import { RecordOnlyAmount, RollUp } from '../../components/guardrails'
import type { RollUpComponent } from '../../components/guardrails'
import type { Money } from '../../domain/money'
import type { PremiumComponent, PremiumEntry } from './entry-types'
import styles from './PremiumBlock.module.css'

export type PremiumBlockProps = {
  /** The typed parts, the typed GST, and the typed Final. */
  value: PremiumEntry
  onChange: (next: PremiumEntry) => void
  /** What the GST control is called on this form. */
  gstLabel?: string
  /** What the recorded figure is called. Named per §9's "Final Premium". */
  finalLabel?: string
  /** Set while a record is read-only — a locked policy, or a live one. */
  disabled?: boolean
  /** Rendered under the typed Final, e.g. the machine's refusal sentence. */
  error?: string
  className?: string
}

const DERIVED_NOTE =
  'Net and Final above are derived from the figures typed into this block. They are a cross-check against the insurer document, never the figure the policy carries.'

const FINAL_HINT =
  'The figure printed on the insurer document. Type it; the platform never works it out and never copies the derived total into it.'

function withAmount(
  components: readonly PremiumComponent[],
  key: string,
  amount: Money | null,
): readonly PremiumComponent[] {
  return components.map((component) =>
    component.key === key ? { ...component, amount } : component,
  )
}

/** What `<RollUp>` reads. Recorded components only; an unrecorded one is absent. */
function rollUpComponents(components: readonly PremiumComponent[]): readonly RollUpComponent[] {
  const recorded: RollUpComponent[] = []
  for (const component of components) {
    if (component.amount === null) continue
    recorded.push({ key: component.key, label: component.label, amount: component.amount })
  }
  return recorded
}

export function PremiumBlock({
  value,
  onChange,
  gstLabel = 'GST',
  finalLabel = 'Final premium',
  disabled = false,
  error,
  className,
}: PremiumBlockProps) {
  return (
    <section
      className={[styles.block, className].filter(Boolean).join(' ')}
      aria-label="Premium"
      data-premium-block=""
    >
      <div className={styles.typed}>
        {value.components.map((component) => (
          <RecordOnlyAmount
            key={component.key}
            id={`premium-${component.key}`}
            name={component.key}
            label={component.label}
            value={component.amount}
            disabled={disabled}
            onValueChange={(amount) =>
              onChange({ ...value, components: withAmount(value.components, component.key, amount) })
            }
          />
        ))}

        <RecordOnlyAmount
          id="premium-gst"
          name="gstAmount"
          label={gstLabel}
          value={value.gst}
          disabled={disabled}
          onValueChange={(gst) => onChange({ ...value, gst })}
        />
      </div>

      <RollUp
        components={rollUpComponents(value.components)}
        gst={value.gst}
        note={DERIVED_NOTE}
        className={styles.derived}
      />

      <div className={styles.recorded}>
        <RecordOnlyAmount
          id="premium-final"
          name="finalPremium"
          label={finalLabel}
          value={value.finalPremium}
          required
          disabled={disabled}
          hint={FINAL_HINT}
          error={error}
          onValueChange={(finalPremium) => onChange({ ...value, finalPremium })}
        />
      </div>
    </section>
  )
}
