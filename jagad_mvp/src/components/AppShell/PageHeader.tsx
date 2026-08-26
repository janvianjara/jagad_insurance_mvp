import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

export type PageHeaderProps = {
  /** What this screen is. One noun phrase, not a sentence. */
  title: ReactNode
  /** Reference numbers, states, clocks — the facts that identify the record. */
  meta?: ReactNode
  /** One line of orientation, when the title is not enough on its own. */
  description?: ReactNode
  /** Right-aligned. The primary action goes last, as it does everywhere else. */
  actions?: ReactNode
  /** Where this screen sits, for anything more than one level deep. */
  breadcrumb?: ReactNode
}

/**
 * The top of the main column, per the §3 shell diagram: title, meta, actions.
 *
 * Every screen renders its own, rather than pushing a title into a store from an
 * effect. A header that is set by a side effect is a header that flickers the
 * previous screen's title on every navigation, and it makes the title impossible
 * to read off the component you are looking at.
 */
export function PageHeader({ title, meta, description, actions, breadcrumb }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {breadcrumb ? <nav className={styles.breadcrumb}>{breadcrumb}</nav> : null}
      <div className={styles.row}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{title}</h1>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {description ? <p className={styles.description}>{description}</p> : null}
    </header>
  )
}
