import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { Icon } from '../../ui/Icon'
import { Modal } from '../../ui/surface'
import { EmptyState, Skeleton } from '../../ui/data'
import { RecordId } from '../../ui/type'
import type { User } from '../../domain/permissions'
import { MIN_TERM_LENGTH, flattenHits, globalSearch } from './search-desk'
import type { SearchHit } from './search-desk'
import styles from './GlobalSearch.module.css'

/**
 * How long the field waits before asking. Long enough that typing a name is one
 * query rather than eight, short enough that it still feels like the list is
 * following the keyboard.
 */
const DEBOUNCE_MS = 180

/**
 * The search palette — find any record by name or number, from anywhere.
 *
 * This is the most-used action on an agency desk and the route map never named
 * it: somebody rings, gives a name or a policy number, and the person answering
 * needs the record before the sentence ends. Every queue could already filter
 * itself by free text, so the missing piece was never the search — it was a
 * single place to ask all of them at once.
 *
 * The shape is a palette rather than a page for a reason the IA makes plain: a
 * search is a way of *getting somewhere*, not a destination. It opens over
 * whatever the person was doing, answers, and gets out of the way — nothing is
 * lost behind it and there is no back button to press afterwards.
 *
 * It reuses `<Modal>` rather than portalling a second dialog of its own, so the
 * focus trap, the Escape handler, the scrim and the focus return are the product's
 * one implementation of those and not a fourth. What is added here is only what a
 * palette genuinely differs by: a debounced query, arrow-key traversal across
 * grouped results, and Enter as navigation.
 */
export function GlobalSearch({ onClose, user }: { onClose: () => void; user: User }) {
  const repositories = useRepositories()
  const navigate = useNavigate()

  const [term, setTerm] = useState('')
  const [settled, setSettled] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  /**
   * The highlighted row, tagged with the query it belongs to.
   *
   * Tagged rather than reset, for the same reason `useResource` tags its answer:
   * an effect that calls `setActive(0)` when the term changes is a cascading
   * render, and the lint rule that forbids it is right. Reading the cursor as
   * zero whenever its tag is stale gets the same behaviour with no second
   * render — and it cannot transiently point at row four of a two-row answer,
   * which is how Enter opens the wrong record.
   */
  const [cursor, setCursor] = useState({ token: '', index: 0 })
  const active = cursor.token === settled ? cursor.index : 0

  function moveTo(index: number) {
    setCursor({ token: settled, index })
  }

  useEffect(() => {
    const timer = setTimeout(() => setSettled(term), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term])

  const results = useResource(
    async () => (settled.trim().length < MIN_TERM_LENGTH ? [] : globalSearch(repositories, user, settled)),
    `search:${user.id}:${settled}`,
  )

  const groups = results.data ?? []
  const hits = flattenHits(groups)

  function go(hit: SearchHit | undefined) {
    if (!hit) return
    onClose()
    navigate(hit.to)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (hits.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveTo((active + 1) % hits.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveTo((active - 1 + hits.length) % hits.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      go(hits[active])
    }
  }

  // Keeps the highlighted row inside the scroll port when the arrows walk past
  // its edge. Read off the DOM rather than measured, because the row heights
  // differ between a hit with an insurer number and one without.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const short = settled.trim().length < MIN_TERM_LENGTH
  let rowIndex = -1

  return (
    <Modal
      open
      onClose={onClose}
      title="Search records"
      description="Find a customer, policy, inquiry, quotation, deal, claim or task by name or number."
      size="lg"
      dismissOnScrimClick
    >
      <div className={styles.palette} onKeyDown={onKeyDown}>
        <div className={styles.fieldRow}>
          <Icon name="search" size="md" className={styles.fieldIcon} />
          <input
            className={styles.field}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Name, mobile number, or record number"
            aria-label="Search records"
            aria-controls="global-search-results"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div
          id="global-search-results"
          ref={listRef}
          className={styles.results}
          role="listbox"
          aria-label="Search results"
          aria-busy={results.status === 'loading'}
        >
          {short ? (
            <p className={styles.hint}>
              Type at least {MIN_TERM_LENGTH} characters. Searching only the records this account
              may open.
            </p>
          ) : results.error ? (
            <EmptyState
              variant="error"
              title="The search could not be run"
              explanation={results.error.message}
            />
          ) : results.status === 'loading' ? (
            <div className={styles.loading} aria-hidden="true">
              <Skeleton width="60%" height="1.25rem" />
              <Skeleton width="80%" height="1.25rem" />
              <Skeleton width="45%" height="1.25rem" />
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              title="Nothing matched"
              explanation={`No record this account may open matches "${settled.trim()}". Record numbers, names and mobile numbers are searched; identity numbers are not.`}
            />
          ) : (
            groups.map((group) => (
              <section key={group.kind} className={styles.group}>
                <header className={styles.groupHead}>
                  <h3 className={styles.groupLabel}>{group.label}</h3>
                  <span className={styles.groupCount}>
                    {group.hits.length === group.total
                      ? `${group.total}`
                      : `${group.hits.length} of ${group.total}`}
                  </span>
                </header>

                <ul className={styles.rows}>
                  {group.hits.map((hit) => {
                    rowIndex += 1
                    const index = rowIndex
                    const isActive = index === active
                    return (
                      <li key={`${hit.kind}:${hit.id}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-active={isActive}
                          className={isActive ? `${styles.row} ${styles.rowActive}` : styles.row}
                          onMouseEnter={() => moveTo(index)}
                          onClick={() => go(hit)}
                        >
                          <span className={styles.rowTitle}>{hit.title}</span>
                          <span className={styles.rowIds}>
                            <RecordId
                              systemNo={hit.systemNo}
                              insurerNo={hit.insurerNo}
                              showInsurer={hit.carriesInsurerNo}
                            />
                          </span>
                          <span className={styles.rowDetail}>{hit.detail}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>

                {group.total > group.hits.length ? (
                  <button
                    type="button"
                    className={styles.seeAll}
                    onClick={() => {
                      onClose()
                      navigate(group.seeAllTo)
                    }}
                  >
                    See all {group.total} in {group.label.toLowerCase()}
                    <Icon name="chevron-right" size="sm" />
                  </button>
                ) : null}
              </section>
            ))
          )}
        </div>

        <p className={styles.footNote}>
          Up and down move, Enter opens, Escape closes.
        </p>
      </div>
    </Modal>
  )
}

export default GlobalSearch
