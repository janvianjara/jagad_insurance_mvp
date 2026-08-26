import type { ReactNode } from 'react'
import type { Tone } from '../tone'
import styles from './Card.module.css'

type CardProps = {
  children: ReactNode
  /** Optional heading row. Without it the card is a plain bordered surface. */
  title?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  /** Draws a status stripe down the leading edge, U7 colours. */
  tone?: Tone
  /**
   * Makes the card one hit target. The title becomes the control and its text
   * the accessible name, with the hit area stretched over the whole card — a
   * button wrapped around a definition list would not be valid markup, and a
   * card with no title has nothing to announce, so `onClick` needs `title`.
   */
  onClick?: () => void
  /** Remove the body padding when the card holds a table or a full-bleed image. */
  flush?: boolean
  className?: string
}

/**
 * The default bounded surface: one record, one summary, one thing. Elevation
 * step 1 only — the design system has three steps and a card is never the
 * loudest thing on a screen.
 */
export function Card({
  children,
  title,
  meta,
  actions,
  footer,
  tone,
  onClick,
  flush,
  className,
}: CardProps) {
  const clickable = Boolean(onClick && title)

  return (
    <section
      className={[styles.card, clickable ? styles.clickable : null, className]
        .filter(Boolean)
        .join(' ')}
      data-tone={tone}
    >
      {title || actions ? (
        <div className={styles.head}>
          <div className={styles.headText}>
            {title ? (
              <h3 className={styles.title}>
                {clickable ? (
                  <button type="button" className={styles.titleButton} onClick={onClick}>
                    {title}
                  </button>
                ) : (
                  title
                )}
              </h3>
            ) : null}
            {meta ? <p className={styles.meta}>{meta}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? styles.bodyFlush : styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </section>
  )
}
