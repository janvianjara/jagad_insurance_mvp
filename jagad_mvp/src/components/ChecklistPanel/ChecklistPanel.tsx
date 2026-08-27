import type { ReactNode } from 'react'
import { Icon } from '../../ui/Icon'
import { StatusPill } from '../../ui/signal'
import { CHECKLIST_STATE_READING, checklistProgress, isOnFile } from './checklist-item'
import type { ChecklistItem } from './checklist-item'
import styles from './ChecklistPanel.module.css'

export type ChecklistPanelProps = {
  items: readonly ChecklistItem[]
  /** Where the list came from — "HDFC Ergo · KYC". Says why these items and not others. */
  source?: string
  /** Rendered against one line: a "record received" control on an outstanding item. */
  renderAction?: (item: ChecklistItem) => ReactNode
  emptyText?: string
  label?: string
  className?: string
}

/**
 * The per-product document checklist, and the gate that reads off it.
 *
 * Two decisions worth stating. The count is rendered, always, because "3 of 4 on
 * file" is the number the completeness gate is actually evaluating and hiding it
 * would leave a disabled button with no explanation — the failure mode this
 * build keeps designing against. And an outstanding line is lime rather than
 * red: a document nobody has sent yet needs a person, it is not an error
 * (charter U7).
 *
 * The list is configuration. Its wording comes from the `DocChecklist` an admin
 * edits, so nothing in this component names a document.
 */
export function ChecklistPanel({
  items,
  source,
  renderAction,
  emptyText = 'No checklist is configured for this product, so there is nothing to collect. Add one against the company or the product in configuration.',
  label = 'Document checklist',
  className,
}: ChecklistPanelProps) {
  const progress = checklistProgress(items)

  if (items.length === 0) {
    return (
      <p className={styles.empty} data-checklist="empty">
        {emptyText}
      </p>
    )
  }

  return (
    <div className={[styles.panel, className].filter(Boolean).join(' ')}>
      <p className={styles.progress} data-complete={progress.complete ? 'true' : 'false'}>
        <span className={styles.count}>
          {progress.onFile} of {progress.total} on file
        </span>
        {source ? <span className={styles.source}>{source}</span> : null}
      </p>

      <ul className={styles.list} aria-label={label}>
        {items.map((item) => {
          const reading = CHECKLIST_STATE_READING[item.state]
          const onFile = isOnFile(item)
          const action = renderAction?.(item)

          return (
            <li
              key={item.key}
              className={styles.item}
              data-checklist-item={item.key}
              data-state={item.state}
            >
              <span className={styles.mark} data-on-file={onFile ? 'true' : 'false'}>
                <Icon name={onFile ? 'check' : 'alert'} size="sm" />
              </span>

              <div className={styles.text}>
                <span className={styles.label}>{item.label}</span>
                {item.note ? <span className={styles.note}>{item.note}</span> : null}
              </div>

              <StatusPill tone={reading.tone}>{reading.label}</StatusPill>
              {action ? <span className={styles.action}>{action}</span> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
