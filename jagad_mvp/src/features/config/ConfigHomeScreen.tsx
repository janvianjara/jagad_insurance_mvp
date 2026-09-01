import { Link } from 'react-router'
// The header only, by its own path — the AppShell index would pull the whole
// shell, and the Assistant panel it mounts, into a screen that needs a title.
import { PageHeader } from '../../components/AppShell/PageHeader'
import { Icon } from '../../ui/Icon'
import type { IconName } from '../../ui/Icon'
import styles from './ConfigHome.module.css'

/**
 * `/config` — the one rail item that twelve used to be.
 *
 * The admin rail declared twenty-six destinations, twelve of them configuration.
 * At 1440x900 the rail cut off mid-item at Commission and every one of those
 * twelve sat below the fold with nothing to say they were there, so the product
 * that sells itself on being configurable hid its configuration.
 *
 * The fix is not a scrollbar. Configuration is not a peer of Inquiries: nobody
 * arrives in the morning intending to visit Masters, they go there because
 * something else sent them. So it becomes one destination with an index, which
 * is the shape `/back-office` already uses for its six queues and the shape
 * every product this one will be compared against uses for settings.
 *
 * It is a LIST, not a grid of cards. This build shows records in rows and it
 * should not grow a second visual language for twelve links.
 */

type ConfigArea = {
  readonly key: string
  readonly title: string
  readonly href: string
  readonly icon: IconName
  /**
   * What is behind the link, in a handful of words.
   *
   * A label, not a lesson: it names the contents so somebody can pick the right
   * row without opening three. Anything longer belongs on the screen it points
   * at, next to the thing it describes.
   */
  readonly holds: string
}

const CONFIG_AREAS: readonly ConfigArea[] = [
  {
    key: 'users',
    title: 'Users',
    href: '/config/users',
    icon: 'users',
    holds: 'Accounts, permission templates, attribute scopes, two-factor',
  },
  {
    key: 'masters',
    title: 'Masters',
    href: '/config/masters',
    icon: 'folder',
    holds: 'Every lookup list in the product, with cascade and versioning',
  },
  {
    key: 'companies',
    title: 'Companies',
    href: '/config/companies',
    icon: 'building',
    holds: 'Insurers, one record per line of business',
  },
  {
    key: 'products',
    title: 'Products',
    href: '/config/products',
    icon: 'book',
    holds: 'Products and the policy-to-benefit map',
  },
  {
    key: 'benefits',
    title: 'Benefits',
    href: '/config/benefits',
    icon: 'grid',
    holds: 'The benefit catalogue the quotation matrix is built from',
  },
  {
    key: 'agencies',
    title: 'Agencies',
    href: '/config/agencies',
    icon: 'building',
    holds: 'Agency master: type, scope, commission percentages',
  },
  {
    key: 'agents',
    title: 'Agents',
    href: '/config/agents',
    icon: 'users',
    holds: 'Agent percentages, sub-agent grants, share caps',
  },
  {
    key: 'forms',
    title: 'Forms',
    href: '/config/forms',
    icon: 'edit',
    holds: 'The schema builder: stages, fields, branching, versions',
  },
  {
    key: 'templates',
    title: 'Templates',
    href: '/config/templates',
    icon: 'msg',
    holds: 'Message templates per channel and event',
  },
  {
    key: 'integrations',
    title: 'Integrations',
    href: '/config/integrations',
    icon: 'plug',
    holds: 'WhatsApp, SMS and email providers',
  },
  {
    key: 'automation',
    title: 'Automation',
    href: '/config/automation',
    icon: 'spark',
    holds: 'Recipes — trigger, condition, action — and the run log',
  },
  {
    key: 'compliance',
    title: 'Compliance',
    href: '/config/compliance',
    icon: 'lock',
    holds: 'Consent, retention classes, audit search',
  },
]

export function ConfigHomeScreen() {
  return (
    <div className={styles.screen}>
      <PageHeader title="Settings" />

      <ul className={styles.list} aria-label="Configuration areas">
        {CONFIG_AREAS.map((area) => (
          <li key={area.key}>
            <Link className={styles.row} to={area.href}>
              <Icon name={area.icon} size="md" className={styles.icon} />
              <span className={styles.text}>
                <span className={styles.title}>{area.title}</span>
                <span className={styles.holds}>{area.holds}</span>
              </span>
              <Icon name="chevron-right" size="sm" className={styles.go} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ConfigHomeScreen
