import { Link, useSearchParams } from 'react-router'
import styles from './SectionNav.module.css'

export type Section = {
  readonly id: string
  readonly label: string
}

export type SectionNavProps = {
  sections: readonly Section[]
  /** The section shown when the parameter is absent. Its link clears the URL. */
  defaultId: string
  /** The search parameter that holds the section. Never a reserved queue name. */
  param?: string
  label: string
}

/**
 * The section switch a configuration screen wears in its page header.
 *
 * It is links rather than buttons, and the section is a search parameter rather
 * than component state, because §7 puts the tab in the URL with the filter and
 * the page: a colleague sent "the two-factor matrix" should land on the
 * two-factor matrix.
 *
 * The default section's link carries no parameter at all. That matters more than
 * it looks: `<WorkQueue>` writes the whole search string from its own state, so a
 * parameter it does not know about is dropped the moment somebody filters. Only
 * the default section hosts a queue, and the default section is the one spelled
 * by an empty URL — so the queue clearing the parameter leaves the person
 * exactly where they already were.
 */
export function SectionNav({ sections, defaultId, param = 'tab', label }: SectionNavProps) {
  const [params] = useSearchParams()
  const active = params.get(param) ?? defaultId

  return (
    <nav className={styles.nav} aria-label={label}>
      {sections.map((section) => {
        const current = section.id === active
        return (
          <Link
            key={section.id}
            to={{ search: section.id === defaultId ? '' : `?${param}=${section.id}` }}
            className={styles.item}
            data-current={current || undefined}
            aria-current={current ? 'page' : undefined}
          >
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}
