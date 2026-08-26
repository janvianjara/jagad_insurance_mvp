import { logoUrl } from './logo'
import styles from './BrandMark.module.css'

const SIZE_CLASS = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
} as const

export type BrandMarkSize = keyof typeof SIZE_CLASS

type BrandMarkProps = {
  size?: BrandMarkSize
  /** Small caps line beside the mark, e.g. the environment or module name. */
  label?: string
  className?: string
}

export function BrandMark({ size = 'md', label, className }: BrandMarkProps) {
  const classes = [styles.brand, SIZE_CLASS[size], className].filter(Boolean).join(' ')

  return (
    <span className={classes} data-brand-source={logoUrl ? 'logo' : 'wordmark'}>
      {logoUrl ? (
        <img className={styles.logo} src={logoUrl} alt="Jagad Insurance" />
      ) : (
        <span className={styles.wordmark} aria-label="Jagad Insurance" role="img">
          <span className={styles.wordmarkLead} aria-hidden="true">
            Jagad
          </span>
          <span className={styles.wordmarkDot} aria-hidden="true" />
        </span>
      )}
      {label ? <span className={styles.label}>{label}</span> : null}
    </span>
  )
}
