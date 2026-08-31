import type { ReactNode } from 'react'
import { BrandMark } from '../../ui/BrandMark'
import styles from './auth.module.css'

/**
 * The frame both sign-in screens render inside.
 *
 * It holds the brand, the ground and the honesty line at the foot, and it holds
 * nothing else: no navigation, no account chip, no notification bell. There is
 * nobody signed in to offer any of that to, and a page that borrows chrome from
 * the shell would be a page that has imported the shell.
 */
export function AuthFrame({
  children,
  aside,
  narrow = false,
}: {
  children: ReactNode
  /** The second column on a wide screen. Omitted by the code challenge. */
  aside?: ReactNode
  narrow?: boolean
}) {
  const cardClass = [styles.card, narrow ? styles.narrow : null].filter(Boolean).join(' ')

  return (
    <main className={styles.page}>
      <div className={cardClass}>
        <div className={styles.primary}>
          <BrandMark size="lg" label="Agency console" />
          {children}
          <p className={styles.footer}>
            Demonstration environment. No password is checked and no code is sent. The accounts,
            the roles and the two-factor policy are the configured ones.
          </p>
        </div>
        {aside ? <div className={styles.aside}>{aside}</div> : null}
      </div>
    </main>
  )
}
