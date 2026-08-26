import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './FormSection.module.css'

export type FormSectionProps = {
  title: ReactNode
  children: ReactNode
  description?: ReactNode
  /** Section-level controls — "Copy from proposer", "Add nominee". */
  actions?: ReactNode
  className?: string
}

/** One stage of a form: a titled rule, an optional explanation, and the fields. */
export function FormSection({
  title,
  children,
  description,
  actions,
  className,
}: FormSectionProps) {
  return (
    <section className={cx(styles.section, className)}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <h3 className={styles.title}>{title}</h3>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
