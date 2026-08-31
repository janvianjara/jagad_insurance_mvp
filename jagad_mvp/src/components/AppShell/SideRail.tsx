import { NavLink } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { visibleNavigation } from '../../app/navigation'
import type { NavItem } from '../../app/navigation'
import type { User } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { BrandMark } from '../../ui/BrandMark'
import { Icon } from '../../ui/Icon'
import { CountChip } from '../../ui/signal'
import { RoleSwitcher } from './RoleSwitcher'
import styles from './SideRail.module.css'

/**
 * One live queue depth.
 *
 * Its own component so each count owns its own load: the rail paints
 * immediately and each number arrives when its repository answers, rather than
 * the whole rail waiting on the slowest query. A count that has not arrived
 * renders nothing at all — a zero that later turns into four is worse than a
 * blank, because somebody will act on the zero.
 */
function NavCountChip({ item, user }: { item: NavItem; user: User }) {
  const repositories = useRepositories()
  const count = item.count
  const depth = useResource(
    async () => (count ? count(repositories, user) : 0),
    `${item.key}:${user.id}`,
  )

  if (depth.status !== 'ready' || depth.data === null) return null

  return (
    <CountChip
      count={depth.data}
      tone={item.countTone ?? 'neutral'}
      label={item.countLabel ?? item.label}
      className={styles.count}
    />
  )
}

function RailItem({ item, user }: { item: NavItem; user: User }) {
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.end}
        className={({ isActive }) => (isActive ? `${styles.item} ${styles.itemActive}` : styles.item)}
      >
        <Icon name={item.icon} size="md" className={styles.itemIcon} />
        <span className={styles.itemLabel}>{item.label}</span>
        {item.count ? <NavCountChip item={item} user={user} /> : null}
      </NavLink>
    </li>
  )
}

/**
 * The 240px rail from the §3 diagram: brand, sectioned navigation with live
 * counts, the person and their role in the footer.
 *
 * What renders is decided entirely by `can()` — `visibleNavigation` filters the
 * same typed configuration the router guards read, so there is no way for the
 * rail to offer a screen the guard would refuse.
 *
 * Search sits directly under the brand and above the first section, because it
 * is not one of the destinations: it is how a person gets to any of them when
 * they have a name or a number rather than a queue in mind. It carries its
 * shortcut on its face so the keyboard path is discoverable from the mouse one -
 * a shortcut nobody is told about is a shortcut nobody uses.
 */
export function SideRail({ user, onOpenSearch }: { user: User; onOpenSearch: () => void }) {
  const sections = visibleNavigation(user)

  return (
    <div className={styles.rail}>
      <div className={styles.brand}>
        <BrandMark size="sm" />
      </div>

      <button type="button" className={styles.search} onClick={onOpenSearch}>
        <Icon name="search" size="md" className={styles.itemIcon} />
        <span className={styles.itemLabel}>Search</span>
        <kbd className={styles.shortcut}>Cmd /</kbd>
      </button>

      <nav className={styles.nav} aria-label="Main">
        {sections.map((section) => (
          <div className={styles.section} key={section.key}>
            <h2 className={styles.sectionLabel}>{section.label}</h2>
            <ul className={styles.items}>
              {section.items.map((item) => (
                <RailItem key={item.key} item={item} user={user} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <RoleSwitcher />
    </div>
  )
}
