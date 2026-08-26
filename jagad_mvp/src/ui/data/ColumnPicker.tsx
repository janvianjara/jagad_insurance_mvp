import { Icon } from '../Icon'
import { Glyph } from '../surface/Glyph'
import { Popover } from '../surface/Popover'
import styles from './ColumnPicker.module.css'

export type PickableColumn = {
  id: string
  label: string
  visible: boolean
  /** Columns the table cannot function without stay ticked and disabled. */
  canHide?: boolean
}

type ColumnPickerProps = {
  columns: PickableColumn[]
  onToggle: (id: string, visible: boolean) => void
  /** Offered when the current choice differs from the module default. */
  onReset?: () => void
  label?: string
}

/**
 * Which columns a person keeps on screen.
 *
 * Column choice is a per-person working preference, so this control only
 * reports intent; the page decides whether that lives in the URL, in the
 * session, or nowhere.
 */
export function ColumnPicker({
  columns,
  onToggle,
  onReset,
  label = 'Columns',
}: ColumnPickerProps) {
  const hiddenCount = columns.filter((column) => !column.visible).length

  return (
    <Popover
      label="Choose columns"
      placement="bottom-end"
      trigger={(triggerProps) => (
        <button type="button" className={styles.trigger} {...triggerProps}>
          <Icon name="grid" size="sm" />
          <span>{label}</span>
          {hiddenCount > 0 ? <span className={styles.badge}>{hiddenCount} hidden</span> : null}
          <Glyph kind="down" className={styles.chevron} />
        </button>
      )}
    >
      <fieldset className={styles.list}>
        <legend className={styles.legend}>Show these columns</legend>
        {columns.map((column) => {
          const locked = column.canHide === false
          return (
            <label key={column.id} className={styles.item} data-locked={locked ? 'true' : undefined}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={column.visible}
                disabled={locked}
                onChange={(event) => onToggle(column.id, event.target.checked)}
              />
              <span>{column.label}</span>
              {locked ? <span className={styles.lock}>always shown</span> : null}
            </label>
          )
        })}
      </fieldset>
      {onReset ? (
        <button type="button" className={styles.reset} onClick={onReset}>
          Reset to default columns
        </button>
      ) : null}
    </Popover>
  )
}
