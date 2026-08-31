import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../../ui/Button'
import { Icon } from '../../../ui/Icon'
import { ConfirmGate, RecordOnlyAmount } from '../../../components/guardrails'
import type { RecordOnlyAmountProps } from '../../../components/guardrails'
import { CellValue } from './CellValue'
import type { ActBlock, ChoiceBlock, FileBlock, StopBlock } from './blocks'
import styles from './BlockRenderer.module.css'

/**
 * The four blocks that do something — the half of the prototype's vocabulary
 * that is not a read.
 *
 * They are in their own module because they are the only stateful things in the
 * renderer. A `para` or a `table` is a pure function of its block; an `act`
 * remembers whether it has been confirmed, a `choice` remembers what was picked,
 * and a `stop` holds the figures a person is typing. Keeping them apart means
 * `BlockRenderer` stays a switch and the state lives with the thing that owns it.
 *
 * Each is bound to an invariant rather than to a visual, and the binding is the
 * point of the component:
 *
 *   Act   goes through `<ConfirmGate>`. Not a look-alike — the real one, with
 *         its refusal to confirm an empty preview and its tested promise that
 *         Cancel invokes nothing (FR-22.4).
 *   Stop  is built from `<RecordOnlyAmount>`, which has no placeholder a system
 *         could fill and no seam a computation could be threaded through (D3).
 *
 * On the receipts. An Act's receipt may only claim what confirming actually
 * does. The Assistant reads through a projection facade that has no write
 * methods on it, so an Act here drafts the change and hands it to the module
 * that owns the write — and the receipt says so and links there. That is a
 * smaller promise than the prototype's "Assigned. All four notified", and it is
 * the true one.
 */

function HandOff({ handOff }: { handOff: { label: string; to: string } }) {
  return (
    <Link className={styles.handOff} to={handOff.to}>
      {handOff.label}
      <Icon name="chevron-right" size="sm" />
    </Link>
  )
}

export function Act({ block }: { block: ActBlock }) {
  return (
    <ConfirmGate
      className={styles.gate}
      title={
        <span className={styles.gateTitle}>
          <span>{block.title}</span>
          {block.tag ? <span className={styles.cardTag}>{block.tag}</span> : null}
        </span>
      }
      changes={block.items.map((item) => ({
        key: item.key,
        label: item.label,
        to: <CellValue cell={item.value} />,
      }))}
      note={block.hint}
      confirmLabel={block.confirmLabel}
      receipt={
        <span className={styles.receipt}>
          <span>{block.receipt}</span>
          {block.handOff ? <HandOff handOff={block.handOff} /> : null}
        </span>
      }
      onConfirm={() => {
        // Deliberately empty, and deliberately not hidden behind a helper that
        // looks like it writes. The change is made in the module the receipt
        // names, under that module's own gate and its own audit trail.
      }}
    />
  )
}

export function Choice({ block }: { block: ChoiceBlock }) {
  const [picked, setPicked] = useState<string | null>(null)
  const chosen = block.options.find((option) => option.id === picked) ?? null

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span>{block.title}</span>
        {block.tag ? <span className={styles.cardTag}>{block.tag}</span> : null}
      </div>

      <p className={styles.note}>{block.current}</p>

      {chosen ? (
        <p className={styles.done} role="status">
          <Icon name="check" size="sm" />
          <span>
            {block.receipt.replace('{choice}', chosen.label)}
            {block.handOff ? <HandOff handOff={block.handOff} /> : null}
          </span>
        </p>
      ) : (
        <div className={styles.options} role="group" aria-label={`${block.title} — pick one`}>
          <span className={styles.optionsLabel}>Pick one</span>
          {block.options.map((option) => (
            <Button key={option.id} size="sm" onClick={() => setPicked(option.id)}>
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export function File({ block, onOpen }: { block: FileBlock; onOpen: (id: string) => void }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span>Document ready</span>
        <span className={styles.cardTag}>Generated</span>
      </div>

      <div className={styles.file}>
        <span className={styles.fileMark} aria-hidden="true">
          <Icon name="doc" />
        </span>
        <span className={styles.fileText}>
          <span className={styles.fileName}>{block.name}</span>
          <span className={styles.fileMeta}>{block.meta}</span>
          <span className={styles.fileMeta}>{block.note}</span>
        </span>
      </div>

      <div className={styles.fileActions}>
        {/*
          Open, and only Open. The prototype offers "Share on WhatsApp" beside
          it; sending is an outward mutation and this surface has no way to make
          one, so the button is not here rather than here and inert.
        */}
        <span className={styles.hint}>
          Nothing is sent from here. The record's own screen sends it, through its
          confirmation gate.
        </span>
        <Button variant="primary" size="sm" icon="doc" onClick={() => onOpen(block.documentId)}>
          Open
        </Button>
      </div>
    </div>
  )
}

export function Stop({ block }: { block: StopBlock }) {
  // The amount type comes off the control's own prop rather than from
  // `src/domain/money`: this feature may not import a domain type at all
  // (FR-22.13), and the control is the authority on what it emits anyway.
  const [typed, setTyped] = useState<Readonly<Record<string, RecordOnlyAmountProps['value']>>>({})

  return (
    <div className={`${styles.card} ${styles.stop}`}>
      <div className={styles.cardHead}>
        <span>{block.title}</span>
        <span className={styles.cardTag}>Entered by you</span>
      </div>

      <p className={styles.stopBody}>{block.body}</p>

      <div className={styles.stopFields}>
        {block.fields.map((field) => (
          <RecordOnlyAmount
            key={field.key}
            label={field.label}
            value={typed[field.key] ?? null}
            onValueChange={(value) => setTyped((previous) => ({ ...previous, [field.key]: value }))}
          />
        ))}
      </div>

      <p className={styles.note}>
        Typed here, these figures are not recorded — this is the Assistant showing
        you where the boundary is, not the form that keeps them.
        {block.handOff ? <HandOff handOff={block.handOff} /> : null}
      </p>
    </div>
  )
}
