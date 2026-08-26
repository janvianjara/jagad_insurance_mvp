import { NavLink, Outlet } from 'react-router'
import { BrandMark } from '../../ui/BrandMark'
import styles from './GalleryLayout.module.css'

/**
 * Dev-only reference shell. One page per primitive group, as P-06a and P-06b
 * each ask for, sharing the token page's header so the design system and the
 * components that consume it read as one document.
 */
const PAGES = [
  { to: '.', label: 'Tokens', end: true },
  { to: 'form', label: 'Form', end: false },
  { to: 'type', label: 'Type', end: false },
  { to: 'signal', label: 'Signal', end: false },
  { to: 'data', label: 'Data', end: false },
  { to: 'surface', label: 'Surface', end: false },
]

export default function GalleryLayout() {
  return (
    <div className={styles.shell}>
      <div className={styles.bar}>
        <BrandMark size="sm" label="Gallery" />
        <nav className={styles.tabs}>
          {PAGES.map((page) => (
            <NavLink
              key={page.label}
              to={page.to}
              end={page.end}
              className={({ isActive }) =>
                isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab
              }
            >
              {page.label}
            </NavLink>
          ))}
        </nav>
        <span className={styles.flag}>dev only</span>
      </div>
      <Outlet />
    </div>
  )
}
