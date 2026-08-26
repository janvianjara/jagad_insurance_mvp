import type { ReactNode } from 'react'
import styles from './Panel.module.css'

type PanelProps = {
  title: string
  /** One line saying what this section is for. Sections that need no explanation take none. */
  description?: string
  actions?: ReactNode
  children: ReactNode
  /** Sub-sections inside a page sit at level 3; a page-level panel stays at 2. */
  level?: 2 | 3
  className?: string
}

/**
 * A titled region of a page, ruled in brand green. Cards hold records; panels
 * hold sections. The green rule is identity, never status — U7 keeps green for
 * positive state, and a section heading has no state.
 */
export function Panel({ title, description, actions, children, level = 2, className }: PanelProps) {
  const Heading = level === 2 ? 'h2' : 'h3'

  return (
    <section className={[styles.panel, className].filter(Boolean).join(' ')}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <Heading className={styles.title}>{title}</Heading>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
