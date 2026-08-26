import { useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import styles from './Tabs.module.css'

export type TabItem = {
  id: string
  label: string
  /** Queue depth or result count. Live numbers are the point of the tab strip. */
  count?: number
  disabled?: boolean
}

type TabsProps = {
  tabs: TabItem[]
  /** Controlled selection. Queue views drive this from the URL, per the state rules. */
  value?: string
  defaultValue?: string
  onChange?: (id: string) => void
  children?: (activeId: string) => ReactNode
  /** Accessible name for the strip when the surrounding heading is not enough. */
  label?: string
}

/**
 * Tab strip with the roving-tabindex keyboard model: one stop for the whole
 * strip, arrows move between tabs, Home and End jump to the ends.
 */
export function Tabs({ tabs, value, defaultValue, onChange, children, label }: TabsProps) {
  const [ownValue, setOwnValue] = useState(defaultValue ?? tabs[0]?.id ?? '')
  const listRef = useRef<HTMLDivElement>(null)
  const baseId = useId()

  const activeId = value ?? ownValue

  function select(id: string) {
    setOwnValue(id)
    onChange?.(id)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const enabled = tabs.filter((tab) => !tab.disabled)
    if (enabled.length === 0) return
    const current = enabled.findIndex((tab) => tab.id === activeId)

    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (current + 1) % enabled.length
    else if (event.key === 'ArrowLeft') nextIndex = (current - 1 + enabled.length) % enabled.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = enabled.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const next = enabled[nextIndex]
    select(next.id)
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus()
  }

  return (
    <div className={styles.root}>
      <div ref={listRef} role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === activeId
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              data-tab-id={tab.id}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              className={styles.tab}
              onClick={() => select(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.count === undefined ? null : <span className={styles.count}>{tab.count}</span>}
            </button>
          )
        })}
      </div>
      {children ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${activeId}`}
          aria-labelledby={`${baseId}-tab-${activeId}`}
          tabIndex={0}
          className={styles.panel}
        >
          {children(activeId)}
        </div>
      ) : null}
    </div>
  )
}
