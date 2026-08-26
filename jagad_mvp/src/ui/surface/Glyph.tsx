import styles from './Glyph.module.css'

/**
 * Chrome affordances the icon sprite does not carry.
 *
 * `src/assets/icons.svg` is a domain sprite — inbox, shield, coin, clock. It has
 * no chevron, no close cross, no sort caret, and this step does not own the
 * sprite, so the handful of geometric marks that every disclosure, dismissal and
 * sort control needs are drawn in CSS instead of invented as icons. They are
 * decoration: the accessible name always lives on the control that contains one.
 */
const KINDS = {
  close: 'close',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  sort: 'sort',
  maximise: 'maximise',
  restore: 'restore',
} as const

export type GlyphKind = keyof typeof KINDS

const KIND_CLASS: Record<GlyphKind, string> = {
  close: styles.close,
  up: styles.up,
  down: styles.down,
  left: styles.left,
  right: styles.right,
  sort: styles.sort,
  maximise: styles.maximise,
  restore: styles.restore,
}

export function Glyph({ kind, className }: { kind: GlyphKind; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-glyph={KINDS[kind]}
      className={[styles.glyph, KIND_CLASS[kind], className].filter(Boolean).join(' ')}
    />
  )
}
