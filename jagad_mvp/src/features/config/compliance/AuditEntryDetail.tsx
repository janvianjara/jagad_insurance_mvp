import { DateTime } from '../../../ui/type'
import type { AuditEntry } from './audit-trail'
import layout from '../shared/config-layout.module.css'

/**
 * One entry, in full. Nothing is here that was not on the row: the trail holds
 * metadata, and a drawer that went further would be reading fields the builder
 * of the trail deliberately never touched.
 */
export function AuditEntryDetail({ entry }: { entry: AuditEntry }) {
  return (
    <div className={layout.tight}>
      <p>{entry.detail}</p>
      <p className={layout.mono}>
        {`${entry.actor} · `}
        <DateTime value={entry.at} mode="datetime" />
        {entry.recordNo === null ? '' : ` · ${entry.recordNo}`}
        {entry.retentionClass === null ? '' : ` · retained as ${entry.retentionClass}`}
      </p>
    </div>
  )
}
