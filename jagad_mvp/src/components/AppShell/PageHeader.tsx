import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../ui/Icon'
import styles from './PageHeader.module.css'

export type PageHeaderProps = {
  /** What this screen is. One noun phrase, not a sentence. */
  title: ReactNode
  /** Reference numbers, states, clocks — the facts that identify the record. */
  meta?: ReactNode
  /** Right-aligned. The primary action goes last, as it does everywhere else. */
  actions?: ReactNode
  /** Where this screen sits, for anything more than one level deep. */
  breadcrumb?: ReactNode
  /**
   * The way out of a record, back to the list it came from.
   *
   * Give it a path and a name — `{ to: '/claims', label: 'Claims' }` — and the
   * header draws the one back control the whole product uses.
   *
   * It exists because the product had none. Seven detail screens passed a bare
   * link as `breadcrumb`, which rendered as small grey text in the top corner
   * and read as a label rather than as a control; `/policies/:id` passed nothing
   * at all. The browser button worked and nothing on the page did, which is the
   * kind of gap people report as "there is no back button" — correctly.
   */
  backTo?: { to: string; label: string }
}

/**
 * The top of the main column, per the §3 shell diagram: title, meta, actions.
 *
 * Every screen renders its own, rather than pushing a title into a store from an
 * effect. A header that is set by a side effect is a header that flickers the
 * previous screen's title on every navigation, and it makes the title impossible
 * to read off the component you are looking at.
 */
export function PageHeader({ title, meta, actions, breadcrumb, backTo }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {backTo ? (
        <Link className={styles.back} to={backTo.to}>
          <Icon name="chevron-left" size="sm" />
          {backTo.label}
        </Link>
      ) : null}
      {breadcrumb ? <nav className={styles.breadcrumb}>{breadcrumb}</nav> : null}
      <div className={styles.row}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{title}</h1>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </header>
  )
}
